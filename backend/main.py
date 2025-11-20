from fastapi import FastAPI, HTTPException, Body, Query
from fastapi.middleware.cors import CORSMiddleware
import os
from pathlib import Path
from dotenv import load_dotenv
import json
import re
from collections import Counter
from supabase import create_client, Client
from pydantic import BaseModel
from typing import Optional
import datetime
import requests

# Load environment variables (try local .env, then project root .env)
load_dotenv()  # load backend/.env if present
try:
    project_root_env = (Path(__file__).resolve().parent.parent / '.env')
    if project_root_env.exists():
        load_dotenv(dotenv_path=project_root_env, override=False)
except Exception:
    pass

app = FastAPI(title="Integra AI Backend", description="Financial AI Analysis API")
USE_GROQ = os.getenv("ENABLE_GROQ_SENTIMENT", "0").lower() in {"1", "true", "yes"}

# Extra domain noise and finance lexicon
_NOISY_TERMS = {
    'nyse','nasdaq','tsx','lse','asx','amex','otc',
    'inc','corp','ltd','llc','plc','co','company','group','holdings',
    'press','newswire','globenewswire','pr','prnewswire','release',
    'city','oct','nov','dec','jan','feb','mar','apr','jun','jul','aug','sep','sept',
    'rddt','reddit','benzinga','marketwatch','seekingalpha','yahoo','reuters','bloomberg',
    'crypto','cryptocurrency','token','presale','airdrops','airdrop'
}
_FINANCE_LEXICON = {
    'rate','rates','yield','yields','treasury','treasuries','bond','bonds',
    'cpi','ppi','inflation','disinflation','deflation','deflator',
    'gdp','jobs','unemployment','payrolls','pmi','ism','guidance','earnings','revenue','margin','margins',
    'buyback','dividend','valuation','liquidity','volatility','recession','growth','outlook','forecast','upgrade','downgrade',
    'opec','inventory','supply','demand','production','exports','import','sanctions','geopolitical','risk','etf','inflows','outflows',
    'ipo','listing','merger','acquisition','deal','approval','sec','regulator','policy',
    'fed','federal','reserve','powell','dot','dots','curve','flattening','steepening',
    'oil','gas','gold','wheat','copper','silver','commodities','fx','usd','dxy','equities','stocks','index',
    'bullish','bearish','signal','signals','indicator','indicators','alert','alerts','inflow','outflow',
    'share','shares','price','prices','volume','volumes','breakout','support','resistance','options','futures','spot',
    'intraday','trend','momentum','credit','spread','spreads','cash','debt','yoy','qoq',
    'options','option','activity','fibonacci','pattern','patterns','continuation','breakout','breakdown','whales'
}

# Action/trigger words we want in drivers
_TRIGGER_TERMS = {
    'cut','hike','cuts','hikes','lower','raise','raises','raised','lowered','slashed','increase','decrease','reduces','reduced',
    'surge','surges','rally','rallies','spike','spikes','jump','jumps','rise','rises','rose','climb','climbs','gains','gain',
    'drop','drops','fell','fall','falls','slump','slumps','slide','slides','decline','declines','plunge','plunges',
    'approve','approves','approval','approved','reject','rejected','rejects','delay','delays','delayed',
    'warn','warns','warning','guidance','beats','misses','miss','beat','forecast','forecasts','outlook','downgrade','downgrades','upgrade','upgrades',
    'launch','launches','rollout','announce','announces','announced','sanction','sanctions'
}

_TICKER_EXCH_RE = re.compile(r"\b(?:NYSE|NASDAQ|TSX|LSE|ASX|AMEX)\s*:\s*[A-Z0-9.\-]+\b")
_CRYPTO_TICKER_RE = re.compile(r"\b\(\s*CRYPTO\s*:\s*[A-Z0-9.\-]+\s*\)")
_DATELINE_RE = re.compile(r"^[A-Z][A-Z .'\-]+,\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b.*?—\s*", re.MULTILINE)

def _clean_text_for_keywords(text: str) -> str:
    if not text:
        return ''
    t = text
    # Strip exchange tickers and crypto tickers
    t = _TICKER_EXCH_RE.sub(' ', t)
    t = _CRYPTO_TICKER_RE.sub(' ', t)
    # Remove common newswire boilerplate and datelines
    t = _DATELINE_RE.sub(' ', t)
    t = re.sub(r"\b(?:GlobeNewswire|Globe\s+Newswire|PR\s*Newswire|Benzinga|Reuters|Bloomberg|MarketWatch)\b", ' ', t, flags=re.I)
    # Normalize quotes/punct spacing
    t = t.replace("’", " ").replace("'", " ").replace('“',' ').replace('”',' ')
    t = re.sub(r"[^\w\s'\-]", ' ', t)
    t = re.sub(r"\s+", ' ', t).strip()
    return t

# Add CORS middleware to allow requests from your React Native app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your app's domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Get Supabase URL and Key from environment variables
supabase_url: str = os.getenv("SUPABASE_URL")
supabase_key: str = os.getenv("SUPABASE_KEY")

if not supabase_url or not supabase_key:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_KEY environment variables")

supabase: Client = create_client(supabase_url, supabase_key)

# Pydantic models for request/response
class SentimentRequest(BaseModel):
    text: str
    user_id: Optional[str] = None
    commodity: Optional[str] = None
    enhanced: Optional[bool] = None

class SentimentResponse(BaseModel):
    text: str
    sentiment: str
    confidence: float
    timestamp: str
    prob_positive: Optional[float] = None
    prob_negative: Optional[float] = None
    prob_neutral: Optional[float] = None


def _now_iso() -> str:
    return datetime.datetime.now().isoformat()


def _sample_news_articles():
    now = _now_iso()
    return [
        {
            "title": "OPEC Signals Output Stability as Demand Outlook Improves",
            "summary": "Producers kept supply guidance unchanged while forecasting tighter inventories into Q1.",
            "source": "Bloomberg",
            "source_url": "https://www.bloomberg.com",
            "time_published": now,
            "ensemble_sentiment": "BULLISH",
            "sentiment_score": 0.71,
            "tickers": ["OIL"],
        },
        {
            "title": "Gold Finds Support as Treasury Yields Cool",
            "summary": "Safe-haven demand returned after softer US data eased expectations of additional hikes.",
            "source": "Reuters",
            "source_url": "https://www.reuters.com",
            "time_published": now,
            "ensemble_sentiment": "NEUTRAL",
            "sentiment_score": 0.48,
            "tickers": ["GOLD"],
        },
        {
            "title": "Grain Markets Mixed Amid Weather Concerns",
            "summary": "Drought conditions in the Midwest are offset by improved rainfall patterns in Eastern Europe.",
            "source": "MarketWatch",
            "source_url": "https://www.marketwatch.com",
            "time_published": now,
            "ensemble_sentiment": "BEARISH",
            "sentiment_score": 0.38,
            "tickers": ["WHEAT", "CORN"],
        },
    ]


def _commodities_to_topics(commodities):
    """Map user commodities to Alpha Vantage NEWS_SENTIMENT valid topics.

    Valid topics include: financial_markets, economy_fiscal, economy_monetary,
    economy_macro, energy_transportation, finance, life_sciences, manufacturing,
    retail_wholesale, real_estate, technology, utilities, earnings, mergers_and_acquisitions, ipo.
    """
    defaults = [
        "financial_markets",
        "economy_macro",
        "economy_monetary",
        "economy_fiscal",
    ]
    if not commodities:
        return defaults
    topics = set()
    for c in commodities:
        u = (c or "").upper()
        if u in {"OIL", "NAT GAS", "GAS", "WTI", "BRENT"}:
            topics.add("energy_transportation")
        elif u in {"GOLD", "SILVER", "COPPER", "PLATINUM"}:
            topics.add("financial_markets")
        elif u in {"WHEAT", "CORN", "SOYBEAN", "SOYBEANS"}:
            topics.add("manufacturing")
    if not topics:
        topics = set(defaults)
    # Always include broad market topics for backfill
    topics.update(defaults)
    return list(topics)


def _time_from_param(hours=48):
    dt = datetime.datetime.utcnow() - datetime.timedelta(hours=hours)
    return dt.strftime("%Y%m%dT%H%M")


def _alpha_label_to_sentiment(label):
    if not label:
        return "NEUTRAL"
    l = label.strip().upper()
    if "BULL" in l:
        return "BULLISH"
    if "BEAR" in l:
        return "BEARISH"
    return "NEUTRAL"


def _groq_sentiment_analysis(text: str):
    """Use GROQ for sentiment analysis with better accuracy"""
    if not USE_GROQ:
        return None
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key or not text:
        return None
    try:
        prompt = f"""Analyze the sentiment of this financial text and return ONLY a JSON object with these exact keys:
- sentiment: one of 'positive', 'negative', or 'neutral'
- confidence: a decimal between 0.5 and 1.0
- bullish_probability: decimal between 0 and 1
- bearish_probability: decimal between 0 and 1
- neutral_probability: decimal between 0 and 1
(probabilities should sum to 1)

Text: {text[:500]}

JSON:"""
        
        r = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
            json={
                "model": "mixtral-8x7b-32768",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 200,
            },
            timeout=10,
        )
        r.raise_for_status()
        response = r.json()
        content = response['choices'][0]['message']['content']
        # Parse JSON from response
        import json as jsonlib
        data = jsonlib.loads(content.strip())
        return {
            "label": data.get("sentiment", "neutral"),
            "confidence": float(data.get("confidence", 0.5)),
            "prob_positive": float(data.get("bullish_probability", 0.33)),
            "prob_negative": float(data.get("bearish_probability", 0.33)),
            "prob_neutral": float(data.get("neutral_probability", 0.34)),
        }
    except Exception as e:
        # Suppress noisy auth errors in dev; gracefully fall back
        print(f"[groq] sentiment failed (fallback used): {e}")
        return None

def _hf_finbert_infer(text: str):
    """Try HuggingFace FinBERT, fallback to GROQ if it fails"""
    token = os.getenv("HUGGING_FACE_TOKEN")
    if not token or not text:
        return _groq_sentiment_analysis(text)
    try:
        r = requests.post(
            "https://api-inference.huggingface.co/models/ProsusAI/finbert",
            headers={"Authorization": f"Bearer {token}"},
            json={"inputs": text, "options": {"wait_for_model": True}},
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
        scores = data[0] if isinstance(data, list) and len(data) > 0 and isinstance(data[0], list) else data
        label_map = { (d.get("label") or "").lower(): float(d.get("score") or 0.0) for d in (scores or []) }
        p_pos = float(label_map.get("positive", 0.0))
        p_neg = float(label_map.get("negative", 0.0))
        p_neu = float(label_map.get("neutral", 0.0))
        # pick top
        top_label = max([(p_pos, "positive"), (p_neg, "negative"), (p_neu, "neutral")], key=lambda x: x[0])[1]
        top_conf = max(p_pos, p_neg, p_neu)
        return {
            "label": top_label,
            "confidence": float(top_conf),
            "prob_positive": p_pos,
            "prob_negative": p_neg,
            "prob_neutral": p_neu,
        }
    except Exception as e:
        print(f"[finbert] failed: {e}, trying GROQ...")
        return _groq_sentiment_analysis(text)


def _advanced_heuristic_sentiment(text: str):
    """Advanced rule-based sentiment analysis for financial text"""
    text_lower = text.lower()
    
    # Financial sentiment lexicon with weights
    bullish_terms = {
        'surge': 3, 'soar': 3, 'rally': 3, 'jump': 2, 'gain': 2, 'rise': 2, 'climb': 2,
        'upgrade': 3, 'beat': 3, 'exceed': 2, 'outperform': 3, 'strong': 2, 'robust': 2,
        'profit': 2, 'growth': 2, 'expand': 2, 'improve': 2, 'boost': 2, 'advance': 2,
        'bullish': 3, 'positive': 2, 'optimistic': 2, 'recover': 2, 'rebound': 2,
        'high': 1, 'increase': 2, 'up': 1, 'buy': 2, 'accumulate': 2, 'breakout': 3
    }
    
    bearish_terms = {
        'plunge': 3, 'crash': 3, 'collapse': 3, 'tumble': 2, 'fall': 2, 'drop': 2, 'decline': 2,
        'downgrade': 3, 'miss': 3, 'disappoint': 2, 'underperform': 3, 'weak': 2, 'poor': 2,
        'loss': 2, 'deficit': 2, 'shrink': 2, 'worsen': 2, 'cut': 2, 'reduce': 2,
        'bearish': 3, 'negative': 2, 'pessimistic': 2, 'risk': 1, 'concern': 1,
        'low': 1, 'decrease': 2, 'down': 1, 'sell': 2, 'avoid': 2, 'breakdown': 3
    }
    
    neutral_terms = {
        'stable': 2, 'steady': 2, 'unchanged': 2, 'flat': 2, 'maintain': 2, 'hold': 2,
        'range': 1, 'sideways': 2, 'consolidate': 2, 'mixed': 2, 'moderate': 1
    }
    
    # Calculate weighted scores
    bull_score = sum(weight for term, weight in bullish_terms.items() if term in text_lower)
    bear_score = sum(weight for term, weight in bearish_terms.items() if term in text_lower)
    neut_score = sum(weight for term, weight in neutral_terms.items() if term in text_lower)
    
    # Add context modifiers
    if 'not' in text_lower or "n't" in text_lower or 'no ' in text_lower:
        # Negation detected - swap bullish and bearish scores
        bull_score, bear_score = bear_score * 0.8, bull_score * 0.8
    
    # Normalize scores
    total = bull_score + bear_score + neut_score
    if total == 0:
        # No clear signals, default to neutral
        return {
            'sentiment': 'neutral',
            'confidence': 0.5,
            'prob_positive': 0.33,
            'prob_negative': 0.33,
            'prob_neutral': 0.34
        }
    
    # Calculate probabilities
    prob_bull = bull_score / total
    prob_bear = bear_score / total  
    prob_neut = max(0.1, neut_score / total)  # Ensure minimum neutral probability
    
    # Normalize to sum to 1
    total_prob = prob_bull + prob_bear + prob_neut
    prob_bull /= total_prob
    prob_bear /= total_prob
    prob_neut /= total_prob
    
    # Determine dominant sentiment
    if prob_bull > prob_bear and prob_bull > prob_neut:
        sentiment = 'positive'
        confidence = min(0.95, 0.5 + prob_bull)
    elif prob_bear > prob_bull and prob_bear > prob_neut:
        sentiment = 'negative'
        confidence = min(0.95, 0.5 + prob_bear)
    else:
        sentiment = 'neutral'
        confidence = 0.5 + abs(prob_neut - 0.33)
    
    return {
        'sentiment': sentiment,
        'confidence': round(confidence, 3),
        'prob_positive': round(prob_bull, 3),
        'prob_negative': round(prob_bear, 3),
        'prob_neutral': round(prob_neut, 3)
    }

_STOPWORDS = {
    "the","and","for","with","from","that","this","are","was","were","will","has","have","had","its","their","they","them","into","over","more","less","very","today","announced","introduces","introduced","launches","launch","new","research","report","company","market","prices","price","data","news","press","release","about","across","among","also","after","before","while","than","then","as","on","of","in","to","at","by","an","a","is","it","be","we","you","our","us","can","may","might","could","should","would","said","says","saying","based","using","via","per"
}


def _extract_keywords_simple(text: str, topn: int = 10):
    if not text:
        return []
    words = re.findall(r"[A-Za-z][A-Za-z\-]+", text.lower())
    tokens = [w for w in words if len(w) >= 3 and w not in _STOPWORDS]
    if not tokens:
        return []
    counts = Counter(tokens)
    maxf = max(counts.values()) or 1
    kws = []
    for w, f in counts.most_common(topn):
        score = round(0.4 + 0.6 * (f / maxf), 2)
        kws.append({"word": w, "sentiment": "neutral", "score": score})
    return kws


def _extract_keywords(text: str, topn: int = 10):
    if not text:
        return []
    txt = _clean_text_for_keywords(text).lower()
    tokens = re.findall(r"[a-z][a-z\-']+", txt)
    if not tokens:
        return []
    extra_sw = {
        'today','yesterday','monday','tuesday','wednesday','thursday','friday','saturday','sunday',
        'january','february','march','april','may','june','july','august','september','october','november','december',
        'year','years','month','months','week','weeks','percent','percentage','bps','basis','points',
        'above','below','back','around','near','nearly','roughly','amid','after','before',
        'why','what','looks','says','said','via','according','people','told','source','sources'
    }
    stop = _STOPWORDS | extra_sw
    phrases = []
    current = []
    for t in tokens:
        if len(t) < 3 or t in stop:
            if current:
                phrases.append(current)
                current = []
        else:
            current.append(t)
    if current:
        phrases.append(current)
    if not phrases:
        return []

    freq = Counter([w for p in phrases for w in p])
    degree = Counter()
    for p in phrases:
        l = len(p)
        for w in p:
            degree[w] += l - 1
    word_score = {w: (degree[w] + freq[w]) / float(freq[w]) for w in freq}

    def avg_score(ws):
        return sum(word_score.get(w, 1.0) for w in ws) / max(1, len(ws))

    candidates = []
    # Build 2–4-gram candidates within each phrase boundary to keep phrases concise
    for p in phrases:
        for n in (2, 3, 4):
            if len(p) >= n:
                for i in range(len(p) - n + 1):
                    gram = p[i:i+n]
                    candidates.append((' '.join(gram), avg_score(gram)))
    filtered = [t for t in tokens if len(t) >= 3 and t not in stop]
    # Global bigrams/trigrams as backup
    for i in range(len(filtered) - 1):
        bi = filtered[i:i+2]
        candidates.append((' '.join(bi), avg_score(bi)))
    for i in range(len(filtered) - 2):
        tri = filtered[i:i+3]
        candidates.append((' '.join(tri), avg_score(tri)))

    if not candidates:
        return _extract_keywords_simple(text, topn)

    # Apply penalties/boosts and deduplicate similar phrases
    _PHRASE_NOISE = [
        re.compile(r"\bglobe\s+newswire\b"),
        re.compile(r"\bpress\s+release\b"),
        re.compile(r"\bcity\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b"),
        re.compile(r"\b(?:nyse|nasdaq|tsx|lse|asx|amex)\b.*\b(?:inc|corp|ltd|llc|plc)\b"),
        re.compile(r"\breddit\b"),
        re.compile(r"\bwhat\s+s?the\b"),
        re.compile(r"\bwe\s+noticed\s+today\b"),
        re.compile(r"\binvestors\s+with\s+a\s+lot\s+of\s+money\b"),
        re.compile(r"\bleaving\s+traders\b"),
        re.compile(r"\bboth\s+meme\s+tokens\b")
    ]
    def jaccard(a: str, b: str) -> float:
        sa, sb = set(a.split()), set(b.split())
        inter = len(sa & sb)
        union = len(sa | sb) or 1
        return inter / union

    scored = []
    for phrase, raw in candidates:
        words = phrase.split()
        if len(words) < 2:
            continue
        if len(words) > 5 or len(phrase) > 42:
            continue
        # filter phrases that are mostly noisy terms
        noisy_count = sum(1 for w in words if w in _NOISY_TERMS)
        lex_count = sum(1 for w in words if w in _FINANCE_LEXICON)
        trig_count = sum(1 for w in words if w in _TRIGGER_TERMS)
        # drop if phrase matches explicit noisy patterns
        if any(p.search(phrase) for p in _PHRASE_NOISE):
            continue
        # drop if more than half tokens are noisy and no finance tokens
        if noisy_count >= max(1, int(0.5 * len(words))) and lex_count == 0:
            continue
        # base score
        score = raw
        # boost if contains finance lexicon; penalize if contains noisy tokens
        if lex_count > 0:
            score *= 1.0 + min(0.4, 0.1 * lex_count)
        # prefer triggers; if none, apply mild penalty but still allow
        if trig_count == 0:
            score *= 0.8
        if noisy_count > 0:
            score *= 0.6
        scored.append((phrase, score, lex_count, trig_count))

    if not scored:
        return _extract_keywords_simple(text, topn)

    # Normalize and select unique phrases by Jaccard
    max_raw = max(x[1] for x in scored) or 1.0
    items = []
    for phrase, s, lx, tx in sorted(scored, key=lambda x: x[1], reverse=True):
        # Ensure at least one finance lexicon word is present
        if lx <= 0:
            continue
        if len(phrase.split()) > 5 or len(phrase) > 42:
            continue
        if any(jaccard(phrase, it["word"]) >= 0.7 for it in items):
            continue
        norm_score = round(0.55 + 0.45 * (s / max_raw), 2)
        items.append({"word": phrase, "sentiment": "neutral", "score": norm_score})
        if len(items) >= topn:
            break

    # Backfill if too sparse: take top raw candidates (noisy filtered), bigrams+, until at least 3 items
    if len(items) < min(3, topn):
        added = 0
        for phrase, raw in sorted(candidates, key=lambda x: x[1], reverse=True):
            if len(phrase.split()) < 2:
                continue
            if len(phrase.split()) > 5 or len(phrase) > 42:
                continue
            if any(p.search(phrase) for p in _PHRASE_NOISE):
                continue
            if any(jaccard(phrase, it["word"]) >= 0.7 for it in items):
                continue
            norm_score = round(0.5 + 0.5 * (raw / max_raw), 2)
            items.append({"word": phrase, "sentiment": "neutral", "score": norm_score})
            added += 1
            if len(items) >= max(3, topn):
                break

    return items


def _extract_keywords_nltk(text: str, topn: int = 2):
    """NLTK-based NP extractor yielding varied, concise phrases. Falls back on exceptions."""
    try:
        import nltk  # type: ignore
        try:
            from nltk.tokenize import wordpunct_tokenize as _tok
        except Exception:
            _tok = None
        from nltk import pos_tag
        from nltk.chunk import RegexpParser
        from nltk.corpus import stopwords as _nltk_sw

        sw = set(_nltk_sw.words('english')) if hasattr(_nltk_sw, 'words') else set()
        sw |= set(_STOPWORDS)

        toks = (_tok(text) if _tok else re.findall(r"\w+", text or ""))
        words = [w for w in toks if re.match(r"^[A-Za-z][A-Za-z\-]+$", w)]
        if not words:
            return []
        lowers = [w.lower() for w in words]
        tagged = pos_tag(lowers)
        grammar = r"NP: {<JJ.*>*<NN.*>+}"
        chunker = RegexpParser(grammar)
        tree = chunker.parse(tagged)

        # score by inverse token frequency + length bonus, enforce 2-4 tokens
        freq = Counter([w for w,_ in tagged])
        phrases = []
        for subtree in tree.subtrees(lambda t: t.label() == 'NP'):
            phrase_tokens = [w for w,_ in subtree.leaves() if len(w) >= 2 and w not in sw and w not in _NOISY_TERMS]
            if len(phrase_tokens) < 2 or len(phrase_tokens) > 4:
                continue
            phrase = ' '.join(phrase_tokens)
            if len(phrase) > 42:
                continue
            score = sum(1.0 / max(1, freq[w]) for w in phrase_tokens) + 0.1 * (len(phrase_tokens) - 2)
            phrases.append((phrase, score))
        if not phrases:
            return []
        # dedup and sort
        seen = set()
        out = []
        for ph, sc in sorted(phrases, key=lambda x: x[1], reverse=True):
            if ph in seen:
                continue
            seen.add(ph)
            out.append({"word": ph, "sentiment": "neutral", "score": round(min(1.0, 0.5 + sc), 2)})
            if len(out) >= topn:
                break
        return out
    except Exception:
        return []

def _concept_drivers(text: str, maxn: int = 2):
    """Generate 1–2 clean, human-friendly drivers by pattern matching common finance scenarios."""
    if not text:
        return []
    t = (text or "").lower()
    drivers = []
    def add(label: str, score: float = 0.98):
        if label and all(d["word"].lower() != label.lower() for d in drivers):
            drivers.append({"word": label, "sentiment": "neutral", "score": round(score, 2)})

    # Earnings
    if re.search(r"\b(earnings|eps|quarter|q[1-4]|results|profit|revenue)\b", t):
        add("Earnings preview", 0.99)
    # Options flow
    if re.search(r"\b(option|options|unusual|whale)s?\b", t) and re.search(r"\b(activity|flow|trade|trades|trading)\b", t):
        add("Options flow signal", 0.97)
    # Fed/rates
    if re.search(r"\b(fed|federal reserve|powell)\b", t) and re.search(r"\b(rate|rates|cut|hike|cuts|hikes)\b", t):
        add("Fed rate outlook", 0.97)
    # Treasuries/bonds move
    if re.search(r"\b(treasury|treasuries|bond|bonds|yield|yields)\b", t) and re.search(r"\b(rise|surge|jump|spike|fall|drop|slump|slide)\b", t):
        add("Treasury yield move", 0.96)
    # OPEC/supply/demand
    if re.search(r"\b(opec|inventory|output|production|supply|demand)\b", t) and re.search(r"\b(oil|crude|brent|wti)\b", t):
        add("Oil supply/demand shift", 0.96)
    # Technical pattern
    if re.search(r"\b(fibonacci|pattern|continuation|breakout|breakdown)\b", t):
        add("Technical pattern signal", 0.95)
    # Regulatory
    if re.search(r"\b(sec|regulator|approval|approves|approved)\b", t):
        add("Regulatory approval", 0.95)
    # Corporate actions
    if re.search(r"\b(merger|acquisition|acquires|buyout|deal)\b", t):
        add("M&A announcement", 0.95)
    # Rollout/launch
    if re.search(r"\b(launch|rollout|deployment|go-?live|deploy|roll out)\b", t):
        add("Product/tech launch", 0.94)
    # Crypto sentiment
    if re.search(r"\b(bitcoin|ethereum|xrp|doge|shib|crypto)\b", t) and re.search(r"\b(bearish|bullish|crash|rally)\b", t):
        add("Crypto sentiment shift", 0.94)

    return drivers[:maxn]

def _fetch_live_news(commodities, hours=72):
    api_key = os.getenv("ALPHA_VANTAGE_API_KEY")
    # Simple file cache helpers (defined early so we can use when key is missing)
    def _cache_path():
        p = Path(__file__).resolve().parent / "data"
        try:
            p.mkdir(exist_ok=True)
        except Exception:
            pass
        return p / "news_cache.json"

    def _read_cache():
        try:
            with open(_cache_path(), "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {"articles": []}

    def _write_cache(arts: list):
        try:
            with open(_cache_path(), "w", encoding="utf-8") as f:
                json.dump({"articles": arts, "saved_at": _now_iso()}, f)
        except Exception:
            pass

    if not api_key:
        cached = _read_cache()
        if isinstance(cached.get("articles"), list) and len(cached["articles"]) > 0:
            print(f"[news/cache] returning cached articles (no API key): {len(cached['articles'])}")
            return cached
        print("[news] missing ALPHA_VANTAGE_API_KEY and no cache available")
        return {"articles": []}
    base_params = {
        "function": "NEWS_SENTIMENT",
        "sort": "LATEST",
        "time_from": _time_from_param(int(hours) if hours else 72),
        "limit": 50,
        "apikey": api_key,
    }
    topic_variants = []
    inferred_topics = _commodities_to_topics(commodities)
    if inferred_topics:
        topic_variants.append(",".join(inferred_topics))
    # Add broad fallbacks with valid topics
    topic_variants.extend([
        "financial_markets",
        "economy_macro",
        "economy_monetary",
        "economy_fiscal",
        "energy",
        "manufacturing",
        "technology",
        "retail_wholesale",
        "finance",
    ])
    # cache helpers already defined above

    def _call_and_parse(params: dict):
        r = requests.get("https://www.alphavantage.co/query", params=params, timeout=12)
        r.raise_for_status()
        data = r.json()
        if data.get("Note") or data.get("Information") or data.get("Error Message"):
            print("[alpha_vantage] warn:", data.get("Note") or data.get("Information") or data.get("Error Message"))
            print("[alpha_vantage] params:", {k: v for k, v in params.items() if k != "apikey"})
        feed = data.get("feed") or []
        articles = []
        for item in feed:
            art = {
                "title": item.get("title"),
                "summary": item.get("summary"),
                "source": item.get("source"),
                "url": (item.get("url") or item.get("source_url") or ""),
                "time_published": item.get("time_published"),
            }
            articles.append(art)
        return articles

    try:
        # Try each topic variant until we get articles
        for tv in topic_variants:
            params = dict(base_params)
            params["topics"] = tv
            print(f"[news/av] trying topics='{tv}' from={params.get('time_from')}")
            arts = _call_and_parse(params)
            if arts:
                _write_cache(arts)
                return {"articles": arts}

        # Try without topics as last resort (provider may default to broad feed)
        arts = _call_and_parse(dict(base_params))
        print("[news/av] no topics returned count=", len(arts) if arts else 0)
        if arts:
            _write_cache(arts)
            return {"articles": arts}

        # Fall back to cached feed when provider returns empty (e.g., rate limit)
        cached = _read_cache()
        if isinstance(cached.get("articles"), list) and len(cached["articles"]) > 0:
            print(f"[news/cache] returning cached articles: {len(cached['articles'])}")
            return cached
        return {"articles": []}
    except Exception as e:
        print(f"[news] exception: {e}")
        # Fall back to cached feed on any error
        cached = _read_cache()
        if isinstance(cached.get("articles"), list) and len(cached["articles"]) > 0:
            print(f"[news/cache] returning cached articles after exception: {len(cached['articles'])}")
            return cached
        return {"articles": []}


@app.get('/')
def read_root():
    return {
        "message": "Integra AI Backend is running!",
        "version": "1.0.1",  # Updated version
        "endpoints": [
            "/analyze-sentiment",
            "/health",
            "/api/sentiment/market",
            "/api/sentiment/movers",
            "/api/news/latest",
            "/api/news/analysis",
            "/api/weather/alerts",
        ]
    }

@app.get('/health')
def health_check():
    return {"status": "healthy", "supabase_connected": bool(supabase_url and supabase_key)}

@app.post('/analyze-sentiment', response_model=SentimentResponse)
def analyze_sentiment(request: SentimentRequest):
    try:
        if not request.text or len(request.text.strip()) == 0:
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        
        # Prefer FinBERT via HuggingFace when enhanced requested and token available
        token = os.getenv("HUGGING_FACE_TOKEN")
        print(f"[analyze] enhanced={request.enhanced} has_token={bool(token)}")
        if request.enhanced:
            fin = _hf_finbert_infer(request.text)
            if fin:
                print(f"[analyze] finbert SUCCESS label={fin['label']} conf={fin['confidence']:.3f} probs=(pos:{fin['prob_positive']:.2f}, neg:{fin['prob_negative']:.2f}, neu:{fin['prob_neutral']:.2f})")
                return SentimentResponse(
                    text=request.text,
                    sentiment=fin["label"],
                    confidence=round(float(fin["confidence"]), 3),
                    timestamp=datetime.datetime.now().isoformat(),
                    prob_positive=float(fin.get("prob_positive") or 0.0),
                    prob_negative=float(fin.get("prob_negative") or 0.0),
                    prob_neutral=float(fin.get("prob_neutral") or 0.0),
                )

        # Sophisticated heuristic fallback
        result = _advanced_heuristic_sentiment(request.text)
        sentiment = result['sentiment']
        confidence = result['confidence']
        p_pos = result['prob_positive']
        p_neg = result['prob_negative']
        p_neu = result['prob_neutral']
        return SentimentResponse(
            text=request.text,
            sentiment=sentiment,
            confidence=round(confidence, 3),
            timestamp=datetime.datetime.now().isoformat(),
            prob_positive=p_pos,
            prob_negative=p_neg,
            prob_neutral=p_neu,
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get('/api/sentiment/market')
def get_market_sentiment():
    return {
        "overall": "BULLISH",
        "confidence": 0.72,
        "timestamp": _now_iso(),
        "commodities": [
            {"name": "OIL", "sentiment": "BULLISH", "change": 2.5},
            {"name": "NAT GAS", "sentiment": "BEARISH", "change": -1.3},
            {"name": "WHEAT", "sentiment": "NEUTRAL", "change": 0.4},
            {"name": "GOLD", "sentiment": "BULLISH", "change": 1.1},
        ],
        "source": "simulated",
    }


@app.get('/api/sentiment/movers')
def get_top_movers():
    return [
        {"symbol": "OIL", "sentiment": 0.74, "trend": "bullish", "volume": "high"},
        {"symbol": "WHEAT", "sentiment": -0.42, "trend": "bearish", "volume": "medium"},
        {"symbol": "GOLD", "sentiment": 0.61, "trend": "bullish", "volume": "high"},
        {"symbol": "NAT GAS", "sentiment": -0.55, "trend": "bearish", "volume": "low"},
    ]


@app.post('/api/news/latest')
def get_latest_news(payload: dict = Body(default_factory=dict)):
    commodities = payload.get("commodities") if isinstance(payload, dict) else []
    hours = payload.get("hours") if isinstance(payload, dict) else 72
    live = _fetch_live_news(commodities, hours or 72)
    if live and isinstance(live.get("articles"), list) and len(live["articles"]) > 0:
        try:
            first = live["articles"][0]
            print(f"[news/latest] live={len(live['articles'])} first='{first.get('title','')[:80]}'")
        except Exception:
            print(f"[news/latest] live={len(live['articles'])}")
        return live
    print("[news/latest] no live articles; returning empty")
    return {"articles": []}


@app.get('/api/news/analysis')
def get_news_analysis(hours: int = Query(default=72)):
    live = _fetch_live_news([], hours)
    if live and isinstance(live.get("articles"), list) and len(live["articles"]) > 0:
        try:
            first = live["articles"][0]
            print(f"[news/analysis] live={len(live['articles'])} first='{first.get('title','')[:80]}'")
        except Exception:
            print(f"[news/analysis] live={len(live['articles'])}")
        return live
    print("[news/analysis] no live articles; returning empty")
    return {"articles": []}


@app.get('/api/weather/alerts')
def get_weather_alerts():
    return {
        "alerts": [
            {
                "id": "wx-001",
                "type": "drought",
                "severity": "moderate",
                "region": "Midwest US",
                "impact": "Potential wheat yield reduction",
                "commodities_affected": ["WHEAT", "CORN"],
                "timestamp": _now_iso(),
            },
            {
                "id": "wx-002",
                "type": "storm",
                "severity": "elevated",
                "region": "Gulf Coast",
                "impact": "Hurricane activity may disrupt oil production",
                "commodities_affected": ["OIL"],
                "timestamp": _now_iso(),
            },
        ],
        "source": "simulated",
    }


# ------- Compatibility endpoint to match the app's expected path -------
@app.post('/api/sentiment')
def analyze_sentiment_api(request: SentimentRequest):
    """Mirror of /analyze-sentiment under /api for client compatibility"""
    print(f"[api/sentiment] text_len={len(request.text) if request and request.text else 0} enhanced={request.enhanced} commodity={request.commodity}")
    # Force enhanced mode for better results
    if not request.enhanced:
        request.enhanced = True
    base = analyze_sentiment(request)
    # Map to overlay-friendly shape
    # Normalize sentiment labels (support both POSITIVE/NEGATIVE and BULLISH/BEARISH)
    raw = (base.sentiment or "NEUTRAL").upper()
    if raw in {"POSITIVE", "BULLISH"}:
        sent = "BULLISH"
    elif raw in {"NEGATIVE", "BEARISH"}:
        sent = "BEARISH"
    else:
        sent = "NEUTRAL"
    conf = float(base.confidence or 0.5)
    # Use model probabilities if available, else distribute by confidence
    if getattr(base, "prob_positive", None) is not None:
        bullish = float(base.prob_positive or 0)
        bearish = float(base.prob_negative or 0)
        neutral = float(base.prob_neutral or 0)
    else:
        bullish = bearish = neutral = (1.0 - conf) / 2.0
        if sent == "BULLISH":
            bullish = conf
        elif sent == "BEARISH":
            bearish = conf
        else:
            neutral = conf

    # Drivers: prefer NLTK noun-phrases (varied), fallback to concept labels, then RAKE phrases
    try:
        nltk_kw = _extract_keywords_nltk(request.text, topn=2)
        if nltk_kw:
            keywords = nltk_kw
        else:
            concepts = _concept_drivers(request.text, maxn=2)
            if concepts:
                keywords = concepts
            else:
                keywords = _extract_keywords(request.text, topn=2)[:2]
    except Exception:
        keywords = _extract_keywords(request.text, topn=2)[:2]

    impact = "HIGH" if conf >= 0.8 else ("MEDIUM" if conf >= 0.6 else "LOW")

    return {
        "text": request.text,
        "sentiment": sent,
        "confidence": round(conf, 3),
        "bullish": round(bullish, 3),
        "bearish": round(bearish, 3),
        "neutral": round(neutral, 3),
        "keywords": keywords,
        "impact": impact,
        "commodity_specific": bool(getattr(request, "commodity", None)),
        "timestamp": base.timestamp,
    }


# ---------------- Market Data (Alpha Vantage) ----------------
def _alpha_get(params: dict):
    api_key = os.getenv("ALPHA_VANTAGE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ALPHA_VANTAGE_API_KEY missing")
    full = dict(params)
    full["apikey"] = api_key
    try:
        r = requests.get("https://www.alphavantage.co/query", params=full, timeout=12)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Alpha Vantage error: {e}")


@app.post('/api/market-data/fx/rate')
def fx_rate(payload: dict = Body(...)):
    from_symbol = (payload or {}).get("from_symbol")
    to_symbol = (payload or {}).get("to_symbol")
    if not from_symbol or not to_symbol:
        raise HTTPException(status_code=400, detail="from_symbol and to_symbol are required")
    data = _alpha_get({
        "function": "CURRENCY_EXCHANGE_RATE",
        "from_currency": from_symbol,
        "to_currency": to_symbol,
    })
    rate_obj = data.get("Realtime Currency Exchange Rate") or {}
    result = {
        "from": rate_obj.get("1. From_Currency Code", from_symbol),
        "to": rate_obj.get("3. To_Currency Code", to_symbol),
        "rate": float(rate_obj.get("5. Exchange Rate", 0) or 0),
        "last_refreshed": rate_obj.get("6. Last Refreshed") or _now_iso(),
    }
    print(f"[market/fx/rate] {from_symbol}->{to_symbol} rate={result['rate']}")
    return result


@app.post('/api/market-data/fx/series')
def fx_series(payload: dict = Body(...)):
    from_symbol = (payload or {}).get("from_symbol")
    to_symbol = (payload or {}).get("to_symbol")
    if not from_symbol or not to_symbol:
        raise HTTPException(status_code=400, detail="from_symbol and to_symbol are required")
    data = _alpha_get({
        "function": "FX_DAILY",
        "from_symbol": from_symbol,
        "to_symbol": to_symbol,
        "outputsize": "compact",
    })
    series = data.get("Time Series FX (Daily)") or {}
    points = []
    for ts, v in list(series.items())[:60]:
        try:
            points.append({"timestamp": ts, "close": float(v.get("4. close", 0) or 0)})
        except Exception:
            continue
    points.sort(key=lambda x: x["timestamp"])  # ascending
    print(f"[market/fx/series] {from_symbol}->{to_symbol} points={len(points)}")
    return {"from": from_symbol, "to": to_symbol, "points": points}


_COMMODITY_SYMBOLS = {
    "OIL": "CL=F",
    "NAT GAS": "NG=F",
    "GOLD": "GC=F",
    "SILVER": "SI=F",
    "WHEAT": "ZW=F",
    "CORN": "ZC=F",
    "COPPER": "HG=F",
}


def _map_commodity_symbol(symbol: str) -> str:
    s = (symbol or "").upper()
    return _COMMODITY_SYMBOLS.get(s, s)


@app.post('/api/market-data/commodities/rate')
def commodity_rate(payload: dict = Body(...)):
    symbol = (payload or {}).get("symbol")
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")
    mapped = _map_commodity_symbol(symbol)
    data = _alpha_get({
        "function": "GLOBAL_QUOTE",
        "symbol": mapped,
    })
    quote = data.get("Global Quote") or {}
    price = float(quote.get("05. price", 0) or 0)
    print(f"[market/commodities/rate] {symbol}({mapped}) price={price}")
    return {"symbol": symbol, "mapped": mapped, "price": price, "source": "alpha_vantage"}


@app.post('/api/market-data/commodities/series')
def commodity_series(payload: dict = Body(...)):
    symbol = (payload or {}).get("symbol")
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")
    mapped = _map_commodity_symbol(symbol)
    data = _alpha_get({
        "function": "TIME_SERIES_DAILY",
        "symbol": mapped,
        "outputsize": "compact",
    })
    series = data.get("Time Series (Daily)") or {}
    points = []
    for ts, v in list(series.items())[:60]:
        try:
            points.append({"timestamp": ts, "close": float(v.get("4. close", 0) or 0)})
        except Exception:
            continue
    points.sort(key=lambda x: x["timestamp"])  # ascending
    print(f"[market/commodities/series] {symbol}({mapped}) points={len(points)}")
    return {"symbol": symbol, "mapped": mapped, "points": points, "source": "alpha_vantage"}

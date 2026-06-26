"""Topic taxonomy for the prediction-market divergence system.

Bridges three things:
  1. The news pipeline's sentiment scores
  2. The user's alert preferences ("notify me about Fed, Iran, OPEC")
  3. Polymarket / Kalshi markets to match against

Each topic declares:
  * `label`            human-visible name shown in mobile UI
  * `category`         grouping (commodities / macro / geopolitical / political / crypto)
  * `news_keywords`    case-insensitive substring matches for tagging news
  * `polymarket_match` function: market dict -> bool
  * `kalshi_match`     function: market dict -> bool

Designed as a flat dict so it can be serialized to JSON for the mobile
app's settings screen without code generation.

Keyword lists are intentionally conservative. Iterate after launch
based on observed false-positives / false-negatives.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List


def _kw_in_title(keywords: List[str]) -> Callable[[Dict[str, Any]], bool]:
    """Build a market-matcher that returns True if any keyword is in market title."""
    lowered = [k.lower() for k in keywords]
    def matcher(market: Dict[str, Any]) -> bool:
        haystack = " ".join([
            str(market.get("title") or ""),
            str(market.get("question") or ""),
            str(market.get("subtitle") or ""),
            str(market.get("category") or ""),
            " ".join(market.get("tags") or []),
        ]).lower()
        return any(k in haystack for k in lowered)
    return matcher


TOPICS: Dict[str, Dict[str, Any]] = {
    # =========================================================
    # COMMODITIES — the original Integra strength
    # =========================================================
    "crude_oil": {
        "label": "Crude oil",
        "category": "commodities",
        "news_keywords": [
            "crude", "oil", "wti", "brent", "opec", "barrel",
            "refinery", "petroleum",
        ],
        "polymarket_match": _kw_in_title(["oil", "crude", "brent", "wti", "opec"]),
        "kalshi_match": _kw_in_title(["oil", "crude", "brent", "wti", "opec"]),
    },
    "natural_gas": {
        "label": "Natural gas / LNG",
        "category": "commodities",
        "news_keywords": [
            "natural gas", "lng", "henry hub", "ttf", "jkm",
            "european gas", "gas storage",
        ],
        "polymarket_match": _kw_in_title(["natural gas", "lng", "henry hub"]),
        "kalshi_match": _kw_in_title(["natural gas", "lng", "henry hub"]),
    },
    "copper": {
        "label": "Copper",
        "category": "commodities",
        "news_keywords": ["copper", "lme copper", "chile copper", "comex copper"],
        "polymarket_match": _kw_in_title(["copper"]),
        "kalshi_match": _kw_in_title(["copper"]),
    },
    "gold": {
        "label": "Gold",
        "category": "commodities",
        "news_keywords": ["gold", "xau", "bullion", "gold price"],
        "polymarket_match": _kw_in_title(["gold"]),
        "kalshi_match": _kw_in_title(["gold"]),
    },
    "wheat": {
        "label": "Wheat / Agricultural",
        "category": "commodities",
        "news_keywords": ["wheat", "corn", "soybean", "harvest", "agricultural"],
        "polymarket_match": _kw_in_title(["wheat", "corn", "soybean", "agriculture"]),
        "kalshi_match": _kw_in_title(["wheat", "corn", "soybean", "agriculture"]),
    },

    # =========================================================
    # MACRO / POLICY — moves commodity prices via rate decisions
    # =========================================================
    "fed_rates": {
        "label": "Fed / Interest rates",
        "category": "macro",
        "news_keywords": [
            "fed ", "fomc", "federal reserve", "powell", "rate hike",
            "rate cut", "rate decision", "fed funds", "tightening",
            "dovish", "hawkish", "monetary policy",
        ],
        "polymarket_match": _kw_in_title(["fed", "rate", "fomc", "powell"]),
        "kalshi_match": _kw_in_title(["fed", "rate", "fomc"]),
    },
    "inflation": {
        "label": "Inflation (CPI / PPI)",
        "category": "macro",
        "news_keywords": [
            "inflation", "cpi", "ppi", "core inflation", "disinflation",
            "consumer prices", "producer prices",
        ],
        "polymarket_match": _kw_in_title(["inflation", "cpi", "ppi"]),
        "kalshi_match": _kw_in_title(["inflation", "cpi", "ppi"]),
    },
    "jobs_employment": {
        "label": "Jobs / Employment",
        "category": "macro",
        "news_keywords": [
            "unemployment", "nonfarm payrolls", "jobs report", "jobless claims",
            "labor market", "wage growth",
        ],
        "polymarket_match": _kw_in_title(["unemployment", "jobs", "payrolls"]),
        "kalshi_match": _kw_in_title(["unemployment", "jobs", "payrolls", "labor"]),
    },
    "recession": {
        "label": "Recession / GDP",
        "category": "macro",
        "news_keywords": [
            "recession", "gdp", "economic contraction", "slowdown",
            "soft landing", "hard landing",
        ],
        "polymarket_match": _kw_in_title(["recession", "gdp"]),
        "kalshi_match": _kw_in_title(["recession", "gdp"]),
    },
    "usd_strength": {
        "label": "USD / Dollar strength",
        "category": "macro",
        "news_keywords": [
            "dollar", "dxy", "usd", "greenback", "yuan", "yen",
            "currency", "fx market",
        ],
        "polymarket_match": _kw_in_title(["dollar", "dxy", "yuan", "yen"]),
        "kalshi_match": _kw_in_title(["dollar", "dxy", "currency"]),
    },

    # =========================================================
    # GEOPOLITICS — direct commodity-price impact
    # =========================================================
    "iran_middle_east": {
        "label": "Iran / Middle East",
        "category": "geopolitical",
        "news_keywords": [
            "iran", "tehran", "irgc", "iranian", "jcpoa",
            "strait of hormuz", "houthis", "yemen", "israel", "gaza",
            "hezbollah", "middle east",
        ],
        "polymarket_match": _kw_in_title([
            "iran", "israel", "houthi", "hormuz", "middle east", "gaza",
        ]),
        "kalshi_match": _kw_in_title([
            "iran", "israel", "houthi", "hormuz", "middle east", "gaza",
        ]),
    },
    "opec_decisions": {
        "label": "OPEC+ decisions",
        "category": "geopolitical",
        "news_keywords": [
            "opec", "opec+", "production cut", "production quota",
            "saudi arabia", "saudi", "uae oil", "russia oil",
        ],
        "polymarket_match": _kw_in_title(["opec", "saudi", "production cut"]),
        "kalshi_match": _kw_in_title(["opec", "saudi"]),
    },
    "russia_ukraine": {
        "label": "Russia / Ukraine",
        "category": "geopolitical",
        "news_keywords": [
            "russia", "ukraine", "putin", "zelensky", "kyiv", "moscow",
            "ukraine war", "russian sanctions", "nord stream",
        ],
        "polymarket_match": _kw_in_title(["russia", "ukraine", "putin"]),
        "kalshi_match": _kw_in_title(["russia", "ukraine"]),
    },
    "china_trade": {
        "label": "China / Trade",
        "category": "geopolitical",
        "news_keywords": [
            "china", "beijing", "xi jinping", "taiwan", "trade war",
            "chinese economy", "tariff", "tariffs",
        ],
        "polymarket_match": _kw_in_title(["china", "taiwan", "tariff"]),
        "kalshi_match": _kw_in_title(["china", "taiwan", "tariff"]),
    },

    # =========================================================
    # POLITICS — price-relevant political events
    # =========================================================
    "us_elections": {
        "label": "US elections",
        "category": "political",
        "news_keywords": [
            "election", "trump", "biden", "harris", "republican",
            "democrat", "senate race", "house race", "presidential",
        ],
        "polymarket_match": _kw_in_title([
            "election", "president", "trump", "biden", "senate", "house",
        ]),
        "kalshi_match": _kw_in_title([
            "election", "president", "senate", "house", "republican", "democrat",
        ]),
    },
    "energy_policy": {
        "label": "Energy / Climate policy",
        "category": "political",
        "news_keywords": [
            "climate policy", "carbon", "emissions", "energy transition",
            "renewable", "eia ", "doe ", "epa ", "drilling permit",
        ],
        "polymarket_match": _kw_in_title(["climate", "carbon", "emissions", "energy policy"]),
        "kalshi_match": _kw_in_title(["climate", "carbon", "emissions", "energy"]),
    },

    # =========================================================
    # CRYPTO — largest Polymarket category; macro-correlated
    # =========================================================
    "bitcoin": {
        "label": "Bitcoin (BTC)",
        "category": "crypto",
        "news_keywords": ["bitcoin", "btc", "bitcoin price", "crypto"],
        "polymarket_match": _kw_in_title(["bitcoin", "btc"]),
        "kalshi_match": _kw_in_title(["bitcoin", "btc"]),
    },
    "ethereum": {
        "label": "Ethereum (ETH)",
        "category": "crypto",
        "news_keywords": ["ethereum", "eth", "ether"],
        "polymarket_match": _kw_in_title(["ethereum", "eth"]),
        "kalshi_match": _kw_in_title(["ethereum", "eth"]),
    },
}


CATEGORIES: Dict[str, Dict[str, Any]] = {
    "commodities":  {"label": "Commodities",       "default_expanded": True},
    "macro":        {"label": "Macro / Policy",    "default_expanded": True},
    "geopolitical": {"label": "Geopolitics",       "default_expanded": True},
    "political":    {"label": "Politics",          "default_expanded": False},
    "crypto":       {"label": "Crypto",            "default_expanded": False},
}


# Topics turned on by default for a new user — chosen for highest signal
# per the commodity-trader-adjacent persona.
DEFAULT_USER_TOPICS = [
    "crude_oil", "natural_gas", "fed_rates", "opec_decisions",
    "iran_middle_east",
]


def list_topics_for_api() -> List[Dict[str, Any]]:
    """JSON-serializable topic list for the mobile-app settings screen.

    The match functions are stripped (they are not serializable); the
    mobile app does not need them, it only displays labels and persists
    the chosen topic keys.
    """
    return [
        {
            "key": key,
            "label": t["label"],
            "category": t["category"],
            "category_label": CATEGORIES[t["category"]]["label"],
            "news_keywords": t["news_keywords"][:3],  # preview only
        }
        for key, t in TOPICS.items()
    ]


def list_categories_for_api() -> List[Dict[str, Any]]:
    return [
        {"key": k, "label": v["label"], "default_expanded": v["default_expanded"]}
        for k, v in CATEGORIES.items()
    ]


def detect_topics(text: str) -> List[str]:
    """Return all topic keys whose keywords appear in `text` (case-insensitive)."""
    lowered = (text or "").lower()
    matches: List[str] = []
    for key, t in TOPICS.items():
        if any(kw in lowered for kw in t["news_keywords"]):
            matches.append(key)
    return matches


def matching_markets(topic_key: str, markets: List[Dict[str, Any]], provider: str) -> List[Dict[str, Any]]:
    """Filter a list of market dicts down to those matching `topic_key`.

    `provider` selects between polymarket_match / kalshi_match.
    """
    topic = TOPICS.get(topic_key)
    if not topic:
        return []
    matcher_key = "polymarket_match" if provider.lower() == "polymarket" else "kalshi_match"
    matcher = topic[matcher_key]
    return [m for m in markets if matcher(m)]

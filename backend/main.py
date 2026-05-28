from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client
from pydantic import BaseModel
from typing import Optional

# Load environment variables (Cloud Run will provide them directly)
load_dotenv()  # This will load from .env if present, but won't fail if missing

# DB
try:
    from db import init_db, close_db
except ImportError:
    # Fallback for deployment
    async def init_db():
        pass
    async def close_db():
        pass

# Routers
try:
    from api.notifications import router as notifications_router
    notifications_available = True
except ImportError:
    notifications_available = False

try:
    from api.market_data import router as market_data_router
    market_data_available = True
except ImportError:
    market_data_available = False

try:
    from api.news import router as news_router
    news_available = True
except ImportError:
    news_available = False

try:
    from api.feedback import router as feedback_router
    feedback_available = True
except ImportError:
    feedback_available = False

try:
    from api.metrics import router as metrics_router
    metrics_available = True
except ImportError:
    metrics_available = False

try:
    from api.news_user import router as news_user_router
    news_user_available = True
except ImportError:
    news_user_available = False

try:
    from services.learning_loop import attach_supabase as _attach_loop_supabase
    learning_loop_available = True
except ImportError:
    learning_loop_available = False

try:
    from jobs.outcome_evaluator import OutcomeEvaluator
    outcome_evaluator_available = True
except ImportError:
    outcome_evaluator_available = False

_outcome_evaluator: Optional["OutcomeEvaluator"] = None

app = FastAPI(title="Integra AI Backend", description="Financial AI Analysis API")

# Lifespan events
@app.on_event("startup")
async def startup_event():
    await init_db()
    if learning_loop_available and supabase is not None:
        _attach_loop_supabase(supabase)
    if outcome_evaluator_available and supabase is not None:
        global _outcome_evaluator
        try:
            from services.learning_loop import get_learning_loop
            from alpha_vantage_client import AlphaVantageClient  # type: ignore
            av_client = AlphaVantageClient()
        except Exception:  # noqa: BLE001
            av_client = None
        _outcome_evaluator = OutcomeEvaluator(
            supabase=supabase,
            learning_loop=get_learning_loop(),
            alpha_vantage_client=av_client,
        )
        _outcome_evaluator.start()

@app.on_event("shutdown")
async def shutdown_event():
    if _outcome_evaluator is not None:
        await _outcome_evaluator.stop()
    await close_db()

# Mount routers conditionally
if notifications_available:
    app.include_router(notifications_router)
if market_data_available:
    app.include_router(market_data_router)
if news_available:
    app.include_router(news_router)
if feedback_available:
    app.include_router(feedback_router)
if metrics_available:
    app.include_router(metrics_router)
if news_user_available:
    app.include_router(news_user_router)

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

# Gracefully handle missing Supabase credentials in production
supabase: Optional[Client] = None
if supabase_url and supabase_key:
    supabase = create_client(supabase_url, supabase_key)

# Pydantic models for request/response
class SentimentRequest(BaseModel):
    text: str
    user_id: str = None

class SentimentResponse(BaseModel):
    text: str
    sentiment: str
    confidence: float
    timestamp: str

@app.get('/')
def read_root():
    return {
        "message": "Integra AI Backend is running!",
        "version": "1.0.1",  # Updated version
        "endpoints": [
            "/analyze-sentiment",
            "/health",
            "/api/notifications/register-token",
            "/api/notifications/test",
            "/api/market-data/fx/rate",
            "/api/market-data/fx/series",
            "/api/market-data/commodities/rate",
            "/api/market-data/commodities/series",
            "/api/news/latest",
            "/api/news/refresh"
        ]
    }

@app.get('/health')
def health_check():
    return {"status": "healthy", "supabase_connected": bool(supabase_url and supabase_key)}

_SENTIMENT_MAP = {"positive": "bullish", "negative": "bearish", "neutral": "neutral"}
_KEYWORD_BULLISH = {"bullish", "gain", "profit", "surge", "rally", "rise", "increase", "boost", "strong", "growth"}
_KEYWORD_BEARISH = {"bearish", "loss", "deficit", "fall", "drop", "decline", "crash", "weak", "recession", "downturn"}


def _try_finbert(text: str) -> Optional[tuple]:
    """Returns (label, confidence) from FinBERT, or None if unavailable."""
    hf_token = os.getenv("HUGGING_FACE_TOKEN")
    if not hf_token:
        return None
    try:
        import requests
        response = requests.post(
            "https://api-inference.huggingface.co/models/ProsusAI/finbert",
            headers={"Authorization": f"Bearer {hf_token}"},
            json={"inputs": text},
            timeout=10,
        )
        if response.status_code != 200:
            return None
        result = response.json()
        if not (isinstance(result, list) and result):
            return None
        scores = {item["label"].lower(): item["score"] for item in result[0]}
        best = max(scores, key=scores.get)
        return best, scores[best]
    except Exception as exc:  # noqa: BLE001
        print(f"FinBERT API error: {exc}")
        return None


def _try_vader(text: str) -> Optional[tuple]:
    """Returns (label, confidence) from NLTK VADER, or None on failure."""
    try:
        import nltk
        from nltk.sentiment import SentimentIntensityAnalyzer
        try:
            nltk.data.find("vader_lexicon")
        except LookupError:
            nltk.download("vader_lexicon", quiet=True)
        compound = SentimentIntensityAnalyzer().polarity_scores(text)["compound"]
        if compound >= 0.05:
            return "positive", min(0.95, abs(compound))
        if compound <= -0.05:
            return "negative", min(0.95, abs(compound))
        return "neutral", 1 - abs(compound)
    except Exception as exc:  # noqa: BLE001
        print(f"NLTK error: {exc}")
        return None


def _keyword_fallback(text: str) -> tuple:
    """Last-resort keyword-counting sentiment. Always returns a value."""
    text_lower = text.lower()
    pos = sum(1 for w in _KEYWORD_BULLISH if w in text_lower)
    neg = sum(1 for w in _KEYWORD_BEARISH if w in text_lower)
    if pos > neg:
        return "positive", min(0.85, 0.6 + pos * 0.1)
    if neg > pos:
        return "negative", min(0.85, 0.6 + neg * 0.1)
    return "neutral", 0.5


def _classify_sentiment(text: str) -> tuple:
    return _try_finbert(text) or _try_vader(text) or _keyword_fallback(text)


def _log_prediction(text: str, sentiment: str, confidence: float, user_id: Optional[str]) -> None:
    """Best-effort write to the predictions table for the learning loop."""
    if not supabase:
        return
    try:
        supabase.table("predictions").insert({
            "article_id": text[:80],
            "article_title": text[:200],
            "source": "analyze-sentiment-endpoint",
            "predicted_sentiment": _SENTIMENT_MAP.get(sentiment, "neutral"),
            "predicted_distribution": {"raw_label": sentiment, "raw_confidence": confidence},
            "confidence": confidence,
            "model_version": "finbert+vader+keyword",
            "user_id": user_id,
        }).execute()
    except Exception as exc:  # noqa: BLE001
        print(f"prediction log failed: {exc}")


@app.post('/analyze-sentiment', response_model=SentimentResponse)
def analyze_sentiment(request: SentimentRequest):
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    try:
        import datetime
        sentiment, confidence = _classify_sentiment(request.text)
        _log_prediction(request.text, sentiment, confidence, request.user_id)
        return SentimentResponse(
            text=request.text,
            sentiment=sentiment,
            confidence=round(confidence, 3),
            timestamp=datetime.datetime.now().isoformat(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

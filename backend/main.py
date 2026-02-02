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
    from api.kalshi import router as kalshi_router
    kalshi_available = True
except ImportError:
    kalshi_available = False

app = FastAPI(title="Integra AI Backend", description="Financial AI Analysis API")

# Lifespan events
@app.on_event("startup")
async def startup_event():
    await init_db()

@app.on_event("shutdown")
async def shutdown_event():
    await close_db()

# Mount routers conditionally
if notifications_available:
    app.include_router(notifications_router)
if market_data_available:
    app.include_router(market_data_router)
if news_available:
    app.include_router(news_router)
if kalshi_available:
    app.include_router(kalshi_router)

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

# Kalshi configuration
kalshi_api_key: str = os.getenv("KALSHI_API_KEY")
kalshi_api_secret: str = os.getenv("KALSHI_API_SECRET")
kalshi_base_url: str = os.getenv("KALSHI_BASE_URL", "https://trading-api.kalshi.com/trade-api/v2")

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

@app.post('/analyze-sentiment', response_model=SentimentResponse)
def analyze_sentiment(request: SentimentRequest):
    try:
        if not request.text or len(request.text.strip()) == 0:
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        
        import datetime
        import requests
        import json
        
        # Try FinBERT via Hugging Face API first
        hf_token = os.getenv("HUGGING_FACE_TOKEN")
        if hf_token:
            try:
                headers = {"Authorization": f"Bearer {hf_token}"}
                api_url = "https://api-inference.huggingface.co/models/ProsusAI/finbert"
                
                response = requests.post(
                    api_url,
                    headers=headers,
                    json={"inputs": request.text},
                    timeout=10
                )
                
                if response.status_code == 200:
                    result = response.json()
                    if isinstance(result, list) and len(result) > 0:
                        # FinBERT returns labels: positive, negative, neutral
                        scores = {item['label'].lower(): item['score'] for item in result[0]}
                        
                        # Get the highest confidence prediction
                        best_sentiment = max(scores.keys(), key=lambda k: scores[k])
                        confidence = scores[best_sentiment]
                        
                        return SentimentResponse(
                            text=request.text,
                            sentiment=best_sentiment,
                            confidence=round(confidence, 3),
                            timestamp=datetime.datetime.now().isoformat()
                        )
            except Exception as e:
                print(f"FinBERT API error: {e}")
        
        # Fallback to NLTK VADER sentiment analysis
        try:
            import nltk
            from nltk.sentiment import SentimentIntensityAnalyzer
            
            # Download required data if not present
            try:
                nltk.data.find('vader_lexicon')
            except LookupError:
                nltk.download('vader_lexicon', quiet=True)
            
            sia = SentimentIntensityAnalyzer()
            scores = sia.polarity_scores(request.text)
            
            # Convert VADER compound score to sentiment
            compound = scores['compound']
            if compound >= 0.05:
                sentiment = "positive"
                confidence = min(0.95, abs(compound))
            elif compound <= -0.05:
                sentiment = "negative"
                confidence = min(0.95, abs(compound))
            else:
                sentiment = "neutral"
                confidence = 1 - abs(compound)
            
            return SentimentResponse(
                text=request.text,
                sentiment=sentiment,
                confidence=round(confidence, 3),
                timestamp=datetime.datetime.now().isoformat()
            )
            
        except Exception as nltk_error:
            print(f"NLTK error: {nltk_error}")
            
            # Final fallback to basic analysis
            financial_positive = ['bullish', 'gain', 'profit', 'surge', 'rally', 'rise', 'increase', 'boost', 'strong', 'growth']
            financial_negative = ['bearish', 'loss', 'deficit', 'fall', 'drop', 'decline', 'crash', 'weak', 'recession', 'downturn']
            
            text_lower = request.text.lower()
            positive_count = sum(1 for word in financial_positive if word in text_lower)
            negative_count = sum(1 for word in financial_negative if word in text_lower)
            
            if positive_count > negative_count:
                sentiment = "positive"
                confidence = min(0.85, 0.6 + (positive_count * 0.1))
            elif negative_count > positive_count:
                sentiment = "negative"
                confidence = min(0.85, 0.6 + (negative_count * 0.1))
            else:
                sentiment = "neutral"
                confidence = 0.5
            
            return SentimentResponse(
                text=request.text,
                sentiment=sentiment,
                confidence=round(confidence, 3),
                timestamp=datetime.datetime.now().isoformat()
            )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

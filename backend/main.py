from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client
from pydantic import BaseModel
from typing import Optional
import time
import asyncio
from collections import defaultdict

logger = logging.getLogger(__name__)

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

# Notification engine (instant + backstop scheduler)
try:
    from services.notification_scheduler import notification_engine
    notif_available = True
except Exception as e:
    print(f"Warning: notification engine not available: {e}")
    notif_available = False

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
except ImportError as e:
    print(f"Error importing api.news: {e}")
    news_available = False

try:
    from api.kalshi import router as kalshi_router
    kalshi_available = True
except ImportError as e:
    print(f"Error importing api.kalshi: {e}")
    kalshi_available = False

app = FastAPI(title="Integra AI Backend", description="Financial AI Analysis API")

# Lifespan events
@app.on_event("startup")
async def startup_event():
    await init_db()
    # Start the backstop notification scheduler
    if notif_available:
        try:
            notification_engine.start()
            logger.info("Notification engine started (instant + backstop)")
        except Exception as e:
            logger.error(f"Failed to start notification engine: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    if notif_available:
        try:
            notification_engine.stop()
        except Exception:
            pass
    await close_db()

# Mount routers conditionally
if notifications_available:
    app.include_router(notifications_router, prefix="/api")
if market_data_available:
    app.include_router(market_data_router, prefix="/api")
if news_available:
    app.include_router(news_router, prefix="/api")
if kalshi_available:
    app.include_router(kalshi_router, prefix="/api")

# Add CORS middleware to allow requests from your React Native app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your app's domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting middleware
class RateLimiter:
    def __init__(self):
        self.requests = defaultdict(list)  # {key: [timestamps]}
        self.lock = asyncio.Lock()
    
    async def is_allowed(self, key: str, max_requests: int, window_seconds: int) -> bool:
        """Check if request is allowed under rate limit"""
        async with self.lock:
            now = time.time()
            # Remove old requests outside window
            self.requests[key] = [t for t in self.requests[key] if now - t < window_seconds]
            
            if len(self.requests[key]) >= max_requests:
                return False
            
            self.requests[key].append(now)
            return True
    
    async def get_remaining(self, key: str, max_requests: int, window_seconds: int) -> int:
        """Get remaining requests allowed"""
        async with self.lock:
            now = time.time()
            self.requests[key] = [t for t in self.requests[key] if now - t < window_seconds]
            return max(0, max_requests - len(self.requests[key]))

rate_limiter = RateLimiter()

# Rate limit decorator
def rate_limit(max_requests: int = 60, window_seconds: int = 60):
    """Rate limiting decorator for endpoints"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # Get request from kwargs or args
            request = None
            for arg in args:
                if hasattr(arg, 'client'):
                    request = arg
                    break
            
            if request:
                # Get client IP or user ID
                client_ip = request.client.host if request.client else "unknown"
                user_id = request.headers.get("X-User-ID", client_ip)
                key = f"{user_id}:{client_ip}"
                
                if not await rate_limiter.is_allowed(key, max_requests, window_seconds):
                    raise HTTPException(
                        status_code=429,
                        detail=f"Rate limit exceeded. Try again in {window_seconds} seconds.",
                        headers={"Retry-After": str(window_seconds)}
                    )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator

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

@app.api_route('/', methods=["GET", "HEAD"])
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

@app.api_route('/health', methods=["GET", "HEAD"])
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

# Chat endpoint for mobile app
class ChatRequest(BaseModel):
    messages: list
    commodity: Optional[str] = None

@app.post('/api/ai/chat')
async def ai_chat(request: Request, chat_request: ChatRequest):
    """Chat with AI using Groq - 10 requests per minute"""
    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    key = f"chat:{client_ip}"
    if not await rate_limiter.is_allowed(key, 10, 60):
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Try again in 60 seconds.",
            headers={"Retry-After": "60"}
        )
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        return {"response": "AI chat is not available. Please configure GROQ_API_KEY.", "tool_results": []}
    
    try:
        import httpx
        
        # Prepare messages with system prompt
        system_prompt = "You are an AI assistant specialized in commodities markets analysis. You help traders understand market dynamics, price movements, and news impacts. Provide educational insights, not financial advice."
        
        if chat_request.commodity:
            system_prompt += f" Current context: {chat_request.commodity} commodity."
        
        messages = [{"role": "system", "content": system_prompt}] + chat_request.messages
        
        # Call Groq API
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {groq_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": messages,
                    "temperature": 0.7,
                    "max_tokens": 1000
                }
            )
            response.raise_for_status()
            data = response.json()
            return {
                "response": data["choices"][0]["message"]["content"],
                "tool_results": []
            }
    except Exception as e:
        logger.error(f"Chat error: {e}")
        return {"response": f"I'm currently unavailable. Error: {str(e)}", "tool_results": []}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

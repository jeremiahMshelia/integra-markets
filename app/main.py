import logging
import uvicorn
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from api.routes import router
from core.config import settings
from core.database import create_db_and_tables
from core.initialize import initialize_app

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Integra Markets API",
    description="Sentiment analysis & market intelligence platform for commodity traders",
    version="0.1.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include core API routes (news, sentiment, weather, etc.)
app.include_router(router, prefix="/api")

# Try to include optional routers that depend on auth/config.
# If they fail to import, log a warning but don't crash the app.
try:
    from api.ai_alerts import router as ai_alerts_router
    app.include_router(ai_alerts_router)
except Exception as e:
    logger.warning(f"AI alerts router not loaded: {e}")

try:
    from api.notifications import router as notifications_router
    app.include_router(notifications_router, prefix="/api")
except Exception as e:
    logger.warning(f"Notifications router not loaded: {e}")

@app.on_event("startup")
async def startup_event():
    """Initialize database, NLTL, and other startup tasks"""
    # Create database tables
    create_db_and_tables()
    
    # Initialize NLTK, FinBERT, and check API keys
    initialize_app()
    
    # Initialize sentiment analyzer
    from services.enhanced_sentiment import sentiment_analyzer
    await sentiment_analyzer.initialize()

@app.get("/")
async def root():
    """Root endpoint for health checks"""
    return {
        "status": "online",
        "service": "Integra Markets API",
        "version": app.version,
        "features": {
            "sentiment_analysis": True,
            "market_data": settings.ALPHA_VANTAGE_API_KEY is not None,
            "finbert": settings.HUGGING_FACE_TOKEN is not None
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint for React Native app"""
    return {"status": "healthy", "timestamp": "2024-01-01T00:00:00Z"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

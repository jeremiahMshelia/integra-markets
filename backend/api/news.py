"""
API Routes for Integra Markets
Enhanced with FinBERT and VADER sentiment analysis
"""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import asyncio
import datetime
import logging

logger = logging.getLogger(__name__)

# Import notification engine (safe — won't crash if unavailable)
try:
    from services.notification_scheduler import notification_engine
    _notif_available = True
except Exception:
    _notif_available = False


async def _fire_notifications(articles: list):
    """Fire push notifications for the given articles (runs in background)."""
    if not _notif_available:
        return
    try:
        await notification_engine.notify_for_articles(articles)
    except Exception as e:
        logger.error("[Notif] Error firing notifications: %s", e)

# Import services
from services.enhanced_sentiment import analyze_market_sentiment, sentiment_analyzer
from services.news_preprocessing import preprocess_news, create_pipeline_ready_output
from services.weather import get_weather_alerts
from services.news import get_latest_commodity_news
from services.smart_sentiment import analyze_financial_text

# Create API router
api_router = APIRouter()

# Export the router as 'router' to match the import in main.py
router = api_router

# Request models
class NewsPreprocessRequest(BaseModel):
    text: str

class SentimentAnalysisRequest(BaseModel):
    text: str
    commodity: Optional[str] = None
    enhanced: bool = False

class ComprehensiveAnalysisRequest(BaseModel):
    text: str
    commodity: Optional[str] = None
    include_preprocessing: bool = True
    include_finbert: bool = True


class LatestNewsRequest(BaseModel):
    commodities: Optional[List[str]] = None
    hours: int = 6
    sources: Optional[List[str]] = None  # Filter by user's selected sources

# --- Enhanced Sentiment Analysis Endpoints ---
@api_router.post("/analyze-sentiment", response_model=Dict[str, Any])
async def analyze_sentiment_endpoint(request: SentimentAnalysisRequest):
    """
    Enhanced sentiment analysis using FinBERT and VADER
    """
    try:
        if not request.text or request.text.strip() == "":
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        
        result = await analyze_market_sentiment(
            text=request.text,
            commodity=request.commodity,
            enhanced=request.enhanced
        )
        
        return {
            "status": "success",
            "analysis": result,
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing sentiment: {str(e)}")

@api_router.post("/sentiment", response_model=Dict[str, Any])
async def analyze_sentiment_legacy(request: SentimentAnalysisRequest):
    """Legacy endpoint used by the mobile client for enhanced sentiment analysis.

    Returns bullish/bearish/neutral probabilities and metadata at the top level
    so the mobile client can render sentiment scores directly.
    """
    try:
        if not request.text or request.text.strip() == "":
            raise HTTPException(status_code=400, detail="Text cannot be empty")

        # Use the smart sentiment pipeline which already returns
        # bullish/bearish/neutral + confidence and keywords
        analysis = analyze_financial_text(request.text)

        return {
            "bullish": analysis.get("bullish", 0.33),
            "bearish": analysis.get("bearish", 0.33),
            "neutral": analysis.get("neutral", 0.34),
            "sentiment": analysis.get("sentiment", "NEUTRAL"),
            "confidence": analysis.get("confidence", 0.5),
            "keywords": analysis.get("keywords", []),
            "impact": str(analysis.get("market_impact", "neutral")).upper(),
            "severity": analysis.get("severity", "low"),
            "raw": analysis,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing sentiment: {str(e)}")

@api_router.post("/comprehensive-analysis", response_model=Dict[str, Any])
async def comprehensive_analysis_endpoint(request: ComprehensiveAnalysisRequest):
    """
    Complete analysis combining preprocessing, FinBERT, and VADER
    """
    try:
        if not request.text or request.text.strip() == "":
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        
        result = {
            "text": request.text,
            "commodity": request.commodity,
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        
        # Add preprocessing if requested
        if request.include_preprocessing:
            preprocessing_result = preprocess_news(request.text)
            result["preprocessing"] = preprocessing_result
            
            # Use commodity from preprocessing if not provided
            if not request.commodity and "commodity" in preprocessing_result:
                request.commodity = preprocessing_result["commodity"]
        
        # Add enhanced sentiment analysis
        sentiment_result = await analyze_market_sentiment(
            text=request.text,
            commodity=request.commodity,
            enhanced=request.include_finbert
        )
        result["sentiment_analysis"] = sentiment_result
        
        # Generate trading recommendations
        if request.include_preprocessing and sentiment_result:
            result["trading_intelligence"] = generate_trading_intelligence(
                preprocessing_result if request.include_preprocessing else {},
                sentiment_result,
                request.commodity
            )
        
        return {
            "status": "success",
            "analysis": result
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error in comprehensive analysis: {str(e)}")

def generate_trading_intelligence(preprocessing: Dict, sentiment: Dict, commodity: str) -> Dict:
    """Generate actionable trading intelligence"""
    
    # Extract key data
    market_impact = sentiment.get("market_impact", "neutral")
    confidence = sentiment.get("confidence", 0.5)
    severity = sentiment.get("severity", "low")
    event_type = preprocessing.get("event_type", "market_movement")
    region = preprocessing.get("region", "Global")
    
    # Generate recommendations
    recommendations = []
    risk_level = "LOW"
    
    if confidence > 0.8 and severity == "high":
        risk_level = "HIGH"
        if market_impact == "bullish":
            recommendations.extend([
                f"Consider long positions in {commodity}",
                "Monitor for entry points on any dips",
                "Set stop-losses below key support levels"
            ])
        elif market_impact == "bearish":
            recommendations.extend([
                f"Consider reducing {commodity} exposure", 
                "Look for short opportunities",
                "Hedge existing long positions"
            ])
    elif confidence > 0.6:
        risk_level = "MEDIUM"
        recommendations.extend([
            f"Watch {commodity} closely for volatility",
            "Consider smaller position sizes",
            "Monitor for confirmation signals"
        ])
    else:
        recommendations.extend([
            "Maintain current positions",
            "Wait for clearer signals",
            "Focus on risk management"
        ])
    
    # Time horizon based on event type
    if event_type in ["geopolitical_tension", "supply_shock"]:
        time_horizon = "1-7 days"
    elif event_type == "weather_event":
        time_horizon = "2-4 weeks"
    else:
        time_horizon = "24-72 hours"
    
    return {
        "market_impact": market_impact.upper(),
        "risk_level": risk_level,
        "confidence_score": f"{confidence:.1%}",
        "time_horizon": time_horizon,
        "recommendations": recommendations,
        "key_levels_to_watch": [
            "Support/Resistance levels",
            "Volume confirmation",
            "Related commodity correlations"
        ]
    }

# --- News Preprocessing Endpoints ---
@api_router.post("/preprocess-news", response_model=Dict[str, Any])
async def preprocess_news_endpoint(request: NewsPreprocessRequest):
    """
    Preprocesses raw news text using domain knowledge from commodity trading experts
    """
    try:
        if not request.text or request.text.strip() == "":
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        
        result = preprocess_news(request.text)
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error preprocessing news: {str(e)}")

@api_router.post("/preprocess-news/pipeline", response_model=Dict[str, Any])
async def preprocess_news_pipeline_endpoint(request: NewsPreprocessRequest):
    """
    Preprocesses news text and returns pipeline-ready output with enhanced context
    """
    try:
        if not request.text or request.text.strip() == "":
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        
        result = create_pipeline_ready_output(request.text)
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating pipeline output: {str(e)}")

# --- News Feed Endpoints ---
@api_router.post("/news/latest", response_model=Dict[str, Any])
async def get_latest_news(request: LatestNewsRequest, background_tasks: BackgroundTasks):
    """Return latest commodity news articles (optionally filtered by commodities and sources)."""
    try:
        result = await get_latest_commodity_news(
            commodities=request.commodities,
            limit=50,
            hours=request.hours,
            sources=request.sources,  # Filter by user's selected sources
        )
        # INSTANT NOTIFICATIONS: fire push notifications in background
        articles = result.get("articles", []) if isinstance(result, dict) else []
        if articles:
            background_tasks.add_task(_fire_notifications, articles)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching latest news: {str(e)}")


@api_router.get("/news/analysis", response_model=Dict[str, Any])
async def get_news_analysis_endpoint(hours: int = 6, background_tasks: BackgroundTasks = None):
    """Return analyzed news feed for the given time window.

    For now this reuses the latest news feed so the mobile app has data to display.
    """
    try:
        result = await get_latest_commodity_news(limit=50, hours=hours)
        # INSTANT NOTIFICATIONS: fire push notifications in background
        articles = result.get("articles", []) if isinstance(result, dict) else []
        if articles and background_tasks:
            background_tasks.add_task(_fire_notifications, articles)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching news analysis: {str(e)}")

# --- Sentiment Analysis Endpoints ---
@api_router.get("/sentiment/market", response_model=Dict[str, Any])
async def get_market_sentiment():
    """
    Returns overall market sentiment analysis for commodities
    """
    try:
        sentiment_data = await analyze_market_sentiment()
        return sentiment_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing market sentiment: {str(e)}")

# --- Weather Intelligence Endpoints ---
@api_router.get("/weather/alerts", response_model=Dict[str, Any])
async def get_active_weather_alerts():
    """
    Returns active weather alerts affecting commodity markets
    """
    try:
        alerts = get_weather_alerts()
        return alerts
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving weather alerts: {str(e)}")

# --- Health Check Endpoints ---
@api_router.get("/health")
async def health_check():
    """Enhanced health check with model status"""
    
    # Check if sentiment analyzer is initialized
    analyzer_status = {
        "initialized": sentiment_analyzer.initialized,
        "vader_available": sentiment_analyzer.vader_analyzer is not None,
        "finbert_available": sentiment_analyzer.finbert_model is not None
    }
    
    return {
        "status": "healthy",
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "services": {
            "sentiment_analysis": analyzer_status,
            "news_preprocessing": True,
            "api_endpoints": True
        }
    }

@api_router.get("/models/status")
async def models_status():
    """Check status of ML models"""
    
    # Initialize if not already done
    if not sentiment_analyzer.initialized:
        await sentiment_analyzer.initialize()
    
    return {
        "sentiment_analyzer": {
            "initialized": sentiment_analyzer.initialized,
            "vader": {
                "available": sentiment_analyzer.vader_analyzer is not None,
                "status": "ready" if sentiment_analyzer.vader_analyzer else "not_loaded"
            },
            "finbert": {
                "available": sentiment_analyzer.finbert_model is not None,
                "status": "ready" if sentiment_analyzer.finbert_model else "not_loaded"
            }
        }
    }

# --- Demo endpoints for testing ---
@api_router.get("/demo/market_sentiment")
async def demo_market_sentiment():
    """
    Demo endpoint that returns sample market sentiment data
    """
    return {
        "overall": "BEARISH",
        "confidence": 78,
        "commodities": [
            {"name": "OIL", "change": -1.2},
            {"name": "NAT GAS", "change": 0.7},
            {"name": "WHEAT", "change": -2.3},
            {"name": "GOLD", "change": -0.1}
        ]
    }

@api_router.get("/demo/top_movers")
async def demo_top_movers():
    """
    Demo endpoint that returns sample top movers data
    """
    return [
        {"symbol": "OIL", "sentiment": -2.1, "trend": "down"},
        {"symbol": "CORN", "sentiment": 1.7, "trend": "up"},
        {"symbol": "COPPER", "sentiment": -0.8, "trend": "down"},
        {"symbol": "SILVER", "sentiment": 0.3, "trend": "up"}
    ]

@api_router.get("/sentiment/movers")
async def get_sentiment_movers():
    try:
        return await demo_top_movers()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting sentiment movers: {str(e)}")

@api_router.get("/demo/news_analysis")
async def demo_news_analysis():
    """
    Demo endpoint that returns sample news analysis data
    """
    now = datetime.datetime.utcnow()
    return [
        {
            "id": 1,
            "title": "Oil prices drop as recession fears grow amid weak economic data",
            "headline": "Oil prices drop as recession fears grow amid weak economic data",
            "summary": "Oil markets sold off as weaker-than-expected macro data reinforced concerns about a potential global slowdown, putting pressure on demand expectations.",
            "source": "Reuters",
            "time_published": now.isoformat(),
            "timeAgo": "47m ago",
            "sentiment": "BEARISH",
            "sentiment_score": 0.50,
            "commodity": "OIL",
            "isPremium": False
        },
        {
            "id": 2,
            "title": "OPEC+ considers additional output cuts to stabilize markets",
            "headline": "OPEC+ considers additional output cuts to stabilize markets",
            "summary": "Reports suggest OPEC+ members are weighing deeper production cuts to support prices, signaling a more proactive stance on supply management.",
            "source": "Bloomberg",
            "time_published": now.isoformat(),
            "timeAgo": "2h ago",
            "sentiment": "BULLISH",
            "sentiment_score": 0.72,
            "commodity": "OIL",
            "isPremium": True
        }
    ]

@api_router.get("/demo/weather_alerts")
async def demo_weather_alerts():
    """
    Demo endpoint that returns sample weather alert data
    """
    return {
        "message": "Drought conditions worsening in key wheat producing regions"
    }
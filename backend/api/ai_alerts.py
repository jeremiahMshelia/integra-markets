"""
API endpoints for AI-powered alert system with Q-learning.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from datetime import datetime

from services.ai_alert_service import (
    process_news_with_ai,
    record_feedback,
    record_market_data,
    get_user_insights
)
from services.auth import get_current_user

router = APIRouter(prefix="/api/ai-alerts", tags=["ai-alerts"])

# Request/Response models
class NewsAnalysisRequest(BaseModel):
    news_text: str
    source: Optional[str] = None

class FeedbackRequest(BaseModel):
    tracking_id: str
    feedback_type: str  # 'clicked', 'dismissed', 'helpful', 'not_helpful'
    additional_data: Optional[Dict[str, Any]] = None

class MarketUpdateRequest(BaseModel):
    commodity: str
    price_change: float
    timeframe: str = "1h"

class AlertResponse(BaseModel):
    user_id: str
    tracking_id: Optional[str] = None
    send_alert: bool
    priority: Optional[str] = None
    commodity: Optional[str] = None
    sentiment: Dict[str, float]
    confidence: float
    created_at: str

@router.post("/analyze", response_model=AlertResponse)
async def analyze_news(
    request: NewsAnalysisRequest,
    current_user: Dict = Depends(get_current_user)
):
    """
    Analyze news and get AI-powered alert recommendation.
    
    This endpoint:
    1. Preprocesses the news text
    2. Analyzes sentiment
    3. Uses Q-learning model to decide if/how to alert
    4. Tracks the alert for learning from outcomes
    """
    try:
        result = process_news_with_ai(
            news_text=request.news_text,
            user_id=current_user["id"],
            source=request.source
        )
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        
        # Format response
        response = AlertResponse(
            user_id=result["user_id"],
            tracking_id=result.get("tracking_id"),
            send_alert=result["recommendation"]["send_alert"],
            priority=result["recommendation"]["priority"],
            commodity=result["preprocessing"].get("commodity"),
            sentiment={
                "bullish": result["sentiment"].get("positive", 0),
                "bearish": result["sentiment"].get("negative", 0),
                "neutral": result["sentiment"].get("neutral", 0)
            },
            confidence=result["recommendation"]["confidence"],
            created_at=result["created_at"]
        )
        
        return response
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/feedback")
async def provide_feedback(
    request: FeedbackRequest,
    current_user: Dict = Depends(get_current_user)
):
    """
    Record user feedback on an alert.
    
    Feedback types:
    - 'clicked': User clicked on the alert
    - 'dismissed': User dismissed without reading
    - 'helpful': User found alert helpful
    - 'not_helpful': User found alert not helpful
    """
    try:
        success = record_feedback(
            tracking_id=request.tracking_id,
            feedback_type=request.feedback_type,
            **(request.additional_data or {})
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="Tracking ID not found")
        
        return {"status": "success", "message": "Feedback recorded"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/market-update")
async def update_market_data(
    request: MarketUpdateRequest,
    current_user: Dict = Depends(get_current_user)
):
    """
    Record actual market outcomes for learning.
    
    This helps the AI learn from predictions vs reality.
    """
    try:
        record_market_data(
            commodity=request.commodity,
            price_change=request.price_change,
            timeframe=request.timeframe
        )
        
        return {"status": "success", "message": "Market data recorded"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/insights/{user_id}")
async def get_user_ai_insights(
    user_id: str,
    current_user: Dict = Depends(get_current_user)
):
    """
    Get AI insights about a user's behavior and preferences.
    
    Returns:
    - Alert engagement statistics
    - Learned commodity preferences
    - Optimal alert frequency
    """
    try:
        # Ensure user can only access their own insights
        if current_user["id"] != user_id and not current_user.get("is_admin", False):
            raise HTTPException(status_code=403, detail="Access denied")
        
        insights = get_user_insights(user_id)
        return insights
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/batch-analyze")
async def batch_analyze_news(
    news_items: List[NewsAnalysisRequest],
    current_user: Dict = Depends(get_current_user)
):
    """
    Analyze multiple news items at once.
    
    Useful for processing news feeds or bulk updates.
    """
    try:
        results = []
        for item in news_items[:10]:  # Limit to 10 items per batch
            result = process_news_with_ai(
                news_text=item.news_text,
                user_id=current_user["id"],
                source=item.source
            )
            
            if "error" not in result:
                results.append({
                    "tracking_id": result.get("tracking_id"),
                    "send_alert": result["recommendation"]["send_alert"],
                    "priority": result["recommendation"]["priority"],
                    "commodity": result["preprocessing"].get("commodity"),
                    "confidence": result["recommendation"]["confidence"]
                })
        
        # Return only high-priority alerts
        high_priority = [r for r in results if r["send_alert"] and r["priority"] in ["high", "medium"]]
        
        return {
            "total_analyzed": len(results),
            "alerts_recommended": len([r for r in results if r["send_alert"]]),
            "high_priority_alerts": high_priority
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Example usage endpoints for testing
@router.get("/test-scenarios")
async def get_test_scenarios():
    """
    Get example news texts for testing the AI system.
    """
    return {
        "scenarios": [
            {
                "title": "Wheat shortage alert",
                "text": "Breaking: Severe drought in major wheat-producing regions threatens global supply. Prices expected to surge 15-20% in coming weeks.",
                "expected_action": "high_priority_alert"
            },
            {
                "title": "Minor corn update",
                "text": "Corn futures traded slightly higher today on routine market adjustments. No significant changes expected.",
                "expected_action": "no_alert"
            },
            {
                "title": "Gold volatility",
                "text": "Gold prices swing wildly as Federal Reserve hints at policy changes. Traders brace for continued volatility.",
                "expected_action": "medium_priority_alert"
            }
        ]
    }

@router.get("/model-stats")
async def get_model_statistics(
    current_user: Dict = Depends(get_current_user)
):
    """
    Get statistics about the Q-learning model performance.
    """
    try:
        from services.alert_rl_model import alert_agent
        
        return {
            "epsilon": alert_agent.epsilon,
            "learning_rate": 0.001,
            "episodes_trained": alert_agent.learn_step_counter,
            "model_device": str(alert_agent.device),
            "action_space_size": alert_agent.action_size,
            "state_space_size": alert_agent.state_size
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

"""
AI-powered alert service that integrates preprocessing, sentiment analysis, and Q-learning.
This service orchestrates the complete pipeline from news to personalized alerts.
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
import numpy as np
from collections import defaultdict
import httpx

# Import our existing services
from services.news_preprocessing import preprocess_news
from services.smart_sentiment import analyze_smart_sentiment
from services.alert_rl_model import (
    get_alert_recommendation,
    train_alert_model_online,
    alert_agent
)

logger = logging.getLogger(__name__)

class AIAlertService:
    """
    Complete AI-powered alert service that learns from user behavior.
    """
    
    def __init__(self):
        # User behavior tracking
        self.user_behavior = defaultdict(lambda: {
            "alerts_sent": 0,
            "alerts_clicked": 0,
            "alerts_dismissed": 0,
            "total_response_time": 0,
            "commodity_clicks": defaultdict(int),
            "last_alert_time": None
        })
        
        # Temporary storage for tracking outcomes
        self.pending_outcomes = {}  # Track predictions waiting for actual outcomes
        
        # Market data cache (in production, this would connect to real market data)
        self.market_cache = {}
        
    def process_news_with_ai(self, 
                            news_text: str,
                            user_id: str,
                            source: Optional[str] = None) -> Dict[str, Any]:
        """
        Process news through the complete AI pipeline.
        
        Steps:
        1. Preprocess the news text
        2. Analyze sentiment
        3. Get user preferences
        4. Get alert recommendation from Q-learning model
        5. Track for future learning
        """
        try:
            # Step 1: Preprocess news
            preprocessed = preprocess_news(news_text)
            if "error" in preprocessed:
                return preprocessed
            
            # Step 2: Sentiment analysis
            sentiment = analyze_smart_sentiment(news_text)
            
            # Combine preprocessing and sentiment features
            news_features = {
                **preprocessed,
                "sentiment_scores": {
                    "bullish": sentiment.get("positive", 0),
                    "bearish": sentiment.get("negative", 0),
                    "neutral": sentiment.get("neutral", 0)
                },
                "confidence_score": sentiment.get("confidence", 0.5),
                "keywords": preprocessed.get("keywords", []),
                "severity": self._map_severity_to_number(preprocessed.get("severity", "low")),
                "urgency": self._calculate_urgency(preprocessed)
            }
            
            # Step 3: Get user preferences
            user_prefs = self._get_user_preferences(user_id)
            
            # Step 4: Get market context
            market_context = self._get_market_context()
            
            # Step 5: Get AI recommendation
            recommendation = get_alert_recommendation(
                news_features,
                user_id,
                user_prefs
            )
            
            # Step 6: Create complete alert package
            alert_data = {
                "user_id": user_id,
                "news_text": news_text[:500],  # Truncate for storage
                "source": source,
                "preprocessing": preprocessed,
                "sentiment": sentiment,
                "recommendation": recommendation,
                "created_at": datetime.now().isoformat(),
                "features": news_features,
                "market_context": market_context
            }
            
            # Step 7: Store for outcome tracking if alert is sent
            if recommendation["send_alert"]:
                tracking_id = f"{user_id}_{datetime.now().timestamp()}"
                self.pending_outcomes[tracking_id] = {
                    "alert_data": alert_data,
                    "predicted_outcome": self._make_prediction(news_features, market_context),
                    "user_preferences": user_prefs,
                    "action_taken": recommendation["recommended_action"]
                }
                alert_data["tracking_id"] = tracking_id
                
                # Update user behavior stats
                self._update_user_stats(user_id, "sent")
                
                # Send push notification
                asyncio.create_task(self._send_push_notification(alert_data))
            
            return alert_data
            
        except Exception as e:
            logger.error(f"Error in AI processing: {str(e)}")
            return {"error": str(e)}
    
    def record_user_feedback(self,
                           tracking_id: str,
                           feedback_type: str,
                           additional_data: Optional[Dict[str, Any]] = None) -> bool:
        """
        Record user feedback on an alert for learning.
        
        Args:
            tracking_id: The tracking ID from the alert
            feedback_type: 'clicked', 'dismissed', 'helpful', 'not_helpful'
            additional_data: Any additional feedback data
        """
        if tracking_id not in self.pending_outcomes:
            logger.warning(f"Unknown tracking ID: {tracking_id}")
            return False
        
        pending = self.pending_outcomes[tracking_id]
        user_id = pending["alert_data"]["user_id"]
        
        # Update user behavior
        if feedback_type == "clicked":
            self._update_user_stats(user_id, "clicked")
            commodity = pending["alert_data"]["preprocessing"].get("commodity")
            if commodity:
                self.user_behavior[user_id]["commodity_clicks"][commodity] += 1
        elif feedback_type == "dismissed":
            self._update_user_stats(user_id, "dismissed")
        
        # Store feedback for training
        if "user_feedback" not in pending:
            pending["user_feedback"] = {}
        
        pending["user_feedback"][feedback_type] = True
        if additional_data:
            pending["user_feedback"].update(additional_data)
        
        # If we have enough feedback, trigger learning
        if feedback_type in ["helpful", "not_helpful", "dismissed"]:
            self._trigger_learning(tracking_id)
        
        return True
    
    def record_market_outcome(self,
                            commodity: str,
                            price_change: float,
                            timeframe: str = "1h") -> None:
        """
        Record actual market outcomes for learning.
        
        Args:
            commodity: The commodity name
            price_change: Percentage price change
            timeframe: Time period for the change
        """
        # Update market cache
        self.market_cache[commodity] = {
            "price_change": price_change,
            "timeframe": timeframe,
            "timestamp": datetime.now().isoformat(),
            "direction": "up" if price_change > 0 else "down" if price_change < 0 else "neutral"
        }
        
        # Check pending outcomes for this commodity
        current_time = datetime.now()
        for tracking_id, pending in list(self.pending_outcomes.items()):
            alert_commodity = pending["alert_data"]["preprocessing"].get("commodity")
            alert_time = datetime.fromisoformat(pending["alert_data"]["created_at"])
            
            # If this alert was about this commodity and within timeframe
            if (alert_commodity == commodity and 
                (current_time - alert_time) < timedelta(hours=24)):
                
                # Record actual outcome
                pending["actual_outcome"] = {
                    "price_change_percent": price_change,
                    "price_direction": self.market_cache[commodity]["direction"],
                    "severity": self._categorize_movement(abs(price_change))
                }
                
                # Trigger learning if we have user feedback
                if "user_feedback" in pending:
                    self._trigger_learning(tracking_id)
    
    def _trigger_learning(self, tracking_id: str) -> None:
        """
        Trigger the Q-learning update for a completed experience.
        """
        if tracking_id not in self.pending_outcomes:
            return
        
        pending = self.pending_outcomes[tracking_id]
        
        # Need both actual outcome and user feedback for complete learning
        if "actual_outcome" not in pending:
            # Use a default outcome if market data isn't available yet
            pending["actual_outcome"] = {
                "price_change_percent": 0,
                "price_direction": "neutral",
                "severity": "low"
            }
        
        # Prepare experience data for training
        experience = {
            "news_features": pending["alert_data"]["features"],
            "user_preferences": pending["user_preferences"],
            "market_context": pending["alert_data"]["market_context"],
            "action_taken": pending["action_taken"],
            "predicted_outcome": pending["predicted_outcome"],
            "actual_outcome": pending["actual_outcome"],
            "user_feedback": pending.get("user_feedback", {})
        }
        
        # Train the model
        result = train_alert_model_online(experience)
        logger.info(f"Model trained with reward: {result['reward']}, epsilon: {result['epsilon']}")
        
        # Clean up
        del self.pending_outcomes[tracking_id]
        
        # Periodically save the model
        if len(self.pending_outcomes) % 100 == 0:
            alert_agent.save_model()
    
    def _get_user_preferences(self, user_id: str) -> Dict[str, Any]:
        """
        Get user preferences based on historical behavior.
        """
        behavior = self.user_behavior[user_id]
        
        # Calculate metrics
        click_rate = (behavior["alerts_clicked"] / behavior["alerts_sent"] 
                     if behavior["alerts_sent"] > 0 else 0.5)
        dismiss_rate = (behavior["alerts_dismissed"] / behavior["alerts_sent"]
                       if behavior["alerts_sent"] > 0 else 0.2)
        avg_response_time = (behavior["total_response_time"] / behavior["alerts_clicked"]
                           if behavior["alerts_clicked"] > 0 else 30.0)
        
        # Get preferred commodities from click history
        preferred_commodities = []
        if behavior["commodity_clicks"]:
            # Sort by click count and take top 3
            sorted_commodities = sorted(behavior["commodity_clicks"].items(), 
                                      key=lambda x: x[1], reverse=True)
            preferred_commodities = [c[0] for c in sorted_commodities[:3]]
        
        return {
            "preferred_commodities": preferred_commodities or ["wheat", "corn"],
            "alert_click_rate": click_rate,
            "alert_dismiss_rate": dismiss_rate,
            "avg_response_time": avg_response_time,
            "preferred_alert_frequency": self._calculate_preferred_frequency(user_id)
        }
    
    def _get_market_context(self) -> Dict[str, Any]:
        """
        Get current market context.
        """
        # In production, this would fetch real market data
        # For now, we'll use simulated values
        
        # Calculate volatility from recent price changes
        recent_changes = [abs(m["price_change"]) for m in self.market_cache.values()
                         if m.get("timestamp") and 
                         (datetime.now() - datetime.fromisoformat(m["timestamp"])) < timedelta(hours=24)]
        
        volatility = np.std(recent_changes) if recent_changes else 0.5
        
        return {
            "volatility_index": min(volatility / 5.0, 1.0),  # Normalize to 0-1
            "trend_strength": 0.3,  # Would calculate from price trends
            "trading_hours": 1 if 9 <= datetime.now().hour <= 16 else 0,
            "day_of_week": datetime.now().weekday()
        }
    
    def _make_prediction(self, 
                        news_features: Dict[str, Any],
                        market_context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Make a prediction about the expected outcome.
        """
        # Simple rule-based prediction (in production, could use another ML model)
        sentiment_score = (news_features["sentiment_scores"]["bullish"] - 
                         news_features["sentiment_scores"]["bearish"])
        
        if sentiment_score > 0.3:
            direction = "up"
        elif sentiment_score < -0.3:
            direction = "down"
        else:
            direction = "neutral"
        
        severity = news_features.get("severity", 1)
        severity_map = {1: "low", 2: "medium", 3: "high"}
        
        return {
            "price_direction": direction,
            "severity": severity_map.get(severity, "low"),
            "confidence": news_features["confidence_score"]
        }
    
    def _update_user_stats(self, user_id: str, event_type: str) -> None:
        """
        Update user behavior statistics.
        """
        behavior = self.user_behavior[user_id]
        
        if event_type == "sent":
            behavior["alerts_sent"] += 1
            behavior["last_alert_time"] = datetime.now()
        elif event_type == "clicked":
            behavior["alerts_clicked"] += 1
            if behavior["last_alert_time"]:
                response_time = (datetime.now() - behavior["last_alert_time"]).seconds
                behavior["total_response_time"] += response_time
        elif event_type == "dismissed":
            behavior["alerts_dismissed"] += 1
    
    def _map_severity_to_number(self, severity: str) -> int:
        """Map severity string to number."""
        return {"low": 1, "medium": 2, "high": 3}.get(severity.lower(), 1)
    
    def _calculate_urgency(self, preprocessed: Dict[str, Any]) -> float:
        """Calculate urgency score from preprocessed data."""
        # High urgency keywords
        urgent_keywords = ["immediate", "breaking", "urgent", "now", "today", "alert"]
        keywords = preprocessed.get("keywords", [])
        
        urgency_score = sum(1 for kw in urgent_keywords if kw in str(keywords).lower())
        return min(urgency_score / 3.0, 1.0)  # Normalize to 0-1
    
    def _categorize_movement(self, price_change: float) -> str:
        """Categorize price movement magnitude."""
        if price_change < 1.0:
            return "low"
        elif price_change < 3.0:
            return "medium"
        else:
            return "high"
    
    def _calculate_preferred_frequency(self, user_id: str) -> int:
        """Calculate user's preferred alert frequency."""
        behavior = self.user_behavior[user_id]
        if behavior["alerts_sent"] == 0:
            return 3  # Default
        
        # Based on click rate
        click_rate = behavior["alerts_clicked"] / behavior["alerts_sent"]
        if click_rate > 0.7:
            return 5  # User engages a lot, send more
        elif click_rate > 0.4:
            return 3  # Medium engagement
        else:
            return 2  # Low engagement, send fewer
    
    def get_user_insights(self, user_id: str) -> Dict[str, Any]:
        """
        Get insights about a user's behavior and preferences.
        """
        behavior = self.user_behavior[user_id]
        prefs = self._get_user_preferences(user_id)
        
        return {
            "user_id": user_id,
            "stats": {
                "total_alerts": behavior["alerts_sent"],
                "clicked_alerts": behavior["alerts_clicked"],
                "click_rate": prefs["alert_click_rate"],
                "avg_response_time": prefs["avg_response_time"]
            },
            "preferences": {
                "commodities": prefs["preferred_commodities"],
                "alert_frequency": prefs["preferred_alert_frequency"]
            },
            "commodity_interests": dict(behavior["commodity_clicks"])
        }
    
    async def _send_push_notification(self, alert_data: Dict[str, Any]) -> None:
        """
        Send push notification via the notification API.
        """
        try:
            # Extract key information
            commodity = alert_data["preprocessing"].get("commodity", "Market")
            action = alert_data["recommendation"]["recommended_action"]
            confidence = alert_data["recommendation"]["confidence"]
            
            # Create notification payload
            notification_data = {
                "commodity": commodity,
                "action": action,
                "confidence": confidence,
                "message": self._create_alert_message(alert_data)
            }
            
            # Call the notification API endpoint
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "http://localhost:8000/api/notifications/ai-alert",
                    json=notification_data,
                    headers={"Content-Type": "application/json"}
                )
                
                if response.status_code == 200:
                    logger.info(f"Push notification sent for {commodity}")
                else:
                    logger.error(f"Failed to send notification: {response.text}")
                    
        except Exception as e:
            logger.error(f"Error sending push notification: {str(e)}")
    
    def _create_alert_message(self, alert_data: Dict[str, Any]) -> str:
        """
        Create a user-friendly alert message.
        """
        commodity = alert_data["preprocessing"].get("commodity", "Market")
        sentiment = alert_data["sentiment"]
        severity = alert_data["preprocessing"].get("severity", "medium")
        action = alert_data["recommendation"]["recommended_action"]
        
        # Determine sentiment direction
        if sentiment.get("positive", 0) > sentiment.get("negative", 0):
            direction = "bullish"
        elif sentiment.get("negative", 0) > sentiment.get("positive", 0):
            direction = "bearish"
        else:
            direction = "mixed"
        
        # Create message based on action
        if action == "buy":
            message = f"🟢 {commodity} showing {direction} signals. Consider buying positions."
        elif action == "sell":
            message = f"🔴 {commodity} showing {direction} signals. Consider reducing exposure."
        elif action == "hold":
            message = f"🟡 {commodity} showing {direction} signals. Monitor closely."
        else:
            message = f"ℹ️ {commodity} update: {severity} severity {direction} signals detected."
        
        return message

# Global service instance
ai_alert_service = AIAlertService()

# Convenience functions for easy import
def process_news_with_ai(news_text: str, user_id: str, source: Optional[str] = None) -> Dict[str, Any]:
    """Process news through the AI pipeline."""
    return ai_alert_service.process_news_with_ai(news_text, user_id, source)

def record_feedback(tracking_id: str, feedback_type: str, **kwargs) -> bool:
    """Record user feedback on an alert."""
    return ai_alert_service.record_user_feedback(tracking_id, feedback_type, kwargs)

def record_market_data(commodity: str, price_change: float, timeframe: str = "1h") -> None:
    """Record actual market outcomes."""
    ai_alert_service.record_market_outcome(commodity, price_change, timeframe)

def get_user_insights(user_id: str) -> Dict[str, Any]:
    """Get insights about user behavior."""
    return ai_alert_service.get_user_insights(user_id)

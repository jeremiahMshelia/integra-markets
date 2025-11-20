"""
Push Notification API endpoints for Integra Markets
Handles push tokens, notification sending, and preferences
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime
import httpx
import logging
from sqlalchemy.orm import Session

from core.database import get_db
from core.config import settings
from services.auth import get_current_user
from models.users import User
from services.ai_alert_service import AIAlertService

# Configure logging
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/notifications", tags=["notifications"])

# Expo push notification service URL
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# Request models
class PushTokenRequest(BaseModel):
    token: str
    device_type: str = "ios"  # ios, android, web

class NotificationRequest(BaseModel):
    title: str
    body: str
    data: Optional[Dict[str, Any]] = None
    user_ids: Optional[List[int]] = None
    send_to_all: bool = False
    priority: str = "default"  # default, high
    channel_id: Optional[str] = None  # For Android

class NotificationPreferencesRequest(BaseModel):
    push_notifications: bool = True
    email_alerts: bool = False
    market_alerts: bool = True
    breaking_news: bool = True
    price_alerts: bool = True
    weekend_updates: bool = False
    sound_enabled: bool = True
    vibration_enabled: bool = True
    alert_frequency: str = "immediate"  # immediate, hourly, daily
    quiet_hours_start: Optional[str] = None  # HH:MM format
    quiet_hours_end: Optional[str] = None

class TestNotificationRequest(BaseModel):
    message: str = "This is a test notification from Integra Markets"

# --- Endpoints ---

@router.post("/register-token")
async def register_push_token(
    request: PushTokenRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Register or update a user's push notification token"""
    try:
        # Update user's push token
        current_user.push_token = request.token
        current_user.device_type = request.device_type
        current_user.push_token_updated_at = datetime.utcnow()
        
        db.commit()
        
        return {
            "status": "success",
            "message": "Push token registered successfully",
            "user_id": current_user.id
        }
    except Exception as e:
        logger.error(f"Error registering push token: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to register push token")

@router.get("/preferences")
async def get_notification_preferences(
    current_user: User = Depends(get_current_user)
):
    """Get user's notification preferences"""
    return {
        "push_notifications": current_user.push_notifications_enabled,
        "email_alerts": current_user.email_alerts_enabled,
        "preferences": current_user.notification_preferences or {
            "market_alerts": True,
            "breaking_news": True,
            "price_alerts": True,
            "weekend_updates": False,
            "sound_enabled": True,
            "vibration_enabled": True,
            "alert_frequency": "immediate"
        }
    }

@router.put("/preferences")
async def update_notification_preferences(
    request: NotificationPreferencesRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user's notification preferences"""
    try:
        # Update basic preferences
        current_user.push_notifications_enabled = request.push_notifications
        current_user.email_alerts_enabled = request.email_alerts
        
        # Update detailed preferences
        current_user.notification_preferences = {
            "market_alerts": request.market_alerts,
            "breaking_news": request.breaking_news,
            "price_alerts": request.price_alerts,
            "weekend_updates": request.weekend_updates,
            "sound_enabled": request.sound_enabled,
            "vibration_enabled": request.vibration_enabled,
            "alert_frequency": request.alert_frequency,
            "quiet_hours_start": request.quiet_hours_start,
            "quiet_hours_end": request.quiet_hours_end
        }
        
        db.commit()
        
        return {
            "status": "success",
            "message": "Notification preferences updated",
            "preferences": current_user.notification_preferences
        }
    except Exception as e:
        logger.error(f"Error updating preferences: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update preferences")

@router.post("/send")
async def send_push_notification(
    request: NotificationRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send push notification to specific users or all users"""
    try:
        # Check if user has permission to send to all
        if request.send_to_all and not current_user.is_admin:
            raise HTTPException(status_code=403, detail="Permission denied")
        
        # Get target users
        if request.send_to_all:
            users = db.query(User).filter(
                User.push_token.isnot(None),
                User.push_notifications_enabled == True
            ).all()
        elif request.user_ids:
            users = db.query(User).filter(
                User.id.in_(request.user_ids),
                User.push_token.isnot(None),
                User.push_notifications_enabled == True
            ).all()
        else:
            # Send to current user only
            users = [current_user] if current_user.push_token else []
        
        if not users:
            return {
                "status": "warning",
                "message": "No users with valid push tokens found",
                "sent_count": 0
            }
        
        # Add to background task
        background_tasks.add_task(
            send_expo_push_notifications,
            users,
            request.title,
            request.body,
            request.data,
            request.priority,
            request.channel_id
        )
        
        return {
            "status": "success",
            "message": f"Push notification queued for {len(users)} users",
            "sent_count": len(users)
        }
    except Exception as e:
        logger.error(f"Error sending notification: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send notification")

@router.post("/test")
async def send_test_notification(
    request: TestNotificationRequest,
    current_user: User = Depends(get_current_user)
):
    """Send a test notification to the current user"""
    if not current_user.push_token:
        raise HTTPException(
            status_code=400, 
            detail="No push token registered. Please enable notifications in the app."
        )
    
    try:
        # Send test notification immediately
        result = await send_single_expo_notification(
            current_user.push_token,
            "Test Notification",
            request.message,
            {"type": "test", "timestamp": datetime.utcnow().isoformat()}
        )
        
        return {
            "status": "success",
            "message": "Test notification sent",
            "result": result
        }
    except Exception as e:
        logger.error(f"Error sending test notification: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send test notification")

@router.post("/ai-alert")
async def send_ai_alert_notification(
    alert_data: Dict[str, Any],
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Send AI-generated alert notifications to relevant users"""
    try:
        # Get users interested in this commodity
        commodity = alert_data.get("commodity", "").upper()
        
        # Query users with matching preferences
        users = db.query(User).filter(
            User.push_token.isnot(None),
            User.push_notifications_enabled == True
        ).all()
        
        # Filter users based on their commodity preferences
        relevant_users = []
        for user in users:
            prefs = user.notification_preferences or {}
            if prefs.get("market_alerts", True):
                # Check if user is interested in this commodity
                user_commodities = user.commodities_of_interest or []
                if not user_commodities or commodity in user_commodities or "ALL" in user_commodities:
                    relevant_users.append(user)
        
        if not relevant_users:
            return {
                "status": "info",
                "message": "No users subscribed to this commodity",
                "sent_count": 0
            }
        
        # Prepare notification content
        title = f"🔔 {commodity} Alert: {alert_data.get('action', 'Update')}"
        body = alert_data.get('message', 'New market development')
        
        # Add to background task
        background_tasks.add_task(
            send_expo_push_notifications,
            relevant_users,
            title,
            body,
            {
                "type": "ai_alert",
                "commodity": commodity,
                "action": alert_data.get('action'),
                "confidence": alert_data.get('confidence'),
                "timestamp": datetime.utcnow().isoformat()
            },
            "high",
            "market-alerts"
        )
        
        return {
            "status": "success",
            "message": f"AI alert queued for {len(relevant_users)} users",
            "sent_count": len(relevant_users),
            "commodity": commodity
        }
    except Exception as e:
        logger.error(f"Error sending AI alert: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send AI alert")

# --- Helper Functions ---

async def send_expo_push_notifications(
    users: List[User],
    title: str,
    body: str,
    data: Optional[Dict] = None,
    priority: str = "default",
    channel_id: Optional[str] = None
):
    """Send push notifications via Expo Push Notification Service"""
    messages = []
    
    for user in users:
        if not user.push_token:
            continue
            
        message = {
            "to": user.push_token,
            "title": title,
            "body": body,
            "sound": "default" if user.notification_preferences.get("sound_enabled", True) else None,
            "priority": priority,
            "data": data or {}
        }
        
        # Add channel for Android
        if channel_id and user.device_type == "android":
            message["channelId"] = channel_id
        
        messages.append(message)
    
    # Send in batches of 100
    batch_size = 100
    for i in range(0, len(messages), batch_size):
        batch = messages[i:i + batch_size]
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    EXPO_PUSH_URL,
                    json=batch,
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "application/json"
                    }
                )
                
                if response.status_code != 200:
                    logger.error(f"Expo push error: {response.text}")
                else:
                    result = response.json()
                    logger.info(f"Sent {len(batch)} notifications: {result}")
                    
        except Exception as e:
            logger.error(f"Error sending batch: {str(e)}")

async def send_single_expo_notification(
    token: str,
    title: str,
    body: str,
    data: Optional[Dict] = None
) -> Dict:
    """Send a single push notification and return the result"""
    message = {
        "to": token,
        "title": title,
        "body": body,
        "sound": "default",
        "data": data or {}
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            EXPO_PUSH_URL,
            json=[message],
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json"
            }
        )
        
        if response.status_code != 200:
            raise Exception(f"Expo push error: {response.text}")
        
        return response.json()

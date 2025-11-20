"""
User models for Integra Markets
Includes subscription tiers, LLM usage tracking, and push notifications
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, JSON, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from core.database import Base

class User(Base):
    __tablename__ = "users"
    
    # Primary fields
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String)
    supabase_uid = Column(String, unique=True, index=True)
    
    # Authentication
    hashed_password = Column(String, nullable=True)  # For email auth
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Push notification fields
    push_token = Column(String, nullable=True)
    device_type = Column(String, nullable=True)  # ios, android, web
    push_token_updated_at = Column(DateTime, nullable=True)
    push_notifications_enabled = Column(Boolean, default=True)
    email_alerts_enabled = Column(Boolean, default=False)
    
    # Notification preferences (JSON field for flexibility)
    notification_preferences = Column(JSON, default={
        "market_alerts": True,
        "breaking_news": True,
        "price_alerts": True,
        "weekend_updates": False,
        "sound_enabled": True,
        "vibration_enabled": True,
        "alert_frequency": "immediate"
    })
    
    # User preferences
    commodities_of_interest = Column(JSON, default=[])  # List of commodity symbols
    preferred_language = Column(String, default="en")
    timezone = Column(String, default="UTC")
    
    # Relationships
    subscription = relationship("UserSubscription", back_populates="user", uselist=False)
    llm_usage = relationship("LLMUsage", back_populates="user")
    api_keys = relationship("UserAPIKey", back_populates="user")
    
    def __repr__(self):
        return f"<User {self.email}>"

class SubscriptionTier(Base):
    __tablename__ = "subscription_tiers"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)  # Free, Premium
    price = Column(Float, default=0.0)
    description = Column(Text)
    features = Column(JSON)  # Dict of feature flags and limits
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    subscriptions = relationship("UserSubscription", back_populates="tier")

class UserSubscription(Base):
    __tablename__ = "user_subscriptions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    tier_id = Column(Integer, ForeignKey("subscription_tiers.id"), nullable=False)
    
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    payment_status = Column(String, default="pending")  # pending, paid, cancelled, expired
    stripe_subscription_id = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="subscription")
    tier = relationship("SubscriptionTier", back_populates="subscriptions")

class LLMUsage(Base):
    __tablename__ = "llm_usage"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    date = Column(DateTime, default=datetime.utcnow)
    model_name = Column(String)  # gpt-4, claude, etc.
    endpoint = Column(String)  # Which API endpoint was called
    tokens_used = Column(Integer, default=0)
    cost = Column(Float, default=0.0)
    
    # Relationships
    user = relationship("User", back_populates="llm_usage")

class UserAPIKey(Base):
    __tablename__ = "user_api_keys"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    key_hash = Column(String, nullable=False)  # Hashed API key
    key_prefix = Column(String, nullable=False)  # First 8 chars for identification
    name = Column(String)  # User-friendly name
    permissions = Column(JSON, default=[])  # List of allowed endpoints
    
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    
    # Relationships
    user = relationship("User", back_populates="api_keys")

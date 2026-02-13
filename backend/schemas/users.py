from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class UserBase(BaseModel):
    """Base user schema"""
    email: EmailStr
    full_name: Optional[str] = None
    is_active: bool = True

class UserCreate(UserBase):
    """Schema for creating a new user"""
    password: str

class UserUpdate(BaseModel):
    """Schema for updating a user"""
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    is_premium: Optional[bool] = None

class UserInDB(UserBase):
    """Schema for user stored in database"""
    id: int
    supabase_uid: Optional[str] = None
    is_premium: bool
    last_login: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class User(UserInDB):
    """Schema for user response"""
    pass

# Subscription Tier Schemas
class SubscriptionTierBase(BaseModel):
    """Base subscription tier schema"""
    name: str
    price: float = 0.0
    description: Optional[str] = None
    features: Dict[str, Any] = {}

class SubscriptionTierCreate(SubscriptionTierBase):
    """Schema for creating a subscription tier"""
    pass

class SubscriptionTierUpdate(BaseModel):
    """Schema for updating a subscription tier"""
    name: Optional[str] = None
    price: Optional[float] = None
    description: Optional[str] = None
    features: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

class SubscriptionTier(SubscriptionTierBase):
    """Schema for subscription tier response"""
    id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

# User Subscription Schemas
class UserSubscriptionBase(BaseModel):
    """Base user subscription schema"""
    tier_id: int
    end_date: datetime
    payment_status: str = "free"

class UserSubscriptionCreate(UserSubscriptionBase):
    """Schema for creating a user subscription"""
    user_id: int

class UserSubscriptionUpdate(BaseModel):
    """Schema for updating a user subscription"""
    tier_id: Optional[int] = None
    end_date: Optional[datetime] = None
    is_active: Optional[bool] = None
    payment_status: Optional[str] = None

class UserSubscription(UserSubscriptionBase):
    """Schema for user subscription response"""
    id: int
    user_id: int
    start_date: datetime
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class WatchlistItemBase(BaseModel):
    """Base watchlist item schema"""
    commodity_id: int

class WatchlistItemCreate(WatchlistItemBase):
    """Schema for creating a watchlist item"""
    pass

class WatchlistItem(WatchlistItemBase):
    """Schema for watchlist item response"""
    id: int
    user_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    """Schema for JWT token"""
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    """Schema for JWT token data"""
    user_id: Optional[str] = None

class LLMUsageCreate(BaseModel):
    """Schema for creating LLM usage record"""
    request_type: str = "analysis"
    tokens_used: int = 1
    feature_used: Optional[str] = None

class LLMUsage(LLMUsageCreate):
    """Schema for LLM usage response"""
    id: int
    user_id: int
    timestamp: datetime
    
    class Config:
        from_attributes = True

class UserWithUsage(User):
    """Schema for user with LLM usage information"""
    daily_usage: int
    daily_limit: int

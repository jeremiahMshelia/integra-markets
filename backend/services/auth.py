from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import httpx
import logging
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from core.config import settings
from core.database import get_db
from models.users import User, UserSubscription, SubscriptionTier, LLMUsage
from schemas.users import UserCreate

# Configure logging
logger = logging.getLogger(__name__)

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 password bearer for token authentication
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/token")

class AuthService:
    """Service for user authentication and authorization using Supabase Auth"""
    
    def __init__(self, db: Session):
        self.db = db
        self.supabase_url = settings.SUPABASE_URL
        self.supabase_key = settings.SUPABASE_KEY
        self.jwt_secret = settings.JWT_SECRET
    
    async def initialize_subscription_tiers(self) -> list[SubscriptionTier]:
        """Initialize default subscription tiers if they don't exist"""
        # Check if tiers already exist
        existing_tiers = self.db.query(SubscriptionTier).all()
        if existing_tiers:
            return existing_tiers
        
        # Define default tiers
        tier_data = [
            {
                "name": "Free",
                "price": 0.0,
                "description": "Basic access with limited features",
                "features": {
                    "llm_daily_limit": settings.FREE_TIER_DAILY_LLM_LIMIT,
                    "historical_data_days": 7,
                    "real_time_updates": False,
                    "advanced_analytics": False,
                    "email_alerts": False,
                    "api_access": False
                }
            },
            {
                "name": "Premium",
                "price": 19.99,
                "description": "Full access to all features",
                "features": {
                    "llm_daily_limit": 20,
                    "historical_data_days": 365,
                    "real_time_updates": True,
                    "advanced_analytics": True,
                    "email_alerts": True,
                    "api_access": True
                }
            }
        ]
        
        # Create tiers
        created_tiers = []
        for data in tier_data:
            tier = SubscriptionTier(
                name=data["name"],
                price=data["price"],
                description=data["description"],
                features=data["features"]
            )
            self.db.add(tier)
            created_tiers.append(tier)
        
        self.db.commit()
        for tier in created_tiers:
            self.db.refresh(tier)
        
        return created_tiers
    
    async def signup(self, user_data: UserCreate) -> dict[str, Any]:
        """Register a new user with Supabase Auth"""
        # Check if user already exists
        existing_user = self.db.query(User).filter(User.email == user_data.email).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists"
            )
        
        # Create user in Supabase Auth
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.supabase_url}/auth/v1/signup",
                    json={
                        "email": user_data.email,
                        "password": user_data.password,
                    },
                    headers={
                        "apikey": self.supabase_key,
                        "Content-Type": "application/json"
                    }
                )
                response.raise_for_status()
                auth_data = response.json()
                
                # Extract Supabase user ID
                supabase_user_id = auth_data.get("user", {}).get("id")
                if not supabase_user_id:
                    raise ValueError("Failed to get user ID from Supabase")
                
                # Get free tier
                free_tier = self.db.query(SubscriptionTier).filter(
                    SubscriptionTier.name == "Free"
                ).first()
                
                if not free_tier:
                    # Initialize tiers if they don't exist
                    tiers = await self.initialize_subscription_tiers()
                    free_tier = next((t for t in tiers if t.name == "Free"), None)
                
                # Create user in our database
                new_user = User(
                    email=user_data.email,
                    full_name=user_data.full_name,
                    supabase_uid=supabase_user_id,
                    is_active=True,
                    created_at=datetime.utcnow()
                )
                self.db.add(new_user)
                self.db.commit()
                self.db.refresh(new_user)
                
                # Create subscription (free tier by default)
                subscription = UserSubscription(
                    user_id=new_user.id,
                    tier_id=free_tier.id,
                    start_date=datetime.utcnow(),
                    end_date=datetime.utcnow() + timedelta(days=365),  # 1 year free tier
                    is_active=True,
                    payment_status="free"
                )
                self.db.add(subscription)
                self.db.commit()
                
                return {
                    "user_id": new_user.id,
                    "email": new_user.email,
                    "full_name": new_user.full_name,
                    "subscription_tier": free_tier.name,
                    "message": "User created successfully"
                }
        except httpx.HTTPStatusError as e:
            logger.error(f"Supabase signup error: {str(e)}")
            # Check if it's a duplicate email error
            if e.response.status_code == 400 and "already registered" in e.response.text:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="User with this email already exists"
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error creating user: {str(e)}"
            )
        except Exception as e:
            logger.error(f"Signup error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error creating user: {str(e)}"
            )
    
    async def login(self, email: str, password: str) -> dict[str, Any]:
        """Login user with Supabase Auth"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.supabase_url}/auth/v1/token?grant_type=password",
                    json={
                        "email": email,
                        "password": password,
                    },
                    headers={
                        "apikey": self.supabase_key,
                        "Content-Type": "application/json"
                    }
                )
                response.raise_for_status()
                auth_data = response.json()
                
                # Get access token and user ID
                access_token = auth_data.get("access_token")
                supabase_user_id = auth_data.get("user", {}).get("id")
                
                if not access_token or not supabase_user_id:
                    raise ValueError("Invalid authentication response")
                
                # Get user from our database
                user = self.db.query(User).filter(User.supabase_uid == supabase_user_id).first()
                
                if not user:
                    # User exists in Supabase but not in our DB (should not happen)
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="User not found in application database"
                    )
                
                # Update last login
                user.last_login = datetime.utcnow()
                self.db.commit()
                
                # Get subscription info
                subscription = self.db.query(UserSubscription).filter(
                    UserSubscription.user_id == user.id,
                    UserSubscription.is_active == True
                ).first()
                
                tier_name = "None"
                if subscription:
                    tier = self.db.query(SubscriptionTier).filter(
                        SubscriptionTier.id == subscription.tier_id
                    ).first()
                    tier_name = tier.name if tier else "Unknown"
                
                return {
                    "access_token": access_token,
                    "token_type": "bearer",
                    "user_id": user.id,
                    "email": user.email,
                    "full_name": user.full_name,
                    "subscription_tier": tier_name
                }
        except httpx.HTTPStatusError as e:
            logger.error(f"Supabase login error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
        except Exception as e:
            logger.error(f"Login error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Login error: {str(e)}"
            )
    
    async def get_user_subscription(self, user_id: int) -> dict[str, Any]:
        """Get user subscription details"""
        # Get active subscription
        subscription = self.db.query(UserSubscription).filter(
            UserSubscription.user_id == user_id,
            UserSubscription.is_active == True
        ).first()
        
        if not subscription:
            return {
                "user_id": user_id,
                "has_subscription": False,
                "tier": None,
                "features": {}
            }
        
        # Get tier details
        tier = self.db.query(SubscriptionTier).filter(
            SubscriptionTier.id == subscription.tier_id
        ).first()
        
        if not tier:
            return {
                "user_id": user_id,
                "has_subscription": True,
                "tier": "Unknown",
                "features": {}
            }
        
        return {
            "user_id": user_id,
            "has_subscription": True,
            "tier": tier.name,
            "price": tier.price,
            "start_date": subscription.start_date.isoformat(),
            "end_date": subscription.end_date.isoformat(),
            "days_remaining": (subscription.end_date - datetime.utcnow()).days,
            "payment_status": subscription.payment_status,
            "features": tier.features
        }
    
    async def upgrade_subscription(self, user_id: int, tier_name: str) -> dict[str, Any]:
        """Upgrade user to a premium subscription tier"""
        # Get user
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Get tier
        tier = self.db.query(SubscriptionTier).filter(
            SubscriptionTier.name == tier_name
        ).first()
        
        if not tier:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Subscription tier '{tier_name}' not found"
            )
        
        # Deactivate current subscription if exists
        current_subscription = self.db.query(UserSubscription).filter(
            UserSubscription.user_id == user_id,
            UserSubscription.is_active == True
        ).first()
        
        if current_subscription:
            current_subscription.is_active = False
            current_subscription.end_date = datetime.utcnow()
        
        # Create new subscription
        new_subscription = UserSubscription(
            user_id=user_id,
            tier_id=tier.id,
            start_date=datetime.utcnow(),
            end_date=datetime.utcnow() + timedelta(days=30),  # 30-day subscription
            is_active=True,
            payment_status="paid" if tier.price > 0 else "free"
        )
        
        self.db.add(new_subscription)
        self.db.commit()
        self.db.refresh(new_subscription)
        
        return {
            "user_id": user_id,
            "subscription_id": new_subscription.id,
            "tier": tier.name,
            "price": tier.price,
            "start_date": new_subscription.start_date.isoformat(),
            "end_date": new_subscription.end_date.isoformat(),
            "features": tier.features,
            "message": f"Subscription upgraded to {tier.name}"
        }
    
    def verify_token(self, token: str) -> dict[str, Any]:
        """Verify JWT token from Supabase Auth"""
        try:
            # For a real implementation, you'd need to verify with Supabase's JWKS
            # This is a simplified version
            payload = jwt.decode(
                token, 
                self.jwt_secret,
                algorithms=["HS256"],
                options={"verify_signature": False}  # In production, this should be True
            )
            
            # Get user from database
            user = self.db.query(User).filter(User.supabase_uid == payload.get("sub")).first()
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid user"
                )
            
            return {"user_id": user.id, "email": user.email}
        except jwt.PyJWTError as e:
            logger.error(f"Token verification error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
    
    async def check_feature_access(self, user_id: int, feature: str) -> bool:
        """Check if user has access to a specific feature based on subscription"""
        subscription_data = await self.get_user_subscription(user_id)
        
        if not subscription_data["has_subscription"]:
            return False
        
        features = subscription_data.get("features", {})
        return features.get(feature, False)
    
    async def track_llm_usage(self, user_id: int) -> dict[str, Any]:
        """Track LLM usage for a user and check if they've reached their limit"""
        # Get user's subscription
        subscription_data = await self.get_user_subscription(user_id)
        
        # Get daily limit from subscription
        daily_limit = subscription_data.get("features", {}).get("llm_daily_limit", 0)
        
        # Get today's usage
        today = datetime.utcnow().date()
        today_start = datetime.combine(today, datetime.min.time())
        today_end = datetime.combine(today, datetime.max.time())
        
        usage_count = self.db.query(LLMUsage).filter(
            LLMUsage.user_id == user_id,
            LLMUsage.timestamp >= today_start,
            LLMUsage.timestamp <= today_end
        ).count()
        
        # Check if user has reached their limit
        if usage_count >= daily_limit:
            return {
                "user_id": user_id,
                "can_use_llm": False,
                "usage_count": usage_count,
                "daily_limit": daily_limit,
                "remaining": 0,
                "message": "Daily LLM usage limit reached"
            }
        
        # Record new usage
        new_usage = LLMUsage(
            user_id=user_id,
            timestamp=datetime.utcnow(),
            request_type="analysis"
        )
        
        self.db.add(new_usage)
        self.db.commit()
        
        return {
            "user_id": user_id,
            "can_use_llm": True,
            "usage_count": usage_count + 1,
            "daily_limit": daily_limit,
            "remaining": daily_limit - (usage_count + 1),
            "message": "LLM usage recorded"
        }

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Generate a password hash"""
    return pwd_context.hash(password)

def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    """Authenticate a user by email and password"""
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token"""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    
    return encoded_jwt

async def get_current_user(
    token: str = Depends(oauth2_scheme), 
    db: Session = Depends(get_db)
) -> User:
    """Get the current authenticated user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(
            token, 
            settings.JWT_SECRET_KEY, 
            algorithms=[settings.JWT_ALGORITHM]
        )
        user_id: str = payload.get("sub")
        
        if user_id is None:
            raise credentials_exception
            
        token_data = TokenData(user_id=user_id)
    except JWTError:
        raise credentials_exception
        
    user = db.query(User).filter(User.id == token_data.user_id).first()
    
    if user is None:
        raise credentials_exception
        
    return user

async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get the current active user"""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    return current_user

async def get_premium_user(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """Get the current premium user"""
    if not current_user.is_premium:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Premium subscription required for this feature"
        )
    return current_user

from pydantic import BaseModel, Field, HttpUrl, field_validator
from typing import Optional, List
from datetime import datetime

class NewsArticleBase(BaseModel):
    """Base news article schema"""
    title: str
    content: str
    summary: Optional[str] = None
    url: HttpUrl
    source: str
    published_at: datetime

class NewsArticleCreate(NewsArticleBase):
    """Schema for creating a news article"""
    pass

class NewsArticle(NewsArticleBase):
    """Schema for news article response"""
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class SentimentResultBase(BaseModel):
    """Base sentiment result schema"""
    sentiment_score: float = Field(..., ge=-1.0, le=1.0)
    confidence: float = Field(..., ge=0.0, le=1.0)
    analysis_method: str
    llm_enhanced: bool = False
    analysis: Optional[str] = None

class SentimentResultCreate(SentimentResultBase):
    """Schema for creating sentiment result"""
    news_id: int
    commodity_id: int

class SentimentResult(SentimentResultBase):
    """Schema for sentiment result response"""
    id: int
    news_id: int
    commodity_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class NewsWithSentiment(NewsArticle):
    """Schema for news article with sentiment information"""
    sentiment_results: List[SentimentResult] = []
    commodities: List[int] = []

class MarketNarrativeBase(BaseModel):
    """Base market narrative schema"""
    narrative: str
    is_premium: bool = False

class MarketNarrativeCreate(MarketNarrativeBase):
    """Schema for creating market narrative"""
    commodity_id: int
    date: datetime

class MarketNarrative(MarketNarrativeBase):
    """Schema for market narrative response"""
    id: int
    commodity_id: int
    date: datetime
    created_at: datetime
    
    class Config:
        from_attributes = True

class NewsFeedItem(BaseModel):
    """Schema for news feed item"""
    article: NewsArticle
    sentiment_score: float
    confidence: float
    commodities: List[int]
    llm_enhanced: bool = False
    analysis: Optional[str] = None

# News Sources schemas
class NewsSourceBase(BaseModel):
    """Base schema for news sources"""
    name: str
    url: str
    description: Optional[str] = None

    @field_validator('url')
    @classmethod
    def validate_url(cls, v):
        """Validate URL format"""
        # Basic validation - could be enhanced with regex
        if not v.startswith(('http://', 'https://')):
            v = 'https://' + v
        return v

class NewsSourceCreate(NewsSourceBase):
    """Schema for creating a news source (admin)"""
    pass

class NewsSourceSubmitRequest(BaseModel):
    """Schema for submitting a news source by a user"""
    url: str
    name: Optional[str] = None
    description: Optional[str] = None

    @field_validator('url')
    @classmethod
    def validate_url(cls, v):
        """Validate URL format"""
        # Basic validation - could be enhanced with regex
        if not v.startswith(('http://', 'https://')):
            v = 'https://' + v
        return v

class NewsSourceResponse(NewsSourceBase):
    """Schema for news source response"""
    id: int
    is_active: bool
    is_verified: bool
    is_user_submitted: bool
    reliability_score: Optional[float] = None
    created_at: datetime
    added_by_user_id: Optional[int] = None
    
    class Config:
        from_attributes = True

class UserSourceSubmissionResponse(BaseModel):
    """Schema for user source submission response"""
    id: int
    user_id: int
    source_id: int
    status: str
    notes: Optional[str] = None
    submitted_at: datetime
    processed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class NewsSourceSubmitResponse(BaseModel):
    """Schema for news source submission response"""
    status: str
    message: str
    source: Optional[NewsSourceResponse] = None
    submission: Optional[UserSourceSubmissionResponse] = None

class NewsSourcesUserResponse(BaseModel):
    """Schema for user's news sources"""
    submitted: List[NewsSourceResponse] = []
    subscribed: List[NewsSourceResponse] = []
    pending: List[NewsSourceResponse] = []

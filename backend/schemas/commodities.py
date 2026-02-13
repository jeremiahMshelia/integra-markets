from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class CommodityBase(BaseModel):
    """Base commodity schema"""
    name: str
    symbol: str
    category: str
    description: Optional[str] = None

class CommodityCreate(CommodityBase):
    """Schema for creating a new commodity"""
    pass

class CommodityUpdate(BaseModel):
    """Schema for updating a commodity"""
    name: Optional[str] = None
    symbol: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None

class Commodity(CommodityBase):
    """Schema for commodity response"""
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class PriceDataBase(BaseModel):
    """Base price data schema"""
    date: datetime
    open_price: float
    high_price: float
    low_price: float
    close_price: float
    volume: Optional[float] = None
    source: str

class PriceDataCreate(PriceDataBase):
    """Schema for creating price data"""
    commodity_id: int

class PriceData(PriceDataBase):
    """Schema for price data response"""
    id: int
    commodity_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class CommodityWithPrice(Commodity):
    """Schema for commodity with latest price data"""
    latest_price: Optional[PriceData] = None
    price_change_percent: Optional[float] = None
    sentiment_score: Optional[float] = None

class CommoditySummary(BaseModel):
    """Schema for commodity summary with sentiment and weather impact"""
    commodity: Commodity
    current_price: Optional[float] = None
    price_change_percent: Optional[float] = None
    sentiment_score: Optional[float] = None
    sentiment_confidence: Optional[float] = None
    weather_impact_score: Optional[float] = None
    weather_impact_confidence: Optional[float] = None
    narrative: Optional[str] = None

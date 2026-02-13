from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class LocationBase(BaseModel):
    """Base location schema"""
    name: str
    latitude: float
    longitude: float
    country: str
    region: Optional[str] = None
    city: Optional[str] = None

class LocationCreate(LocationBase):
    """Schema for creating a new location"""
    pass

class Location(LocationBase):
    """Schema for location response"""
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class WeatherDataBase(BaseModel):
    """Base weather data schema"""
    timestamp: datetime
    temperature: float
    feels_like: Optional[float] = None
    humidity: Optional[float] = None
    pressure: Optional[float] = None
    wind_speed: Optional[float] = None
    wind_direction: Optional[float] = None
    precipitation: Optional[float] = None
    weather_condition: str
    weather_description: Optional[str] = None
    source: str

class WeatherDataCreate(WeatherDataBase):
    """Schema for creating weather data"""
    location_id: int

class WeatherData(WeatherDataBase):
    """Schema for weather data response"""
    id: int
    location_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class WeatherDataWithLocation(WeatherData):
    """Schema for weather data with location information"""
    location: Location

class InfrastructureBase(BaseModel):
    """Base infrastructure schema"""
    name: str
    type: str
    capacity: Optional[float] = None
    description: Optional[str] = None

class InfrastructureCreate(InfrastructureBase):
    """Schema for creating infrastructure"""
    location_id: int
    commodity_id: Optional[int] = None

class Infrastructure(InfrastructureBase):
    """Schema for infrastructure response"""
    id: int
    location_id: int
    commodity_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class WeatherImpactBase(BaseModel):
    """Base weather impact schema"""
    impact_score: float = Field(..., ge=-1.0, le=1.0)
    confidence: float = Field(..., ge=0.0, le=1.0)
    is_anomaly: bool = False
    analysis: Optional[str] = None

class WeatherImpactCreate(WeatherImpactBase):
    """Schema for creating weather impact"""
    weather_data_id: int
    commodity_id: int

class WeatherImpact(WeatherImpactBase):
    """Schema for weather impact response"""
    id: int
    weather_data_id: int
    commodity_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class WeatherAlert(BaseModel):
    """Schema for weather alert"""
    location: Location
    weather_data: WeatherData
    commodities_affected: List[int]
    impact_score: float
    confidence: float
    is_anomaly: bool
    analysis: Optional[str] = None

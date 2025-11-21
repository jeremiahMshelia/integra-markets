"""
Configuration settings for the Integra Markets application.
"""
import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from functools import lru_cache
from typing import Optional, List

class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Environment
    ENVIRONMENT: str = Field("development", env="ENVIRONMENT")
    DEBUG: bool = Field(True, env="DEBUG")
    LOG_LEVEL: str = Field("INFO", env="LOG_LEVEL")
    
    # Database
    DATABASE_URL: str = Field("sqlite:///./integra.db", env="DATABASE_URL")
    
    # API Keys
    OPENAI_API_KEY: Optional[str] = Field(None, env="OPENAI_API_KEY")
    OPENWEATHERMAP_API_KEY: Optional[str] = Field(None, env="OPENWEATHERMAP_API_KEY")
    ALPHA_VANTAGE_API_KEY: Optional[str] = Field(None, env="ALPHA_VANTAGE_API_KEY")
    HUGGING_FACE_TOKEN: Optional[str] = Field(None, env="HUGGING_FACE_TOKEN")
    GROQ_API_KEY: Optional[str] = Field(None, env="GROQ_API_KEY")
    
    # Supabase
    SUPABASE_URL: Optional[str] = Field(None, env="SUPABASE_URL")
    SUPABASE_KEY: Optional[str] = Field(None, env="SUPABASE_KEY")
    
    # Feature Flags
    ENABLE_LLM_FEATURES: bool = Field(True, env="ENABLE_LLM_FEATURES")
    FREE_TIER_DAILY_LLM_LIMIT: int = Field(2, env="FREE_TIER_DAILY_LLM_LIMIT")
    
    # Model Configuration
    MODELS_DIR: str = Field("./models", env="MODELS_DIR")
    
    # FinBERT Configuration
    FINBERT_MODEL: str = Field("ProsusAI/finbert", env="FINBERT_MODEL")
    FINBERT_CACHE_DIR: str = Field("./models/finbert", env="FINBERT_CACHE_DIR")
    
    # NLTK Data Path
    NLTK_DATA_PATH: str = Field("./models/nltk_data", env="NLTK_DATA_PATH")
    
    # Model Download Configuration
    AUTO_DOWNLOAD_MODELS: bool = Field(False, env="AUTO_DOWNLOAD_MODELS")
    MODELS_BUNDLE_URL: Optional[str] = Field(None, env="MODELS_BUNDLE_URL")
    OFFLINE_MODE: bool = Field(False, env="OFFLINE_MODE")
    
    # API Configuration
    API_V1_STR: str = Field("/api", env="API_V1_STR")
    HOST: str = Field("0.0.0.0", env="HOST")
    PORT: int = Field(8000, env="PORT")
    EXPO_PUBLIC_API_URL: Optional[str] = Field(None, env="EXPO_PUBLIC_API_URL")
    
    # CORS
    CORS_ORIGINS: List[str] = Field(["*"], env="CORS_ORIGINS")
    
    # Email Configuration (Zoho Mail)
    ZOHO_MAIL_SMTP_HOST: str = Field("smtp.zoho.com", env="ZOHO_MAIL_SMTP_HOST")
    ZOHO_MAIL_SMTP_PORT: int = Field(587, env="ZOHO_MAIL_SMTP_PORT")
    ZOHO_MAIL_FROM_EMAIL: Optional[str] = Field(None, env="ZOHO_MAIL_FROM_EMAIL")
    ZOHO_MAIL_FROM_NAME: str = Field("Integra Markets", env="ZOHO_MAIL_FROM_NAME")
    ZOHO_MAIL_CLIENT_ID: Optional[str] = Field(None, env="ZOHO_MAIL_CLIENT_ID")
    ZOHO_MAIL_CLIENT_SECRET: Optional[str] = Field(None, env="ZOHO_MAIL_CLIENT_SECRET")
    ZOHO_MAIL_REFRESH_TOKEN: Optional[str] = Field(None, env="ZOHO_MAIL_REFRESH_TOKEN")
    ZOHO_MAIL_APP_PASSWORD: Optional[str] = Field(None, env="ZOHO_MAIL_APP_PASSWORD")
    
    # Use SettingsConfigDict instead of the old Config class
    # Try loading from both the app-level .env and the project root ../.env
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

@lru_cache()
def get_settings() -> Settings:
    """
    Get application settings from environment variables.
    
    Returns:
        Settings: Application settings.
    """
    return Settings()

# Create a global settings object
settings = get_settings()

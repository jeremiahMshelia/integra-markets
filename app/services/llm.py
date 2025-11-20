import os
import json
import logging
from typing import Dict, Any, Optional, List, Union
from datetime import datetime, date
import httpx
from sqlalchemy.orm import Session

from core.config import settings
from models.users import User, LLMUsage
from models.commodities import Commodity
from schemas.users import LLMUsageCreate

# Configure logging
logger = logging.getLogger(__name__)

class LLMService:
    """Service for LLM API integration (OpenAI or Anthropic)"""
    
    def __init__(self, db: Session):
        self.db = db
        self.openai_api_key = settings.OPENAI_API_KEY
        self.provider = "openai"  # Default provider
        
        # Initialize client based on available API keys
        if not self.openai_api_key:
            # Fallback to Anthropic if OpenAI key not available
            self.provider = "anthropic"
            self.anthropic_api_key = settings.ANTHROPIC_API_KEY
    
    async def check_usage_limit(self, user: User) -> Dict[str, Any]:
        """Check if user has reached their daily LLM usage limit"""
        if user.is_premium:
            # Premium users have unlimited usage
            return {
                "allowed": True,
                "daily_usage": 0,
                "daily_limit": -1  # -1 indicates unlimited
            }
        
        # Get today's date (UTC)
        today = datetime.utcnow().date()
        
        # Query today's usage
        today_start = datetime.combine(today, datetime.min.time())
        today_end = datetime.combine(today, datetime.max.time())
        
        daily_usage = self.db.query(LLMUsage).filter(
            LLMUsage.user_id == user.id,
            LLMUsage.timestamp >= today_start,
            LLMUsage.timestamp <= today_end
        ).count()
        
        # Check if user has reached their limit
        daily_limit = settings.FREE_TIER_DAILY_LLM_LIMIT
        allowed = daily_usage < daily_limit
        
        return {
            "allowed": allowed,
            "daily_usage": daily_usage,
            "daily_limit": daily_limit
        }
    
    async def record_usage(self, user: User, tokens_used: int, feature_used: str) -> None:
        """Record LLM API usage for a user"""
        usage = LLMUsage(
            user_id=user.id,
            tokens_used=tokens_used,
            feature_used=feature_used,
            usage_date=datetime.utcnow()
        )
        self.db.add(usage)
        self.db.commit()
    
    async def generate_completion(
        self, 
        prompt: str, 
        user: User,
        feature: str,
        max_tokens: int = 500,
        temperature: float = 0.7
    ) -> Optional[str]:
        """Generate text completion using LLM API"""
        # Check usage limits for free tier users
        usage_check = await self.check_usage_limit(user)
        if not usage_check["allowed"]:
            logger.warning(f"User {user.id} has reached daily LLM limit")
            return None
        
        try:
            if self.provider == "openai":
                return await self._generate_openai_completion(
                    prompt, user, feature, max_tokens, temperature
                )
            elif self.provider == "anthropic":
                # Implement Anthropic API integration
                pass
            else:
                logger.error(f"Unknown LLM provider: {self.provider}")
                return None
        except Exception as e:
            logger.error(f"Error generating LLM completion: {str(e)}")
            return None
    
    async def _generate_openai_completion(
        self, 
        prompt: str, 
        user: User,
        feature: str,
        max_tokens: int,
        temperature: float
    ) -> Optional[str]:
        """Generate text completion using OpenAI API"""
        if not self.openai_api_key:
            logger.error("OpenAI API key not configured")
            return None
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.openai_api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": "gpt-4",
                        "messages": [
                            {"role": "system", "content": "You are a financial and commodity markets analyst with expertise in weather impacts and market sentiment."},
                            {"role": "user", "content": prompt}
                        ],
                        "max_tokens": max_tokens,
                        "temperature": temperature
                    },
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    logger.error(f"OpenAI API error: {response.text}")
                    return None
                
                result = response.json()
                completion_text = result["choices"][0]["message"]["content"]
                
                # Record token usage
                tokens_used = result["usage"]["total_tokens"]
                await self.record_usage(user, tokens_used, feature)
                
                return completion_text
        except Exception as e:
            logger.error(f"Error calling OpenAI API: {str(e)}")
            return None
    
    async def summarize_news(
        self, 
        news_text: str, 
        commodity_context: str,
        user: User
    ) -> Optional[str]:
        """Summarize news articles with commodity context"""
        prompt = f"""
        Summarize the following news article in the context of its impact on {commodity_context} markets.
        Focus on key points relevant to traders and potential market impacts.
        Keep the summary concise (3-5 sentences).
        
        NEWS ARTICLE:
        {news_text}
        """
        
        return await self.generate_completion(
            prompt=prompt,
            user=user,
            feature="summarize_news",
            max_tokens=200,
            temperature=0.5
        )
    
    async def explain_weather_impact(
        self, 
        weather_data: Dict[str, Any],
        commodity_context: str,
        user: User
    ) -> Optional[str]:
        """Explain weather impact on commodity markets"""
        weather_json = json.dumps(weather_data, default=str)
        
        prompt = f"""
        Analyze the following weather data and explain its potential impact on {commodity_context} markets.
        Focus on how these weather conditions might affect production, transportation, or demand.
        
        WEATHER DATA:
        {weather_json}
        """
        
        return await self.generate_completion(
            prompt=prompt,
            user=user,
            feature="explain_weather_impact",
            max_tokens=300,
            temperature=0.7
        )
    
    async def generate_market_narrative(
        self,
        sentiment_data: Dict[str, Any],
        price_data: Dict[str, Any],
        user: User
    ) -> Optional[str]:
        """Generate market narrative based on sentiment and price data"""
        sentiment_json = json.dumps(sentiment_data, default=str)
        price_json = json.dumps(price_data, default=str)
        
        prompt = f"""
        Generate a market narrative based on the following sentiment and price data.
        Explain the relationship between market sentiment and price movements.
        Highlight key factors driving the market and potential future implications.
        
        SENTIMENT DATA:
        {sentiment_json}
        
        PRICE DATA:
        {price_json}
        """
        
        return await self.generate_completion(
            prompt=prompt,
            user=user,
            feature="generate_market_narrative",
            max_tokens=400,
            temperature=0.7
        )
    
    async def predict_price_impact(
        self,
        weather_anomaly: Dict[str, Any],
        historical_patterns: Dict[str, Any],
        user: User
    ) -> Optional[str]:
        """Predict price impact based on weather anomalies and historical patterns"""
        # This is a premium feature
        if not user.is_premium:
            logger.warning(f"Non-premium user {user.id} attempted to access premium feature")
            return None
            
        weather_json = json.dumps(weather_anomaly, default=str)
        history_json = json.dumps(historical_patterns, default=str)
        
        prompt = f"""
        Predict the potential price impact of the following weather anomaly based on historical patterns.
        Provide a quantitative estimate if possible and explain your reasoning.
        
        WEATHER ANOMALY:
        {weather_json}
        
        HISTORICAL PATTERNS:
        {history_json}
        """
        
        return await self.generate_completion(
            prompt=prompt,
            user=user,
            feature="predict_price_impact",
            max_tokens=500,
            temperature=0.7
        )

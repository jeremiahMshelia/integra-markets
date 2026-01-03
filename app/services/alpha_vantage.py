"""
Alpha Vantage API integration for Integra Markets.
This module provides market data and news from Alpha Vantage API.
"""
import os
import logging
import httpx
import asyncio
import json
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta

try:
    import pandas as pd  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    pd = None  # type: ignore

from core.config import settings
from services.enhanced_caching import cache_manager, get_cached_market_data, cache_market_data

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AlphaVantageClient:
    """
    Client for the Alpha Vantage API that provides market data and news.
    Implements enhanced caching to reduce API calls and respect rate limits.
    """
    
    _instance = None  # Singleton instance
    
    def __new__(cls):
        """Implement singleton pattern for API client reuse"""
        if cls._instance is None:
            cls._instance = super(AlphaVantageClient, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        """Initialize the Alpha Vantage API client"""
        if self._initialized:
            return
            
        logger.info("Initializing Alpha Vantage API client with enhanced caching")
        self._initialized = True
        
        # Get API key from settings
        self.api_key = settings.ALPHA_VANTAGE_API_KEY
        if not self.api_key:
            logger.warning("No Alpha Vantage API key found. Some features will be unavailable.")
            self._initialized = False
            return
        
        # Base URL for API calls
        self.base_url = "https://www.alphavantage.co/query"
        
        # Create async HTTP client
        self.client = httpx.AsyncClient(timeout=30.0)
        
        # Enhanced cache expiry times for production use (aggressive caching for 100-1000 users)
        self.cache_ttl = {
            "intraday": 600,         # 10 minutes
            "daily": 21600,          # 6 hours 
            "news": 10800,           # 3 hours
            "search": 86400,         # 24 hours
            "indicators": 21600,     # 6 hours
            "commodities": 3600      # 1 hour
        }
        
        # Rate limiting protection (more aggressive for high user load)
        self.last_request_time = 0
        self.min_request_interval = 15  # 15 seconds between requests (4 per minute for safety)
        self.request_queue = []
        
        # Commodities mapping for Alpha Vantage
        self.commodities_mapping = {
            "OIL": "WTI",       # West Texas Intermediate Crude Oil
            "BRENT": "BRENT",   # Brent Crude Oil
            "NAT GAS": "NATURAL_GAS",
            "GOLD": "GOLD",
            "SILVER": "SILVER",
            "COPPER": "COPPER",
            "ALUMINUM": "ALUMINUM",
            "WHEAT": "WHEAT",
            "CORN": "CORN",
            "COTTON": "COTTON",
            "SUGAR": "SUGAR",
            "COFFEE": "COFFEE"
        }
        
        logger.info("Alpha Vantage API client initialized with production-grade caching")
    
    async def close(self):
        """Close the HTTP client"""
        if hasattr(self, 'client'):
            await self.client.aclose()
    
    def _generate_cache_key(self, params: Dict[str, Any]) -> str:
        """Generate a consistent cache key from request parameters"""
        # Remove API key from cache key for security
        cache_params = {k: v for k, v in params.items() if k != "apikey"}
        param_str = "&".join([f"{k}={v}" for k, v in sorted(cache_params.items())])
        return param_str
    
    async def _make_request(self, params: Dict[str, Any], cache_group: str = "daily") -> Dict[str, Any]:
        """
        Make a request to the Alpha Vantage API with enhanced caching.
        
        Args:
            params: API request parameters
            cache_group: Cache group for TTL determination
            
        Returns:
            API response data
        """
        if not self._initialized:
            logger.error("Alpha Vantage client not initialized. Missing API key?")
            return {"error": "Client not initialized"}
        
        # Generate cache key
        cache_key = self._generate_cache_key(params)
        
        # Check enhanced cache first
        cached_data = cache_manager.get("alpha_vantage", cache_key)
        if cached_data is not None:
            logger.debug(f"Enhanced cache HIT for Alpha Vantage: {params.get('function', 'unknown')}")
            return cached_data
        
        # Add API key to params for the request
        request_params = params.copy()
        request_params["apikey"] = self.api_key
        
        # Rate limiting protection
        current_time = datetime.now().timestamp()
        time_since_last = current_time - self.last_request_time
        if time_since_last < self.min_request_interval:
            wait_time = self.min_request_interval - time_since_last
            logger.info(f"Rate limiting: waiting {wait_time:.1f}s before Alpha Vantage API call")
            await asyncio.sleep(wait_time)
        
        # Make the request
        try:
            self.last_request_time = datetime.now().timestamp()
            logger.info(f"Making Alpha Vantage API request: {params.get('function', 'unknown')}")
            
            response = await self.client.get(self.base_url, params=request_params)
            response.raise_for_status()
            
            data = response.json()
            
            # Check for API error messages
            if "Error Message" in data:
                logger.error(f"Alpha Vantage API error: {data['Error Message']}")
                return {"error": data["Error Message"]}
            
            if "Note" in data and "API call frequency" in data["Note"]:
                logger.warning(f"Alpha Vantage API rate limit warning: {data['Note']}")
                # Return stale cache if available during rate limiting
                stale_data = cache_manager.get("alpha_vantage", f"stale_{cache_key}")
                if stale_data:
                    logger.info("Returning stale cached data due to rate limit")
                    return stale_data
            
            # Cache the successful result with enhanced caching
            ttl = self.cache_ttl.get(cache_group, 3600)
            cache_success = cache_manager.set("alpha_vantage", cache_key, data, ttl)
            
            # Also store as stale backup with longer TTL
            cache_manager.set("alpha_vantage", f"stale_{cache_key}", data, ttl * 4)
            
            if cache_success:
                logger.debug(f"Cached Alpha Vantage response for {ttl}s")
            
            return data
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:  # Rate limit exceeded
                logger.error("Alpha Vantage API rate limit exceeded - checking for cached data")
                # Try to return any cached data (even stale)
                stale_data = cache_manager.get("alpha_vantage", f"stale_{cache_key}")
                if stale_data:
                    logger.info("Returning stale cached data due to rate limit exceeded")
                    return stale_data
                
                return {"error": "Rate limit exceeded and no cached data available"}
            
            logger.error(f"HTTP error during Alpha Vantage API request: {str(e)}")
            return {"error": f"HTTP error: {str(e)}"}
        except httpx.RequestError as e:
            logger.error(f"Request error during Alpha Vantage API request: {str(e)}")
            return {"error": f"Request error: {str(e)}"}
        except Exception as e:
            logger.error(f"Unexpected error during Alpha Vantage API request: {str(e)}")
            return {"error": f"Unexpected error: {str(e)}"}
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get comprehensive cache performance statistics"""
        alpha_vantage_stats = cache_manager.get_stats()
        
        # Add Alpha Vantage specific metrics
        alpha_vantage_stats.update({
            "last_request_timestamp": self.last_request_time,
            "min_request_interval": self.min_request_interval,
            "cache_ttl_settings": self.cache_ttl,
            "client_initialized": self._initialized
        })
        
        return alpha_vantage_stats

    async def get_commodity_price(self, symbol: str) -> Dict[str, Any]:
        """
        Get the latest price data for a commodity.
        
        Args:
            symbol: The commodity symbol (e.g., "OIL", "GOLD")
            
        Returns:
            Dict containing price data
        """
        # Map internal symbol to Alpha Vantage symbol
        av_symbol = self.commodities_mapping.get(symbol.upper())
        if not av_symbol:
            logger.warning(f"Unknown commodity symbol: {symbol}")
            return {"error": f"Unknown commodity symbol: {symbol}"}
        
        # Make the request
        params = {
            "function": "COMMODITY_DAILY",
            "symbol": av_symbol,
            "datatype": "json"
        }
        
        data = await self._make_request(params, cache_group="commodities")
        
        # Extract relevant price information
        if "error" in data:
            return data
        
        try:
            # Process the data into a more usable format
            time_series = data.get("data", {})
            if not time_series:
                return {"error": "No data available"}
            
            # Get the latest date
            latest_date = list(time_series.keys())[0]
            latest_data = time_series[latest_date]
            
            return {
                "symbol": symbol,
                "price": float(latest_data.get("close", 0)),
                "open": float(latest_data.get("open", 0)),
                "high": float(latest_data.get("high", 0)),
                "low": float(latest_data.get("low", 0)),
                "change": float(latest_data.get("change", 0)),
                "change_percent": float(latest_data.get("change_percent", "0").replace("%", "")),
                "volume": int(latest_data.get("volume", 0)),
                "date": latest_date
            }
            
        except Exception as e:
            logger.error(f"Error processing commodity data: {str(e)}")
            return {"error": f"Data processing error: {str(e)}"}
    
    async def get_commodities_batch(self, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Get price data for multiple commodities.
        
        Args:
            symbols: List of commodity symbols
            
        Returns:
            Dict mapping symbols to price data
        """
        # Require pandas for trend analytics
        if pd is None:
            logger.warning("pandas not installed; Alpha Vantage market trend analytics are disabled")
            return {symbol: {"error": "pandas not installed"} for symbol in symbols}

        results = {}
        
        # Process commodities in batches to respect rate limits
        for symbol in symbols:
            results[symbol] = await self.get_commodity_price(symbol)
            # Small delay to avoid rate limiting
            await asyncio.sleep(0.2)
        
        return results
    
    async def get_news(self, topics: Optional[List[str]] = None, symbols: Optional[List[str]] = None, 
                       limit: int = 10) -> Dict[str, Any]:
        """
        Get financial news articles.
        
        Args:
            topics: Optional list of topics (e.g., "commodities", "oil", "economy")
            symbols: Optional list of tickers (e.g., "WTI", "GOLD")
            limit: Maximum number of articles to return
            
        Returns:
            Dict containing news articles
        """
        # Set up request parameters
        params = {
            "function": "NEWS_SENTIMENT",
            "limit": min(limit, 50)  # API maximum is 50
        }
        
        # Add topics if provided
        if topics:
            params["topics"] = ",".join(topics)
        
        # Add symbols if provided
        if symbols:
            # Map internal symbols to Alpha Vantage symbols
            av_symbols = [self.commodities_mapping.get(s.upper(), s) for s in symbols]
            params["tickers"] = ",".join(av_symbols)
        
        # Make the request
        data = await self._make_request(params, cache_group="news")
        
        # Process the response
        if "error" in data:
            return data
        
        try:
            # Extract feed
            feed = data.get("feed", [])

            if not feed:
                logger.warning(
                    "Alpha Vantage NEWS_SENTIMENT returned empty feed. Keys: %s", list(data.keys())
                )
                note = data.get("Note") or data.get("Information")
                if note:
                    logger.warning("Alpha Vantage NEWS_SENTIMENT note/info: %s", note)
            
            # Process articles
            articles = []
            for article in feed:
                # Extract sentiment data from Alpha Vantage
                # Alpha Vantage returns overall_sentiment_score in range -1 to +1
                raw_sentiment = article.get("overall_sentiment_score", 0)
                
                # Determine sentiment label based on score
                if raw_sentiment > 0.25:
                    sentiment_label = "BULLISH"
                elif raw_sentiment < -0.25:
                    sentiment_label = "BEARISH"
                else:
                    sentiment_label = "NEUTRAL"
                
                # Normalize score to 0-1 range for frontend
                # Higher absolute value = higher confidence
                # Map -1 to +1 → 0.5 to 1.0 (confidence in the direction)
                confidence = 0.5 + (abs(raw_sentiment) * 0.5)
                confidence = min(0.99, max(0.5, confidence))  # Clamp to 0.5-0.99
                
                # Map to our format
                articles.append({
                    "title": article.get("title", ""),
                    "url": article.get("url", ""),
                    "time_published": article.get("time_published", ""),
                    "summary": article.get("summary", ""),
                    "source": article.get("source", ""),
                    "categories": article.get("topics", []),
                    "sentiment_score": round(confidence, 2),  # Normalized 0-1 score
                    "sentiment_raw": raw_sentiment,  # Keep raw score for debugging
                    "sentiment": sentiment_label,
                    "tickers": [t.get("ticker") for t in article.get("ticker_sentiment", [])]
                })
            
            return {
                "articles": articles,
                "count": len(articles)
            }
            
        except Exception as e:
            logger.error(f"Error processing news data: {str(e)}")
            return {"error": f"Data processing error: {str(e)}"}
    
    async def get_market_trends(self, symbols: List[str], days: int = 7) -> Dict[str, Any]:
        """
        Get market trend data for commodities.
        
        Args:
            symbols: List of commodity symbols
            days: Number of days of historical data
            
        Returns:
            Dict containing trend data
        """
        results = {}
        
        for symbol in symbols:
            # Map internal symbol to Alpha Vantage symbol
            av_symbol = self.commodities_mapping.get(symbol.upper())
            if not av_symbol:
                continue
            
            # Make the request for daily time series
            params = {
                "function": "COMMODITY_DAILY",
                "symbol": av_symbol,
                "outputsize": "compact",  # Returns latest 100 data points
                "datatype": "json"
            }
            
            data = await self._make_request(params, cache_group="daily")
            
            if "error" in data:
                results[symbol] = {"error": data["error"]}
                continue
            
            try:
                # Process the data
                time_series = data.get("data", {})
                if not time_series:
                    results[symbol] = {"error": "No data available"}
                    continue
                
                # Convert to DataFrame for easier analysis
                df = pd.DataFrame.from_dict(time_series, orient='index')
                df.index = pd.to_datetime(df.index)
                df = df.sort_index()
                
                # Convert string values to numeric
                for col in ['open', 'high', 'low', 'close', 'volume']:
                    if col in df.columns:
                        df[col] = pd.to_numeric(df[col], errors='coerce')
                
                # Calculate trends
                if len(df) > 1:
                    # Calculate short-term trend (3-day)
                    short_term = df['close'].pct_change(3).iloc[-1] * 100 if len(df) >= 3 else 0
                    
                    # Calculate medium-term trend (7-day)
                    medium_term = df['close'].pct_change(min(7, len(df)-1)).iloc[-1] * 100 if len(df) >= 7 else short_term
                    
                    # Calculate long-term trend (30-day)
                    long_term = df['close'].pct_change(min(30, len(df)-1)).iloc[-1] * 100 if len(df) >= 30 else medium_term
                    
                    # Calculate volatility (standard deviation over 7 days)
                    volatility = df['close'].pct_change().rolling(min(7, len(df)-1)).std().iloc[-1] * 100 if len(df) >= 7 else 0
                    
                    # Get latest price
                    latest = df.iloc[-1]
                    
                    # Store results
                    results[symbol] = {
                        "current_price": latest['close'],
                        "change_1day": df['close'].pct_change(1).iloc[-1] * 100 if len(df) >= 1 else 0,
                        "short_term_trend": short_term,
                        "medium_term_trend": medium_term,
                        "long_term_trend": long_term,
                        "volatility": volatility,
                        "trend": "up" if medium_term > 0 else "down" if medium_term < 0 else "sideways",
                        "history": [{
                            "date": row[0].strftime("%Y-%m-%d"),
                            "close": row[1]['close']
                        } for row in df.tail(days).iterrows()]
                    }
                else:
                    results[symbol] = {"error": "Insufficient data for trend analysis"}
                
            except Exception as e:
                logger.error(f"Error processing trend data for {symbol}: {str(e)}")
                results[symbol] = {"error": f"Data processing error: {str(e)}"}
            
            # Small delay to avoid rate limiting
            await asyncio.sleep(0.2)
        
        return results

# Create singleton instance
alpha_vantage_client = AlphaVantageClient()

async def get_commodity_price(symbol: str) -> Dict[str, Any]:
    """
    Get the latest price for a commodity.
    
    Args:
        symbol: The commodity symbol
        
    Returns:
        Dict containing price information
    """
    return await alpha_vantage_client.get_commodity_price(symbol)

async def get_news(topics: Optional[List[str]] = None, symbols: Optional[List[str]] = None, 
                   limit: int = 10) -> Dict[str, Any]:
    """
    Get financial news related to commodities.
    
    Args:
        topics: Optional list of topics
        symbols: Optional list of commodity symbols
        limit: Maximum number of articles
        
    Returns:
        Dict containing news articles with sentiment
    """
    return await alpha_vantage_client.get_news(topics, symbols, limit)

async def get_market_trends(symbols: List[str], days: int = 7) -> Dict[str, Any]:
    """
    Get market trends for specified commodities.
    
    Args:
        symbols: List of commodity symbols
        days: Number of days of historical data
        
    Returns:
        Dict containing trend analysis
    """
    return await alpha_vantage_client.get_market_trends(symbols, days)
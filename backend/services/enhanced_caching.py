"""
Enhanced caching system for Integra Markets
Provides Redis-backed persistent caching and fallback to in-memory caching
"""
import json
import pickle
import logging
import asyncio
from functools import wraps
from typing import Dict, Any, Optional, Union
from datetime import datetime, timedelta
import hashlib

import os

logger = logging.getLogger(__name__)

# Try to import Redis, fallback to memory-only caching
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    logger.warning("Redis not available, using memory-only caching")
    REDIS_AVAILABLE = False
    redis = None

class EnhancedCacheManager:
    """
    Enhanced caching manager with Redis backend and intelligent fallbacks
    Designed to handle 100-1,000 concurrent users without API rate limits
    """
    
    def __init__(self, redis_url: Optional[str] = None, 
                 redis_db: int = 0, fallback_to_memory: bool = True):
        """Initialize the cache manager"""
        self.redis_client = None
        self.memory_cache = {}
        self.memory_expiry = {}
        self.fallback_to_memory = fallback_to_memory
        
        # Determine Redis URL
        if redis_url is None:
            redis_url = os.environ.get("REDIS_URL")
        
        # Try to connect to Redis if available and URL is provided
        if REDIS_AVAILABLE and redis_url:
            try:
                self.redis_client = redis.Redis.from_url(redis_url, db=redis_db, decode_responses=True)
                # Test connection
                self.redis_client.ping()
                logger.info(f"Connected to Redis cache backend at {redis_url.split('@')[-1]}")
            except Exception as e:
                logger.warning(f"Failed to connect to Redis: {e}")
                if not fallback_to_memory:
                    raise
                self.redis_client = None
        else:
            logger.info("Redis not configured (REDIS_URL not set). Using memory-only caching.")
        
        # Performance metrics
        self.stats = {
            "redis_hits": 0,
            "redis_misses": 0,
            "memory_hits": 0,
            "memory_misses": 0,
            "cache_sets": 0,
            "cache_errors": 0
        }
    
    def _generate_key(self, namespace: str, key: str) -> str:
        """Generate a standardized cache key"""
        # Hash long keys to avoid Redis key length limits
        if len(key) > 100:
            key_hash = hashlib.md5(key.encode()).hexdigest()
            return f"integra:{namespace}:{key_hash}"
        return f"integra:{namespace}:{key}"
    
    def _serialize_value(self, value: Any) -> str:
        """Serialize value for storage"""
        try:
            # Try JSON first (faster and more readable)
            return json.dumps(value)
        except (TypeError, ValueError):
            # Fallback to pickle for complex objects
            import base64
            return base64.b64encode(pickle.dumps(value)).decode()
    
    def _deserialize_value(self, serialized: str) -> Any:
        """Deserialize value from storage"""
        try:
            # Try JSON first
            return json.loads(serialized)
        except (json.JSONDecodeError, ValueError):
            # Fallback to pickle
            import base64
            return pickle.loads(base64.b64decode(serialized.encode()))
    
    def get(self, namespace: str, key: str) -> Optional[Any]:
        """Get value from cache with fallback chain"""
        cache_key = self._generate_key(namespace, key)
        
        # Try Redis first
        if self.redis_client:
            try:
                value = self.redis_client.get(cache_key)
                if value is not None:
                    self.stats["redis_hits"] += 1
                    return self._deserialize_value(value)
                else:
                    self.stats["redis_misses"] += 1
            except Exception as e:
                logger.warning(f"Redis get error: {e}")
                self.stats["cache_errors"] += 1
        
        # Fallback to memory cache
        if self.fallback_to_memory:
            if cache_key in self.memory_cache:
                # Check expiry
                if cache_key in self.memory_expiry:
                    if datetime.now().timestamp() > self.memory_expiry[cache_key]:
                        # Expired
                        del self.memory_cache[cache_key]
                        del self.memory_expiry[cache_key]
                        self.stats["memory_misses"] += 1
                        return None
                
                self.stats["memory_hits"] += 1
                return self.memory_cache[cache_key]
            else:
                self.stats["memory_misses"] += 1
        
        return None
    
    def set(self, namespace: str, key: str, value: Any, ttl_seconds: int = 3600) -> bool:
        """Set value in cache with TTL"""
        cache_key = self._generate_key(namespace, key)
        serialized_value = self._serialize_value(value)
        success = False
        
        # Try Redis first
        if self.redis_client:
            try:
                self.redis_client.setex(cache_key, ttl_seconds, serialized_value)
                success = True
                logger.debug(f"Set Redis cache: {cache_key} (TTL: {ttl_seconds}s)")
            except Exception as e:
                logger.warning(f"Redis set error: {e}")
                self.stats["cache_errors"] += 1
        
        # Also set in memory cache as backup
        if self.fallback_to_memory:
            try:
                self.memory_cache[cache_key] = value
                self.memory_expiry[cache_key] = datetime.now().timestamp() + ttl_seconds
                success = True
                logger.debug(f"Set memory cache: {cache_key} (TTL: {ttl_seconds}s)")
            except Exception as e:
                logger.warning(f"Memory cache set error: {e}")
                self.stats["cache_errors"] += 1
        
        if success:
            self.stats["cache_sets"] += 1
        
        return success
    
    def delete(self, namespace: str, key: str) -> bool:
        """Delete value from cache"""
        cache_key = self._generate_key(namespace, key)
        success = False
        
        # Delete from Redis
        if self.redis_client:
            try:
                self.redis_client.delete(cache_key)
                success = True
            except Exception as e:
                logger.warning(f"Redis delete error: {e}")
                self.stats["cache_errors"] += 1
        
        # Delete from memory cache
        if self.fallback_to_memory:
            if cache_key in self.memory_cache:
                del self.memory_cache[cache_key]
            if cache_key in self.memory_expiry:
                del self.memory_expiry[cache_key]
            success = True
        
        return success
    
    def clear_namespace(self, namespace: str) -> int:
        """Clear all keys in a namespace"""
        cleared = 0
        pattern = f"integra:{namespace}:*"
        
        # Clear from Redis
        if self.redis_client:
            try:
                keys = self.redis_client.keys(pattern)
                if keys:
                    cleared += self.redis_client.delete(*keys)
            except Exception as e:
                logger.warning(f"Redis clear error: {e}")
                self.stats["cache_errors"] += 1
        
        # Clear from memory cache
        if self.fallback_to_memory:
            to_delete = [k for k in self.memory_cache.keys() if k.startswith(f"integra:{namespace}:")]
            for key in to_delete:
                del self.memory_cache[key]
                if key in self.memory_expiry:
                    del self.memory_expiry[key]
                cleared += 1
        
        logger.info(f"Cleared {cleared} keys from namespace '{namespace}'")
        return cleared
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache performance statistics"""
        total_redis = self.stats["redis_hits"] + self.stats["redis_misses"]
        total_memory = self.stats["memory_hits"] + self.stats["memory_misses"]
        total_requests = total_redis + total_memory
        
        redis_hit_rate = (self.stats["redis_hits"] / total_redis * 100) if total_redis > 0 else 0
        memory_hit_rate = (self.stats["memory_hits"] / total_memory * 100) if total_memory > 0 else 0
        overall_hit_rate = ((self.stats["redis_hits"] + self.stats["memory_hits"]) / total_requests * 100) if total_requests > 0 else 0
        
        return {
            "redis_available": self.redis_client is not None,
            "redis_hits": self.stats["redis_hits"],
            "redis_misses": self.stats["redis_misses"],
            "redis_hit_rate_percent": round(redis_hit_rate, 2),
            "memory_hits": self.stats["memory_hits"],
            "memory_misses": self.stats["memory_misses"],
            "memory_hit_rate_percent": round(memory_hit_rate, 2),
            "overall_hit_rate_percent": round(overall_hit_rate, 2),
            "cache_sets": self.stats["cache_sets"],
            "cache_errors": self.stats["cache_errors"],
            "total_requests": total_requests,
            "memory_cache_size": len(self.memory_cache)
        }
    
    def cleanup_expired(self) -> int:
        """Clean up expired entries from memory cache"""
        if not self.fallback_to_memory:
            return 0
        
        current_time = datetime.now().timestamp()
        expired_keys = []
        
        for key, expiry_time in self.memory_expiry.items():
            if current_time > expiry_time:
                expired_keys.append(key)
        
        for key in expired_keys:
            if key in self.memory_cache:
                del self.memory_cache[key]
            del self.memory_expiry[key]
        
        if expired_keys:
            logger.debug(f"Cleaned up {len(expired_keys)} expired cache entries")
        
        return len(expired_keys)

# Global cache manager instance
cache_manager = EnhancedCacheManager()

# Cache decorators for easy use
def cached(namespace: str, ttl_seconds: int = 3600, key_func: Optional[callable] = None):
    """
    Decorator to cache function results
    
    Args:
        namespace: Cache namespace
        ttl_seconds: Time to live in seconds
        key_func: Function to generate cache key from args/kwargs
    """

    def _make_cache_key(func, args, kwargs):
        if key_func:
            return key_func(*args, **kwargs)
        # Default key generation
        key_parts = [func.__name__]
        key_parts.extend([str(arg) for arg in args])
        key_parts.extend([f"{k}={v}" for k, v in sorted(kwargs.items())])
        return "|".join(key_parts)

    def decorator(func):
        # Async functions
        if asyncio.iscoroutinefunction(func):

            @wraps(func)
            async def async_wrapper(*args, **kwargs):
                cache_key = _make_cache_key(func, args, kwargs)

                cached_result = cache_manager.get(namespace, cache_key)
                if cached_result is not None:
                    logger.debug(f"Cache hit for {func.__name__}: {cache_key}")
                    return cached_result

                result = await func(*args, **kwargs)
                try:
                    cache_manager.set(namespace, cache_key, result, ttl_seconds)
                    logger.debug(f"Cached result for {func.__name__}: {cache_key}")
                except Exception as e:
                    logger.warning(f"Cache set error for {func.__name__}: {e}")

                return result

            return async_wrapper

        # Sync functions
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            cache_key = _make_cache_key(func, args, kwargs)

            cached_result = cache_manager.get(namespace, cache_key)
            if cached_result is not None:
                logger.debug(f"Cache hit for {func.__name__}: {cache_key}")
                return cached_result

            result = func(*args, **kwargs)
            try:
                cache_manager.set(namespace, cache_key, result, ttl_seconds)
                logger.debug(f"Cached result for {func.__name__}: {cache_key}")
            except Exception as e:
                logger.warning(f"Cache set error for {func.__name__}: {e}")

            return result

        return sync_wrapper

    return decorator

# Specific cache namespaces for different data types
NEWS_CACHE_TTL = 7200  # 2 hours
MARKET_DATA_CACHE_TTL = 1800  # 30 minutes
SENTIMENT_CACHE_TTL = 3600  # 1 hour
COMMODITY_CACHE_TTL = 1800  # 30 minutes

def cache_news_analysis(article_url: str, result: Dict, ttl: int = NEWS_CACHE_TTL) -> bool:
    """Cache news analysis results"""
    return cache_manager.set("news_analysis", article_url, result, ttl)

def get_cached_news_analysis(article_url: str) -> Optional[Dict]:
    """Get cached news analysis"""
    return cache_manager.get("news_analysis", article_url)

def cache_market_data(symbol: str, data: Dict, ttl: int = MARKET_DATA_CACHE_TTL) -> bool:
    """Cache market data"""
    return cache_manager.set("market_data", symbol, data, ttl)

def get_cached_market_data(symbol: str) -> Optional[Dict]:
    """Get cached market data"""
    return cache_manager.get("market_data", symbol)

def cache_sentiment_analysis(text_hash: str, sentiment: Dict, ttl: int = SENTIMENT_CACHE_TTL) -> bool:
    """Cache sentiment analysis results"""
    return cache_manager.set("sentiment", text_hash, sentiment, ttl)

def get_cached_sentiment(text_hash: str) -> Optional[Dict]:
    """Get cached sentiment analysis"""
    return cache_manager.get("sentiment", text_hash)

# Export main functions and classes
__all__ = [
    "EnhancedCacheManager",
    "cache_manager", 
    "cached",
    "cache_news_analysis",
    "get_cached_news_analysis",
    "cache_market_data", 
    "get_cached_market_data",
    "cache_sentiment_analysis",
    "get_cached_sentiment"
]
import os
import time
import json
import hashlib
import datetime
import requests
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
import base64
import uuid


@dataclass
class RateLimitConfig:
    """Configuration for API rate limiting"""
    requests_per_minute: int = 60
    requests_per_hour: int = 1000
    

class RateLimiter:
    """Rate limiter to prevent API quota exhaustion"""
    
    def __init__(self, config: RateLimitConfig):
        self.config = config
        self.minute_requests = []
        self.hour_requests = []
    
    def can_make_request(self) -> bool:
        """Check if we can make a request without exceeding limits"""
        now = time.time()
        
        # Clean old requests
        self.minute_requests = [t for t in self.minute_requests if now - t < 60]
        self.hour_requests = [t for t in self.hour_requests if now - t < 3600]
        
        # Check limits
        if len(self.minute_requests) >= self.config.requests_per_minute:
            return False
        if len(self.hour_requests) >= self.config.requests_per_hour:
            return False
            
        return True
    
    def record_request(self):
        """Record that a request was made"""
        now = time.time()
        self.minute_requests.append(now)
        self.hour_requests.append(now)
    
    def wait_if_needed(self):
        """Wait if necessary to respect rate limits"""
        if not self.can_make_request():
            # Wait until we can make a request
            time.sleep(1)
            self.wait_if_needed()


class Cache:
    """Simple in-memory cache with TTL"""
    
    def __init__(self, default_ttl: int = 300):
        self.cache = {}
        self.default_ttl = default_ttl
    
    def get(self, key: str) -> Optional[Any]:
        """Get cached value if not expired"""
        if key in self.cache:
            value, expiry = self.cache[key]
            if time.time() < expiry:
                return value
            else:
                del self.cache[key]
        return None
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None):
        """Cache a value with TTL"""
        ttl = ttl or self.default_ttl
        expiry = time.time() + ttl
        self.cache[key] = (value, expiry)
    
    def clear(self):
        """Clear all cached data"""
        self.cache.clear()


class KalshiClient:
    """Kalshi API client with rate limiting, caching, and authentication"""
    
    def __init__(self, 
                 api_key_id: Optional[str] = None,
                 private_key: Optional[str] = None,
                 use_sandbox: bool = True,
                 rate_limit_config: Optional[RateLimitConfig] = None,
                 cache_ttl: int = 300):
        
        self.api_key_id = api_key_id or os.getenv('KALSHI_API_KEY_ID')
        self.private_key = private_key or os.getenv('KALSHI_PRIVATE_KEY')
        
        # API endpoints
        if use_sandbox:
            self.base_url = 'https://demo-api.kalshi.co'
        else:
            self.base_url = 'https://trading-api.kalshi.com'
            
        # Initialize components
        self.rate_limiter = RateLimiter(rate_limit_config or RateLimitConfig())
        self.cache = Cache(cache_ttl)
        self.session = requests.Session()
        
        # Authentication token (expires every 30 minutes)
        self.auth_token = None
        self.token_expiry = 0
        
    def _create_signature(self, timestamp: str, method: str, path: str) -> str:
        """Create signature for authenticated requests"""
        if not self.private_key:
            raise ValueError("Private key required for authenticated requests")
            
        # Create message to sign
        message = f"{timestamp}{method}{path}"
        
        # Load private key
        private_key = serialization.load_pem_private_key(
            self.private_key.encode(),
            password=None
        )
        
        # Sign message
        signature = private_key.sign(
            message.encode(),
            padding.PKCS1v15(),
            hashes.SHA256()
        )
        
        return base64.b64encode(signature).decode()
    
    def _make_authenticated_request(self, method: str, path: str, data: Optional[Dict] = None) -> requests.Response:
        """Make authenticated request to Kalshi API"""
        if not self.api_key_id or not self.private_key:
            raise ValueError("API key ID and private key required for authenticated requests")
            
        timestamp = str(int(datetime.datetime.now().timestamp() * 1000))
        signature = self._create_signature(timestamp, method.upper(), path)
        
        headers = {
            'KALSHI-ACCESS-KEY': self.api_key_id,
            'KALSHI-ACCESS-SIGNATURE': signature,
            'KALSHI-ACCESS-TIMESTAMP': timestamp,
            'Content-Type': 'application/json'
        }
        
        url = f"{self.base_url}{path}"
        
        if method.upper() == 'GET':
            return self.session.get(url, headers=headers)
        elif method.upper() == 'POST':
            return self.session.post(url, headers=headers, json=data)
        elif method.upper() == 'PUT':
            return self.session.put(url, headers=headers, json=data)
        elif method.upper() == 'DELETE':
            return self.session.delete(url, headers=headers)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")
    
    def _make_request(self, endpoint: str, authenticated: bool = False, method: str = 'GET', data: Optional[Dict] = None) -> Dict:
        """Make API request with rate limiting and caching"""
        # Check cache for GET requests
        if method.upper() == 'GET':
            cache_key = hashlib.md5(f"{endpoint}{json.dumps(data or {}, sort_keys=True)}".encode()).hexdigest()
            cached_result = self.cache.get(cache_key)
            if cached_result:
                return cached_result
        
        # Rate limiting
        self.rate_limiter.wait_if_needed()
        
        try:
            if authenticated:
                response = self._make_authenticated_request(method, endpoint, data)
            else:
                url = f"{self.base_url}{endpoint}"
                if method.upper() == 'GET':
                    response = self.session.get(url)
                else:
                    response = self.session.post(url, json=data)
            
            self.rate_limiter.record_request()
            
            if response.status_code == 200 or response.status_code == 201:
                result = response.json()
                
                # Cache GET requests
                if method.upper() == 'GET':
                    self.cache.set(cache_key, result)
                
                return result
            else:
                response.raise_for_status()
                
        except requests.exceptions.RequestException as e:
            raise Exception(f"Kalshi API request failed: {str(e)}")
    
    # Public Market Data Methods (no authentication required)
    
    def get_markets(self, limit: int = 100, cursor: Optional[str] = None, 
                   status: Optional[str] = None, event_id: Optional[str] = None) -> Dict:
        """Get list of markets"""
        params = {'limit': limit}
        if cursor:
            params['cursor'] = cursor
        if status:
            params['status'] = status
        if event_id:
            params['event_id'] = event_id
            
        query_string = '&'.join([f"{k}={v}" for k, v in params.items()])
        endpoint = f"/trade-api/v2/markets?{query_string}"
        
        return self._make_request(endpoint)
    
    def get_market(self, ticker: str) -> Dict:
        """Get specific market by ticker"""
        endpoint = f"/trade-api/v2/markets/{ticker}"
        return self._make_request(endpoint)
    
    def get_events(self, limit: int = 100, cursor: Optional[str] = None, 
                  status: Optional[str] = None) -> Dict:
        """Get list of events"""
        params = {'limit': limit}
        if cursor:
            params['cursor'] = cursor
        if status:
            params['status'] = status
            
        query_string = '&'.join([f"{k}={v}" for k, v in params.items()])
        endpoint = f"/trade-api/v2/events?{query_string}"
        
        return self._make_request(endpoint)
    
    def get_event(self, event_id: str) -> Dict:
        """Get specific event by ID"""
        endpoint = f"/trade-api/v2/events/{event_id}"
        return self._make_request(endpoint)
    
    def get_orderbook(self, ticker: str, depth: int = 5) -> Dict:
        """Get order book for a market"""
        endpoint = f"/trade-api/v2/markets/{ticker}/orderbook?depth={depth}"
        return self._make_request(endpoint)
    
    def get_trades(self, ticker: str, limit: int = 100, cursor: Optional[str] = None) -> Dict:
        """Get recent trades for a market"""
        params = {'limit': limit}
        if cursor:
            params['cursor'] = cursor
            
        query_string = '&'.join([f"{k}={v}" for k, v in params.items()])
        endpoint = f"/trade-api/v2/markets/{ticker}/trades?{query_string}"
        
        return self._make_request(endpoint)
    
    # Authenticated Methods (require API key and private key)
    
    def get_portfolio(self) -> Dict:
        """Get portfolio information"""
        endpoint = "/trade-api/v2/portfolio"
        return self._make_request(endpoint, authenticated=True)
    
    def get_positions(self, limit: int = 100, cursor: Optional[str] = None) -> Dict:
        """Get portfolio positions"""
        params = {'limit': limit}
        if cursor:
            params['cursor'] = cursor
            
        query_string = '&'.join([f"{k}={v}" for k, v in params.items()])
        endpoint = f"/trade-api/v2/portfolio/positions?{query_string}"
        
        return self._make_request(endpoint, authenticated=True)
    
    def get_orders(self, limit: int = 100, cursor: Optional[str] = None, 
                  ticker: Optional[str] = None) -> Dict:
        """Get orders"""
        params = {'limit': limit}
        if cursor:
            params['cursor'] = cursor
        if ticker:
            params['ticker'] = ticker
            
        query_string = '&'.join([f"{k}={v}" for k, v in params.items()])
        endpoint = f"/trade-api/v2/portfolio/orders?{query_string}"
        
        return self._make_request(endpoint, authenticated=True)
    
    def create_order(self, ticker: str, action: str, side: str, count: int, 
                    order_type: str = 'limit', yes_price: Optional[int] = None, 
                    no_price: Optional[int] = None, 
                    client_order_id: Optional[str] = None) -> Dict:
        """Create a new order
        
        Args:
            ticker: Market ticker
            action: 'buy' or 'sell'
            side: 'yes' or 'no'
            count: Number of contracts
            order_type: 'limit' or 'market'
            yes_price: Price for YES side (1-99 cents)
            no_price: Price for NO side (1-99 cents)
            client_order_id: Unique client ID for deduplication
        """
        data = {
            'ticker': ticker,
            'action': action,
            'side': side,
            'count': count,
            'type': order_type,
            'client_order_id': client_order_id or str(uuid.uuid4())
        }
        
        if yes_price is not None:
            data['yes_price'] = yes_price
        if no_price is not None:
            data['no_price'] = no_price
            
        endpoint = "/trade-api/v2/portfolio/orders"
        return self._make_request(endpoint, authenticated=True, method='POST', data=data)
    
    def get_order(self, order_id: str) -> Dict:
        """Get specific order by ID"""
        endpoint = f"/trade-api/v2/portfolio/orders/{order_id}"
        return self._make_request(endpoint, authenticated=True)
    
    def cancel_order(self, order_id: str) -> Dict:
        """Cancel an order"""
        endpoint = f"/trade-api/v2/portfolio/orders/{order_id}"
        return self._make_request(endpoint, authenticated=True, method='DELETE')
    
    def amend_order(self, order_id: str, yes_price: Optional[int] = None, 
                   no_price: Optional[int] = None, count: Optional[int] = None) -> Dict:
        """Amend an existing order"""
        data = {}
        if yes_price is not None:
            data['yes_price'] = yes_price
        if no_price is not None:
            data['no_price'] = no_price
        if count is not None:
            data['count'] = count
            
        endpoint = f"/trade-api/v2/portfolio/orders/{order_id}"
        return self._make_request(endpoint, authenticated=True, method='PUT', data=data)
    
    # Utility Methods
    
    def get_market_categories(self) -> List[str]:
        """Get available market categories"""
        markets = self.get_markets(limit=1000)
        categories = set()
        
        for market in markets.get('markets', []):
            if 'category' in market:
                categories.add(market['category'])
                
        return sorted(list(categories))
    
    def search_markets(self, query: str, limit: int = 50) -> List[Dict]:
        """Search markets by title or ticker"""
        markets = self.get_markets(limit=1000)
        results = []
        
        query_lower = query.lower()
        
        for market in markets.get('markets', []):
            title = market.get('title', '').lower()
            ticker = market.get('ticker', '').lower()
            
            if query_lower in title or query_lower in ticker:
                results.append(market)
                
            if len(results) >= limit:
                break
                
        return results
    
    def get_trending_markets(self, limit: int = 20) -> List[Dict]:
        """Get trending markets based on volume"""
        markets = self.get_markets(limit=1000, status='open')
        market_list = markets.get('markets', [])
        
        # Sort by volume (if available) or use other metrics
        sorted_markets = sorted(
            market_list,
            key=lambda x: x.get('volume', 0),
            reverse=True
        )
        
        return sorted_markets[:limit]
    
    def clear_cache(self):
        """Clear all cached data"""
        self.cache.clear()
    
    def close(self):
        """Close the session"""
        self.session.close()
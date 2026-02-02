from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
import os
import logging
from kalshi_client import KalshiClient, RateLimitConfig

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize router
router = APIRouter(prefix="/kalshi", tags=["kalshi"])

# Initialize Kalshi client
kalshi_client = None

def get_kalshi_client():
    """Get or create Kalshi client instance"""
    global kalshi_client
    if kalshi_client is None:
        # Use sandbox by default, can be configured via environment
        use_sandbox = os.getenv('KALSHI_USE_SANDBOX', 'true').lower() == 'true'
        
        kalshi_client = KalshiClient(
            api_key_id=os.getenv('KALSHI_API_KEY_ID'),
            private_key=os.getenv('KALSHI_PRIVATE_KEY'),
            use_sandbox=use_sandbox,
            rate_limit_config=RateLimitConfig(
                requests_per_minute=50,  # Conservative rate limiting
                requests_per_hour=800
            ),
            cache_ttl=300  # 5 minute cache
        )
    return kalshi_client

# Request/Response Models
class MarketSearchRequest(BaseModel):
    query: str
    limit: Optional[int] = 20

class OrderRequest(BaseModel):
    ticker: str
    action: str  # 'buy' or 'sell'
    side: str    # 'yes' or 'no'
    count: int
    order_type: Optional[str] = 'limit'
    yes_price: Optional[int] = None
    no_price: Optional[int] = None
    client_order_id: Optional[str] = None

class TradeRequest(BaseModel):
    ticker: str
    side: str    # 'yes' or 'no'
    count: int
    price: int   # Price in cents
    order_type: Optional[str] = 'limit'
    client_order_id: Optional[str] = None

class MarketDataResponse(BaseModel):
    ticker: str
    title: str
    category: str
    yes_price: int
    no_price: int
    volume: int
    trader_count: int
    resolve_time: Optional[str] = None
    status: str = 'open'

class OrderAmendRequest(BaseModel):
    yes_price: Optional[int] = None
    no_price: Optional[int] = None
    count: Optional[int] = None

# Public Market Data Endpoints (no authentication required)

@router.get("/markets")
async def get_markets(
    limit: int = Query(default=100, le=1000),
    cursor: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    event_id: Optional[str] = Query(default=None)
):
    """Get list of prediction markets"""
    try:
        client = get_kalshi_client()
        result = client.get_markets(
            limit=limit,
            cursor=cursor,
            status=status,
            event_id=event_id
        )
        return result
    except Exception as e:
        logger.error(f"Error fetching markets: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch markets: {str(e)}")

@router.get("/markets/{ticker}")
async def get_market(ticker: str):
    """Get specific market by ticker"""
    try:
        client = get_kalshi_client()
        result = client.get_market(ticker)
        return result
    except Exception as e:
        logger.error(f"Error fetching market {ticker}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch market: {str(e)}")

@router.get("/events")
async def get_events(
    limit: int = Query(default=100, le=1000),
    cursor: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None)
):
    """Get list of events"""
    try:
        client = get_kalshi_client()
        result = client.get_events(
            limit=limit,
            cursor=cursor,
            status=status
        )
        return result
    except Exception as e:
        logger.error(f"Error fetching events: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch events: {str(e)}")

@router.get("/events/{event_id}")
async def get_event(event_id: str):
    """Get specific event by ID"""
    try:
        client = get_kalshi_client()
        result = client.get_event(event_id)
        return result
    except Exception as e:
        logger.error(f"Error fetching event {event_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch event: {str(e)}")

@router.get("/markets/{ticker}/orderbook")
async def get_orderbook(
    ticker: str,
    depth: int = Query(default=5, le=20)
):
    """Get order book for a market"""
    try:
        client = get_kalshi_client()
        result = client.get_orderbook(ticker, depth)
        return result
    except Exception as e:
        logger.error(f"Error fetching orderbook for {ticker}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch orderbook: {str(e)}")

@router.get("/markets/{ticker}/trades")
async def get_trades(
    ticker: str,
    limit: int = Query(default=100, le=1000),
    cursor: Optional[str] = Query(default=None)
):
    """Get recent trades for a market"""
    try:
        client = get_kalshi_client()
        result = client.get_trades(ticker, limit, cursor)
        return result
    except Exception as e:
        logger.error(f"Error fetching trades for {ticker}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch trades: {str(e)}")

# Utility Endpoints

@router.get("/markets/categories")
async def get_market_categories():
    """Get available market categories"""
    try:
        client = get_kalshi_client()
        categories = client.get_market_categories()
        return {"categories": categories}
    except Exception as e:
        logger.error(f"Error fetching market categories: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch categories: {str(e)}")

@router.post("/markets/search")
async def search_markets(request: MarketSearchRequest):
    """Search markets by title or ticker"""
    try:
        client = get_kalshi_client()
        results = client.search_markets(request.query, request.limit)
        return {"markets": results}
    except Exception as e:
        logger.error(f"Error searching markets: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to search markets: {str(e)}")

@router.get("/markets/trending")
async def get_trending_markets(limit: int = Query(default=20, le=100)):
    """Get trending markets based on volume"""
    try:
        client = get_kalshi_client()
        results = client.get_trending_markets(limit)
        return {"markets": results}
    except Exception as e:
        logger.error(f"Error fetching trending markets: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch trending markets: {str(e)}")

# Authenticated Endpoints (require API key and private key)

@router.get("/portfolio")
async def get_portfolio():
    """Get portfolio information (requires authentication)"""
    try:
        client = get_kalshi_client()
        result = client.get_portfolio()
        return result
    except ValueError as e:
        raise HTTPException(status_code=401, detail="Authentication required")
    except Exception as e:
        logger.error(f"Error fetching portfolio: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch portfolio: {str(e)}")

@router.get("/portfolio/positions")
async def get_positions(
    limit: int = Query(default=100, le=1000),
    cursor: Optional[str] = Query(default=None)
):
    """Get portfolio positions (requires authentication)"""
    try:
        client = get_kalshi_client()
        result = client.get_positions(limit, cursor)
        return result
    except ValueError as e:
        raise HTTPException(status_code=401, detail="Authentication required")
    except Exception as e:
        logger.error(f"Error fetching positions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch positions: {str(e)}")

@router.get("/portfolio/orders")
async def get_orders(
    limit: int = Query(default=100, le=1000),
    cursor: Optional[str] = Query(default=None),
    ticker: Optional[str] = Query(default=None)
):
    """Get orders (requires authentication)"""
    try:
        client = get_kalshi_client()
        result = client.get_orders(limit, cursor, ticker)
        return result
    except ValueError as e:
        raise HTTPException(status_code=401, detail="Authentication required")
    except Exception as e:
        logger.error(f"Error fetching orders: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch orders: {str(e)}")

@router.post("/trade")
async def place_trade(request: TradeRequest):
    """Place a trade order with simplified interface matching UI mockup"""
    try:
        client = get_kalshi_client()
        
        # Convert the simplified trade request to Kalshi order format
        action = "buy"  # Default to buying shares
        price_field = "yes_price" if request.side == "yes" else "no_price"
        
        result = client.create_order(
            ticker=request.ticker,
            action=action,
            side=request.side,
            count=request.count,
            order_type=request.order_type,
            **{price_field: request.price},
            client_order_id=request.client_order_id
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=401, detail="Authentication required")
    except Exception as e:
        logger.error(f"Error placing trade: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to place trade: {str(e)}")

@router.get("/markets/formatted")
async def get_formatted_markets(
    limit: int = Query(default=20, le=100),
    category: Optional[str] = Query(default=None)
):
    """Get markets formatted for the UI mockup"""
    try:
        client = get_kalshi_client()
        
        # Get markets from Kalshi
        markets_data = client.get_markets(limit=limit)
        
        # Format for UI mockup
        formatted_markets = []
        for market in markets_data.get('markets', []):
            # Get additional market data
            ticker = market.get('ticker')
            orderbook = None
            try:
                orderbook = client.get_orderbook(ticker, depth=1)
            except:
                pass
            
            formatted_market = {
                'ticker': ticker,
                'title': market.get('title', ''),
                'category': market.get('category', 'General'),
                'yes_price': 72,  # Default values - would come from orderbook
                'no_price': 28,
                'volume': market.get('volume', 0),
                'trader_count': market.get('open_interest', 0),
                'resolve_time': market.get('close_time'),
                'status': market.get('status', 'open'),
                'yesLowPrice': 100,  # Mock data for price ranges
                'yesHighPrice': 139,
                'noLowPrice': 100,
                'noHighPrice': 357
            }
            
            # Update with real orderbook data if available
            if orderbook and 'orderbook' in orderbook:
                yes_bids = orderbook['orderbook'].get('yes', [])
                no_bids = orderbook['orderbook'].get('no', [])
                
                if yes_bids:
                    formatted_market['yes_price'] = yes_bids[0].get('price', 72)
                if no_bids:
                    formatted_market['no_price'] = no_bids[0].get('price', 28)
            
            formatted_markets.append(formatted_market)
        
        return {'markets': formatted_markets}
    except Exception as e:
        logger.error(f"Error fetching formatted markets: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch markets: {str(e)}")

@router.post("/portfolio/orders")
async def create_order(request: OrderRequest):
    """Create a new order (requires authentication)"""
    try:
        client = get_kalshi_client()
        result = client.create_order(
            ticker=request.ticker,
            action=request.action,
            side=request.side,
            count=request.count,
            order_type=request.order_type,
            yes_price=request.yes_price,
            no_price=request.no_price,
            client_order_id=request.client_order_id
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=401, detail="Authentication required")
    except Exception as e:
        logger.error(f"Error creating order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create order: {str(e)}")

@router.get("/portfolio/orders/{order_id}")
async def get_order(order_id: str):
    """Get specific order by ID (requires authentication)"""
    try:
        client = get_kalshi_client()
        result = client.get_order(order_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=401, detail="Authentication required")
    except Exception as e:
        logger.error(f"Error fetching order {order_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch order: {str(e)}")

@router.delete("/portfolio/orders/{order_id}")
async def cancel_order(order_id: str):
    """Cancel an order (requires authentication)"""
    try:
        client = get_kalshi_client()
        result = client.cancel_order(order_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=401, detail="Authentication required")
    except Exception as e:
        logger.error(f"Error canceling order {order_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to cancel order: {str(e)}")

@router.put("/portfolio/orders/{order_id}")
async def amend_order(order_id: str, request: OrderAmendRequest):
    """Amend an existing order (requires authentication)"""
    try:
        client = get_kalshi_client()
        result = client.amend_order(
            order_id=order_id,
            yes_price=request.yes_price,
            no_price=request.no_price,
            count=request.count
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=401, detail="Authentication required")
    except Exception as e:
        logger.error(f"Error amending order {order_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to amend order: {str(e)}")

# Health and utility endpoints

@router.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        client = get_kalshi_client()
        # Try to fetch a small amount of data to verify connection
        result = client.get_markets(limit=1)
        return {
            "status": "healthy",
            "kalshi_api": "connected",
            "sandbox_mode": client.base_url == 'https://demo-api.kalshi.co'
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "kalshi_api": "disconnected"
        }

@router.post("/cache/clear")
async def clear_cache():
    """Clear API cache"""
    try:
        client = get_kalshi_client()
        client.clear_cache()
        return {"message": "Cache cleared successfully"}
    except Exception as e:
        logger.error(f"Error clearing cache: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to clear cache: {str(e)}")
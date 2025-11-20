import os
import logging
import httpx
import pandas as pd
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from core.config import settings
from models.commodities import Commodity, PriceData

# Configure logging
logger = logging.getLogger(__name__)

class MarketDataService:
    """Service for fetching and analyzing market data"""
    
    def __init__(self, db: Session):
        self.db = db
        self.alpha_vantage_api_key = settings.ALPHA_VANTAGE_API_KEY
        
    async def fetch_commodity_price(self, symbol: str) -> Dict[str, Any]:
        """Fetch current commodity price from Alpha Vantage"""
        url = "https://www.alphavantage.co/query"
        params = {
            "function": "GLOBAL_QUOTE",
            "symbol": symbol,
            "apikey": self.alpha_vantage_api_key
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                data = response.json()
                
                # Extract quote data
                quote = data.get("Global Quote", {})
                if not quote:
                    logger.error(f"No quote data returned for symbol {symbol}")
                    return {}
                
                return {
                    "symbol": symbol,
                    "price": float(quote.get("05. price", 0)),
                    "change": float(quote.get("09. change", 0)),
                    "change_percent": quote.get("10. change percent", "0%").replace("%", ""),
                    "volume": int(quote.get("06. volume", 0)),
                    "timestamp": datetime.utcnow().isoformat()
                }
        except Exception as e:
            logger.error(f"Error fetching price for {symbol}: {str(e)}")
            return {}
    
    async def fetch_historical_data(self, symbol: str, interval: str = "daily", outputsize: str = "compact") -> List[Dict[str, Any]]:
        """Fetch historical price data from Alpha Vantage"""
        url = "https://www.alphavantage.co/query"
        
        # Map interval to Alpha Vantage function
        function_map = {
            "daily": "TIME_SERIES_DAILY",
            "weekly": "TIME_SERIES_WEEKLY",
            "monthly": "TIME_SERIES_MONTHLY"
        }
        
        function = function_map.get(interval, "TIME_SERIES_DAILY")
        
        params = {
            "function": function,
            "symbol": symbol,
            "outputsize": outputsize,  # compact = 100 data points, full = 20+ years
            "apikey": self.alpha_vantage_api_key
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                data = response.json()
                
                # Extract time series data
                time_series_key = f"Time Series ({interval.capitalize()})"
                if interval == "daily":
                    time_series_key = "Time Series (Daily)"
                
                time_series = data.get(time_series_key, {})
                if not time_series:
                    logger.error(f"No time series data returned for symbol {symbol}")
                    return []
                
                # Convert to list of dictionaries
                historical_data = []
                for date, values in time_series.items():
                    historical_data.append({
                        "date": date,
                        "open": float(values.get("1. open", 0)),
                        "high": float(values.get("2. high", 0)),
                        "low": float(values.get("3. low", 0)),
                        "close": float(values.get("4. close", 0)),
                        "volume": int(values.get("5. volume", 0))
                    })
                
                # Sort by date (newest first)
                historical_data.sort(key=lambda x: x["date"], reverse=True)
                
                return historical_data
        except Exception as e:
            logger.error(f"Error fetching historical data for {symbol}: {str(e)}")
            return []
    
    async def update_commodity_price(self, commodity_id: int) -> Optional[PriceData]:
        """Update price for a specific commodity"""
        # Get commodity
        commodity = self.db.query(Commodity).filter(Commodity.id == commodity_id).first()
        if not commodity:
            logger.error(f"Commodity with ID {commodity_id} not found")
            return None
        
        # Skip if no trading symbol
        if not commodity.symbol:
            logger.warning(f"Commodity {commodity.name} has no trading symbol")
            return None
        
        # Fetch current price
        price_data = await self.fetch_commodity_price(commodity.symbol)
        if not price_data:
            logger.error(f"Failed to fetch price for {commodity.name}")
            return None
        
        # Create price record
        price = PriceData(
            commodity_id=commodity.id,
            open_price=price_data.get("price", 0),
            high_price=price_data.get("price", 0),
            low_price=price_data.get("price", 0),
            close_price=price_data.get("price", 0),
            volume=price_data.get("volume", 0),
            date=datetime.utcnow()
        )
        
        self.db.add(price)
        self.db.commit()
        self.db.refresh(price)
        
        return price
    
    async def get_price_with_trend(self, commodity_id: int) -> Dict[str, Any]:
        """Get current price with trend analysis"""
        # Get commodity
        commodity = self.db.query(Commodity).filter(Commodity.id == commodity_id).first()
        if not commodity:
            logger.error(f"Commodity with ID {commodity_id} not found")
            return {}
        
        # Get latest price
        latest_price = self.db.query(PriceData).filter(
            PriceData.commodity_id == commodity_id
        ).order_by(PriceData.date.desc()).first()
        
        if not latest_price:
            logger.warning(f"No price data for commodity {commodity.name}")
            return {
                "commodity_id": commodity_id,
                "name": commodity.name,
                "price": None,
                "trend": None,
                "last_updated": None
            }
        
        # Get historical prices for trend analysis
        historical_prices = self.db.query(PriceData).filter(
            PriceData.commodity_id == commodity_id,
            PriceData.date >= datetime.utcnow() - timedelta(days=30)
        ).order_by(PriceData.date.asc()).all()
        
        # Calculate trend
        trend_data = self._calculate_trend(historical_prices)
        
        return {
            "commodity_id": commodity_id,
            "name": commodity.name,
            "symbol": commodity.symbol,
            "price": latest_price.close_price,
            "change": latest_price.close_price - latest_price.open_price,
            "change_percent": ((latest_price.close_price - latest_price.open_price) / latest_price.open_price * 100) if latest_price.open_price > 0 else 0,
            "volume": latest_price.volume,
            "trend": trend_data,
            "last_updated": latest_price.date.isoformat()
        }
    
    def _calculate_trend(self, prices: List[PriceData]) -> Dict[str, Any]:
        """Calculate price trend from historical data"""
        if not prices or len(prices) < 2:
            return {
                "direction": "neutral",
                "strength": 0,
                "description": "Insufficient data for trend analysis"
            }
        
        # Extract prices and dates
        price_data = [(p.date, p.close_price) for p in prices]
        df = pd.DataFrame(price_data, columns=["timestamp", "price"])
        
        # Calculate simple moving averages
        if len(df) >= 5:
            df["sma5"] = df["price"].rolling(window=5).mean()
        
        if len(df) >= 20:
            df["sma20"] = df["price"].rolling(window=20).mean()
        
        # Determine trend direction
        latest_price = df["price"].iloc[-1]
        first_price = df["price"].iloc[0]
        price_change = latest_price - first_price
        
        # Calculate trend strength (0-100)
        max_price = df["price"].max()
        min_price = df["price"].min()
        price_range = max_price - min_price if max_price > min_price else 1
        
        # Normalize change to 0-100 scale
        strength = min(abs(price_change) / price_range * 100, 100) if price_range > 0 else 0
        
        # Determine direction
        if price_change > 0:
            direction = "bullish"
        elif price_change < 0:
            direction = "bearish"
        else:
            direction = "neutral"
        
        # Generate description
        if strength > 75:
            intensity = "strong"
        elif strength > 50:
            intensity = "moderate"
        elif strength > 25:
            intensity = "mild"
        else:
            intensity = "weak"
        
        description = f"{intensity.capitalize()} {direction} trend over the past {len(prices)} data points"
        
        # Add moving average analysis if available
        if "sma5" in df.columns and "sma20" in df.columns and not df["sma5"].iloc[-1] != df["sma20"].iloc[-1]:
            if df["sma5"].iloc[-1] > df["sma20"].iloc[-1]:
                description += ". Short-term moving average above long-term (bullish signal)"
            else:
                description += ". Short-term moving average below long-term (bearish signal)"
        
        return {
            "direction": direction,
            "strength": strength,
            "description": description
        }
    
    async def update_all_commodity_prices(self) -> Dict[str, Any]:
        """Update prices for all commodities"""
        commodities = self.db.query(Commodity).filter(Commodity.symbol != None).all()
        
        results = {
            "total": len(commodities),
            "successful": 0,
            "failed": 0,
            "details": []
        }
        
        for commodity in commodities:
            try:
                price = await self.update_commodity_price(commodity.id)
                
                if price:
                    results["successful"] += 1
                    results["details"].append({
                        "commodity_id": commodity.id,
                        "commodity_name": commodity.name,
                        "price": price.close_price,
                        "status": "success"
                    })
                else:
                    results["failed"] += 1
                    results["details"].append({
                        "commodity_id": commodity.id,
                        "commodity_name": commodity.name,
                        "status": "failed",
                        "reason": "Failed to fetch price data"
                    })
            except Exception as e:
                logger.error(f"Error updating price for commodity {commodity.name}: {str(e)}")
                results["failed"] += 1
                results["details"].append({
                    "commodity_id": commodity.id,
                    "commodity_name": commodity.name,
                    "status": "failed",
                    "reason": str(e)
                })
        
        return results

"""
News Data Sources Service for Integra Markets
Fetches news from major financial sources without requiring API keys or triggering reCAPTCHA
"""

import asyncio
import aiohttp
from aiohttp import AsyncResolver, TCPConnector, ClientTimeout, ClientError
import feedparser
import json
import re
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional
from bs4 import BeautifulSoup
import logging
import socket
import asyncio
import random
from typing import Dict, List, Optional, Set
from dataclasses import dataclass
from datetime import datetime, timedelta

@dataclass
class SourceStatus:
    """Tracks the status of a news source"""
    name: str
    last_check: datetime
    is_available: bool
    error_count: int = 0
    last_error: Optional[str] = None
    anti_scraping_detected: bool = False
    recommendations: List[str] = None
    
    def update(self, success: bool, error: Optional[str] = None, anti_scraping: bool = False, recommendations: List[str] = None):
        self.last_check = datetime.now()
        self.is_available = success
        if not success:
            self.error_count += 1
            self.last_error = error
            self.anti_scraping_detected = anti_scraping
            self.recommendations = recommendations
        else:
            self.error_count = 0
            self.last_error = None
            self.anti_scraping_detected = False
            self.recommendations = None

class SourceTracker:
    """Tracks the status of all news sources"""
    def __init__(self):
        self.sources: Dict[str, SourceStatus] = {}
        
    def get_status(self, source_name: str) -> SourceStatus:
        """Get the current status of a source"""
        if source_name not in self.sources:
            self.sources[source_name] = SourceStatus(
                name=source_name,
                last_check=datetime.now(),
                is_available=True
            )
        return self.sources[source_name]
    
    def update_status(self, source_name: str, success: bool, error: Optional[str] = None,
                      anti_scraping: bool = False, recommendations: List[str] = None):
        """Update the status of a source"""
        status = self.get_status(source_name)
        status.update(success, error, anti_scraping, recommendations)
    
    def get_unavailable_sources(self) -> List[SourceStatus]:
        """Get list of sources that are currently unavailable"""
        return [s for s in self.sources.values() if not s.is_available]
    
    def get_anti_scraping_sources(self) -> List[SourceStatus]:
        """Get list of sources that have detected anti-scraping measures"""
        return [s for s in self.sources.values() if s.anti_scraping_detected]

# Global source tracker
source_tracker = SourceTracker()

# Import content extraction utilities
try:
    from content_extractor import ContentExtractor, NLTKSummarizer, get_commodity_keywords
    CONTENT_EXTRACTION_AVAILABLE = True
except ImportError:
    CONTENT_EXTRACTION_AVAILABLE = False
    logging.warning("Content extraction utilities not available")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class NewsDataSources:
    """Handles fetching news from multiple sources"""
    
    def __init__(self, enable_full_content=False, enable_nltk_summary=False, user_sources=None, credentials=None):
        self.session = None
        self.enable_full_content = enable_full_content and CONTENT_EXTRACTION_AVAILABLE
        self.enable_nltk_summary = enable_nltk_summary and CONTENT_EXTRACTION_AVAILABLE
        self.content_extractor = None
        self.nltk_summarizer = None
        self.user_sources = user_sources or []  # List of sources user has enabled
        self.credentials = credentials or {}  # Dict of source credentials
        
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            # Avoid brotli-only responses when the local environment lacks brotli support.
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Cache-Control': 'max-age=0',
            'Sec-Ch-Ua': '"Not A(Brand";v="99", "Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"macOS"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'Priority': 'u=0, i'
        }
        
        if self.enable_nltk_summary:
            try:
                self.nltk_summarizer = NLTKSummarizer()
                logger.info("NLTK summarizer initialized")
            except Exception as e:
                logger.error(f"Failed to initialize NLTK summarizer: {e}")
                self.enable_nltk_summary = False
    
    async def __aenter__(self):
        """Async context manager entry"""
        resolver = AsyncResolver(nameservers=["8.8.8.8", "8.8.4.4"])  # Reliable DNS
        connector = TCPConnector(
            limit=20,
            limit_per_host=5,
            resolver=resolver,
            family=socket.AF_INET,
            enable_cleanup_closed=True,
            force_close=True
        )
        timeout = ClientTimeout(total=30, connect=10, sock_connect=10)
        self.session = aiohttp.ClientSession(
            connector=connector,
            headers=self.headers,
            timeout=timeout
        )
        
        # Initialize content extractor if needed
        if self.enable_full_content:
            self.content_extractor = ContentExtractor()
            await self.content_extractor.__aenter__()
        
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.content_extractor:
            await self.content_extractor.__aexit__(exc_type, exc_val, exc_tb)
        
        if self.session:
            await self.session.close()

    async def _get_text_with_retry(self, url: str, retries: int = 3, verify_ssl: bool = True, initial_delay: float = 1.0) -> str:
        """Get text content with exponential backoff retry
        Args:
            url: URL to fetch
            retries: Number of retries
            verify_ssl: Whether to verify SSL certificates
            initial_delay: Initial delay in seconds before first retry
        Returns:
            Text content from the URL
        Raises:
            Exception if all retries fail
        """
        last_err = None
        for attempt in range(retries):
            try:
                async with self.session.get(url, ssl=verify_ssl) as response:
                    if response.status == 200:
                        return await response.text()
                    if response.status == 429:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    last_err = ClientError(f"HTTP {response.status}")
            except Exception as e:
                last_err = e
                # Exponential backoff with jitter
                delay = initial_delay * (2 ** attempt) * (0.5 + random.random())
                logger.info(f"Retrying {url} in {delay:.1f}s (attempt {attempt + 1}/{retries})")
                await asyncio.sleep(delay)
        
        if last_err:
            logger.error(f"Failed to fetch {url} after {retries} retries: {last_err}")
            raise last_err
        raise Exception(f"Failed to fetch {url} after {retries} retries")

    async def fetch_reuters_commodities(self) -> List[Dict]:
        """Fetch Reuters commodities news via RSS feed"""
        try:
            # Reuters does not expose a stable free commodities RSS feed here, so use
            # a Google News RSS query constrained to Reuters commodity coverage.
            url = (
                "https://news.google.com/rss/search?"
                "q=site%3Areuters.com%20(commodities%20OR%20oil%20OR%20gold%20OR%20wheat%20OR%20gas)"
                "&hl=en-US&gl=US&ceid=US:en"
            )
            
            try:
                content = await self._get_text_with_retry(url, verify_ssl=False)  # Skip SSL for test
            except Exception as e:
                # Check for anti-scraping measures
                status = check_anti_scraping_status(e)
                source_tracker.update_status(
                    'Reuters',
                    success=False,
                    error=str(e),
                    anti_scraping=status['has_anti_scraping'],
                    recommendations=status['recommendations']
                )
                
                if status['has_anti_scraping']:
                    logger.warning(f"Reuters appears to have anti-scraping protection: {status['details']}")
                    logger.info("Recommendations:")
                    for rec in status['recommendations']:
                        logger.info(f"- {rec}")
                else:
                    logger.error(f"Error fetching Reuters news: {e}")
                return []

            feed = feedparser.parse(content)
            
            articles = []
            for entry in feed.entries[:10]:  # Get latest 10 articles
                # Filter for commodity-related keywords
                title = entry.title.lower()
                summary = getattr(entry, 'summary', '').lower()
                
                commodity_keywords = ['oil', 'gas', 'gold', 'silver', 'copper', 'wheat', 'corn', 'commodity', 'energy', 'metal']
                if any(keyword in title or keyword in summary for keyword in commodity_keywords):
                    articles.append({
                        'source': 'Reuters',
                        'title': entry.title,
                        'summary': getattr(entry, 'summary', ''),
                        'url': entry.link,
                        'published': self._parse_date(getattr(entry, 'published', '')),
                        'category': 'commodities'
                    })
            
            logger.info(f"Fetched {len(articles)} Reuters articles")
            source_tracker.update_status('Reuters', success=True)
            return articles
                    
            
        except Exception as e:
            logger.error(f"Error fetching Reuters news: {e}")
            return []
    
    async def fetch_oilprice_news(self) -> List[Dict]:
        """Fetch OilPrice.com articles"""
        try:
            # OilPrice.com RSS feed
            url = "https://oilprice.com/rss/main"
            
            try:
                content = await self._get_text_with_retry(url)
            except Exception as e:
                # Check for anti-scraping measures
                status = check_anti_scraping_status(e)
                source_tracker.update_status(
                    'OilPrice.com',
                    success=False,
                    error=str(e),
                    anti_scraping=status['has_anti_scraping'],
                    recommendations=status['recommendations']
                )
                
                if status['has_anti_scraping']:
                    logger.warning(f"OilPrice.com appears to have anti-scraping protection: {status['details']}")
                    logger.info("Recommendations:")
                    for rec in status['recommendations']:
                        logger.info(f"- {rec}")
                else:
                    logger.error(f"Error fetching OilPrice.com news: {e}")
                return []

            feed = feedparser.parse(content)
            
            articles = []
            for entry in feed.entries[:15]:  # Get latest 15 articles
                articles.append({
                    'source': 'OilPrice.com',
                    'title': entry.title,
                    'summary': getattr(entry, 'summary', ''),
                    'url': entry.link,
                    'published': self._parse_date(entry.published),
                    'category': 'energy'
                })
            
            logger.info(f"Fetched {len(articles)} OilPrice.com articles")
            source_tracker.update_status('OilPrice.com', success=True)
            return articles
                    
            
        except Exception as e:
            logger.error(f"Error fetching OilPrice.com news: {e}")
            return []
    
    async def fetch_yahoo_finance_commodities(self) -> List[Dict]:
        """Fetch Yahoo Finance commodities news via RSS"""
        try:
            # Yahoo Finance commodities RSS feed
            url = "https://finance.yahoo.com/rss/commodities"
            
            try:
                content = await self._get_text_with_retry(url)
            except Exception as e:
                logger.error(f"Error fetching Yahoo Finance news: {e}")
                return []

            feed = feedparser.parse(content)
            
            articles = []
            for entry in feed.entries[:15]:
                title = entry.title.lower()
                summary = getattr(entry, 'summary', '').lower()
                
                # Look for commodity-related content
                commodity_keywords = ['crude', 'oil', 'natural gas', 'gold', 'silver', 'copper', 'wheat', 'corn', 'soybeans', 'commodity', 'futures', 'energy']
                if any(keyword in title or keyword in summary for keyword in commodity_keywords):
                    articles.append({
                        'source': 'Yahoo Finance',
                        'title': entry.title,
                        'summary': getattr(entry, 'summary', ''),
                        'url': entry.link,
                        'published': self._parse_date(entry.published),
                        'category': 'commodities'
                    })
            
            logger.info(f"Fetched {len(articles)} Yahoo Finance articles")
            return articles
                    
            
        except Exception as e:
            logger.error(f"Error fetching Yahoo Finance news: {e}")
            return []

    async def fetch_eia_reports(self) -> List[Dict]:
        """Fetch Energy Information Administration reports and data"""
        try:
            # EIA RSS feed for reports
            url = "https://www.eia.gov/petroleum/weekly/includes/newsletter_rss.xml"
            
            try:
                content = await self._get_text_with_retry(url)
            except Exception as e:
                logger.error(f"Error fetching EIA reports: {e}")
                return []

            feed = feedparser.parse(content)
            
            articles = []
            for entry in feed.entries[:8]:
                articles.append({
                    'source': 'U.S. EIA',
                    'title': entry.title,
                    'summary': getattr(entry, 'summary', ''),
                    'url': entry.link,
                    'published': self._parse_date(entry.published),
                    'category': 'energy_data'
                })
            
            logger.info(f"Fetched {len(articles)} EIA reports")
            return articles
                    
            
        except Exception as e:
            logger.error(f"Error fetching EIA reports: {e}")
            return []

    async def fetch_iea_news(self) -> List[Dict]:
        """Fetch International Energy Agency news"""
        try:
            # IEA news feed
            url = "https://www.iea.org/news"
            
            try:
                content = await self._get_text_with_retry(url)
            except Exception as e:
                logger.error(f"Error fetching IEA news: {e}")
                return []

            feed = feedparser.parse(content)
            
            articles = []
            for entry in feed.entries[:8]:
                articles.append({
                    'source': 'IEA',
                    'title': entry.title,
                    'summary': getattr(entry, 'summary', ''),
                    'url': entry.link,
                    'published': self._parse_date(entry.published),
                    'category': 'energy_policy'
                })
            
            logger.info(f"Fetched {len(articles)} IEA articles")
            return articles
                    
            
        except Exception as e:
            logger.error(f"Error fetching IEA news: {e}")
            return []

    async def fetch_bloomberg_commodities(self) -> List[Dict]:
        """Fetch Bloomberg commodities news via alternative sources"""
        try:
            # Bloomberg commodities RSS (if available)
            # Note: Bloomberg has limited free RSS feeds
            url = "https://feeds.bloomberg.com/markets/news.rss"
            
            try:
                content = await self._get_text_with_retry(url)
            except Exception as e:
                # Check for anti-scraping measures
                status = check_anti_scraping_status(e)
                if status['has_anti_scraping']:
                    logger.warning(f"Bloomberg appears to have anti-scraping protection: {status['details']}")
                    logger.info("Recommendations:")
                    for rec in status['recommendations']:
                        logger.info(f"- {rec}")
                else:
                    logger.error(f"Error fetching Bloomberg news: {e}")
                return []

            feed = feedparser.parse(content)
            
            articles = []
            for entry in feed.entries[:10]:
                title = entry.title.lower()
                summary = getattr(entry, 'summary', '').lower()
                
                # Filter for commodity content
                commodity_keywords = ['oil', 'gas', 'gold', 'silver', 'copper', 'wheat', 'corn', 'commodity', 'energy', 'metal', 'futures']
                if any(keyword in title or keyword in summary for keyword in commodity_keywords):
                    articles.append({
                        'source': 'Bloomberg',
                        'title': entry.title,
                        'summary': getattr(entry, 'summary', ''),
                        'url': entry.link,
                        'published': self._parse_date(entry.published),
                        'category': 'markets'
                    })
            
            logger.info(f"Fetched {len(articles)} Bloomberg articles")
            source_tracker.update_status('Bloomberg', success=True)
            return articles
                    
            
        except Exception as e:
            logger.error(f"Error fetching Bloomberg news: {e}")
            source_tracker.update_status('Bloomberg', success=False, error=str(e))
            return []

    async def fetch_trading_economics(self) -> List[Dict]:
        """Fetch TradingEconomics commodity and forex news via RSS feed"""
        try:
            # TradingEconomics RSS feeds
            urls = [
                "https://tradingeconomics.com/rss/news.aspx?i=commodities+news",  # Commodities feed
                "https://tradingeconomics.com/rss/news.aspx?i=forex+news"         # Forex feed
            ]
            
            all_articles = []
            for url in urls:
                try:
                    async with self.session.get(url) as response:
                        if response.status == 200:
                            content = await response.text()
                            feed = feedparser.parse(content)
                            
                            # Determine category from URL
                            category = 'commodities' if 'commodities' in url else 'forex'
                            
                            for entry in feed.entries[:10]:  # Get latest 10 articles from each feed
                                all_articles.append({
                                    'source': 'Trading Economics',
                                    'title': entry.title,
                                    'summary': getattr(entry, 'summary', ''),
                                    'url': entry.link,
                                    'published': self._parse_date(entry.published),
                                    'category': category
                                })
                except Exception as e:
                    logger.warning(f"Error fetching TradingEconomics feed {url}: {e}")
                    continue
            
            logger.info(f"Fetched {len(all_articles)} Trading Economics articles")
            source_tracker.update_status('Trading Economics', success=True)
            return all_articles
            
        except Exception as e:
            logger.error(f"Error fetching Trading Economics news: {e}")
            source_tracker.update_status('Trading Economics', success=False, error=str(e))
            return []
    def _parse_date(self, date_string: str) -> datetime:
        """Parse various date formats to datetime object"""
        try:
            if not date_string:
                return datetime.now(timezone.utc)

            # Try parsing different date formats
            formats = [
                '%a, %d %b %Y %H:%M:%S %Z',  # RFC 2822
                '%a, %d %b %Y %H:%M:%S %z',  # RFC 2822 with timezone
                '%Y-%m-%dT%H:%M:%S%z',       # ISO 8601
                '%Y-%m-%d %H:%M:%S',         # Simple format
            ]
            
            for fmt in formats:
                try:
                    parsed = datetime.strptime(date_string, fmt)
                    if parsed.tzinfo is None:
                        return parsed.replace(tzinfo=timezone.utc)
                    return parsed.astimezone(timezone.utc)
                except ValueError:
                    continue
                    
            # If all formats fail, return current time
            return datetime.now(timezone.utc)
            
        except Exception:
            return datetime.now(timezone.utc)

    async def fetch_investing_news(self) -> List[Dict]:
        """Fetch news from Investing.com RSS feeds"""
        try:
            # Investing.com commodities feed
            url = "https://www.investing.com/rss/commodities.rss"
            
            async with self.session.get(url) as response:
                if response.status == 200:
                    content = await response.text()
                    feed = feedparser.parse(content)
                    
                    articles = []
                    for entry in feed.entries[:15]:
                        articles.append({
                            'source': 'Investing.com',
                            'title': entry.title,
                            'summary': getattr(entry, 'summary', ''),
                            'url': entry.link,
                            'published': self._parse_date(entry.published),
                            'category': 'commodities'
                        })
                    
                    logger.info(f"Fetched {len(articles)} Investing.com articles")
                    return articles
                    
        except Exception as e:
            logger.error(f"Error fetching Investing.com news: {e}")
            return []
    
    async def fetch_mining_weekly(self) -> List[Dict]:
        """Fetch news from MiningWeekly.com"""
        try:
            # MiningWeekly.com RSS feed
            url = "https://www.miningweekly.com/feed"
            
            async with self.session.get(url) as response:
                if response.status == 200:
                    content = await response.text()
                    feed = feedparser.parse(content)
                    
                    articles = []
                    for entry in feed.entries[:15]:
                        articles.append({
                            'source': 'Mining Weekly',
                            'title': entry.title,
                            'summary': getattr(entry, 'summary', ''),
                            'url': entry.link,
                            'published': self._parse_date(entry.published),
                            'category': 'mining'
                        })
                    
                    logger.info(f"Fetched {len(articles)} Mining Weekly articles")
                    return articles
                    
        except Exception as e:
            logger.error(f"Error fetching Mining Weekly news: {e}")
            return []

    async def fetch_ngi_news(self) -> List[Dict]:
        """Fetch Natural Gas Intelligence news via RSS"""
        try:
            url = "https://www.naturalgasintel.com/feed/"
            try:
                content = await self._get_text_with_retry(url)
            except Exception as e:
                status = check_anti_scraping_status(e)
                source_tracker.update_status(
                    'NGI',
                    success=False,
                    error=str(e),
                    anti_scraping=status['has_anti_scraping'],
                    recommendations=status['recommendations']
                )
                if status['has_anti_scraping']:
                    logger.warning(f"NGI appears to have anti-scraping protection: {status['details']}")
                    logger.info("Recommendations:")
                    for rec in status['recommendations']:
                        logger.info(f"- {rec}")
                else:
                    logger.error(f"Error fetching NGI news: {e}")
                return []

            feed = feedparser.parse(content)
            articles = []
            for entry in feed.entries[:15]:  # Get latest 15 articles
                articles.append({
                    'source': 'Natural Gas Intelligence',
                    'title': entry.title,
                    'summary': getattr(entry, 'summary', ''),
                    'url': entry.link,
                    'published': self._parse_date(entry.published),
                    'category': 'natural_gas'
                })
            
            logger.info(f"Fetched {len(articles)} NGI articles")
            source_tracker.update_status('NGI', success=True)
            return articles

        except Exception as e:
            logger.error(f"Error fetching NGI news: {e}")
            return []

    async def fetch_kitco_news(self) -> List[Dict]:
        """Fetch Kitco metals news via RSS"""
        try:
            urls = [
                "https://www.kitco.com/rss/headlines/gold.xml",
                "https://www.kitco.com/rss/headlines/silver.xml",
                "https://www.kitco.com/rss/headlines/metals.xml"
            ]
            
            all_articles = []
            for url in urls:
                try:
                    content = await self._get_text_with_retry(url)
                    feed = feedparser.parse(content)
                    
                    for entry in feed.entries[:5]:  # Top 5 from each feed
                        # Determine category from URL
                        if 'gold' in url:
                            category = 'gold'
                        elif 'silver' in url:
                            category = 'silver'
                        else:
                            category = 'metals'
                            
                        all_articles.append({
                            'source': 'Kitco News',
                            'title': entry.title,
                            'summary': getattr(entry, 'summary', ''),
                            'url': entry.link,
                            'published': self._parse_date(entry.published),
                            'category': category
                        })
                except Exception as e:
                    logger.warning(f"Error fetching Kitco feed {url}: {e}")
                    continue
            
            logger.info(f"Fetched {len(all_articles)} Kitco articles")
            source_tracker.update_status('Kitco', success=True)
            return all_articles

        except Exception as e:
            logger.error(f"Error fetching Kitco news: {e}")
            return []

    async def fetch_metal_bulletin_news(self) -> List[Dict]:
        """Fetch Metal Bulletin news via RSS"""
        try:
            url = "https://www.metalbulletin.com/rss/"
            try:
                content = await self._get_text_with_retry(url)
            except Exception as e:
                status = check_anti_scraping_status(e)
                source_tracker.update_status(
                    'Metal Bulletin',
                    success=False,
                    error=str(e),
                    anti_scraping=status['has_anti_scraping'],
                    recommendations=status['recommendations']
                )
                if status['has_anti_scraping']:
                    logger.warning(f"Metal Bulletin appears to have anti-scraping protection: {status['details']}")
                    logger.info("Recommendations:")
                    for rec in status['recommendations']:
                        logger.info(f"- {rec}")
                else:
                    logger.error(f"Error fetching Metal Bulletin news: {e}")
                return []

            feed = feedparser.parse(content)
            articles = []
            for entry in feed.entries[:15]:
                articles.append({
                    'source': 'Metal Bulletin',
                    'title': entry.title,
                    'summary': getattr(entry, 'summary', ''),
                    'url': entry.link,
                    'published': self._parse_date(entry.published),
                    'category': 'metals'
                })
            
            logger.info(f"Fetched {len(articles)} Metal Bulletin articles")
            source_tracker.update_status('Metal Bulletin', success=True)
            return articles

        except Exception as e:
            logger.error(f"Error fetching Metal Bulletin news: {e}")
            return []

    async def fetch_energy_gov_news(self) -> List[Dict]:
        """Fetch Energy.gov press releases via RSS"""
        try:
            url = "https://www.energy.gov/news/rss.xml"
            try:
                content = await self._get_text_with_retry(url)
            except Exception as e:
                status = check_anti_scraping_status(e)
                source_tracker.update_status(
                    'Energy.gov',
                    success=False,
                    error=str(e),
                    anti_scraping=status['has_anti_scraping'],
                    recommendations=status['recommendations']
                )
                if status['has_anti_scraping']:
                    logger.warning(f"Energy.gov appears to have anti-scraping protection: {status['details']}")
                    logger.info("Recommendations:")
                    for rec in status['recommendations']:
                        logger.info(f"- {rec}")
                else:
                    logger.error(f"Error fetching Energy.gov news: {e}")
                return []

            feed = feedparser.parse(content)
            articles = []
            
            # Keywords to filter relevant energy/commodity content
            energy_keywords = ['oil', 'gas', 'coal', 'nuclear', 'renewable', 
                             'solar', 'wind', 'battery', 'storage', 'hydrogen',
                             'carbon', 'emission', 'climate', 'energy']
                             
            for entry in feed.entries[:20]:  # Check more entries since we're filtering
                title = entry.title.lower()
                summary = getattr(entry, 'summary', '').lower()
                
                # Only include entries related to energy/commodities
                if any(keyword in title or keyword in summary for keyword in energy_keywords):
                    articles.append({
                        'source': 'Energy.gov',
                        'title': entry.title,
                        'summary': getattr(entry, 'summary', ''),
                        'url': entry.link,
                        'published': self._parse_date(entry.published),
                        'category': 'energy_policy'
                    })
            
            logger.info(f"Fetched {len(articles)} Energy.gov articles")
            source_tracker.update_status('Energy.gov', success=True)
            return articles

        except Exception as e:
            logger.error(f"Error fetching Energy.gov news: {e}")
            return []

    async def fetch_all_sources(self) -> List[Dict]:
        """Fetch news from all sources concurrently"""
        tasks = [
            self.fetch_reuters_commodities(),
            self.fetch_yahoo_finance_commodities(),
            self.fetch_eia_reports(),
            self.fetch_iea_news(),
            self.fetch_bloomberg_commodities(),
            self.fetch_trading_economics(),
            self.fetch_investing_news(),
            self.fetch_mining_weekly(),
            # New sources
            self.fetch_ngi_news(),
            self.fetch_kitco_news(),
            self.fetch_metal_bulletin_news(),
            self.fetch_energy_gov_news(),
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        all_articles = []
        for result in results:
            if isinstance(result, list):
                all_articles.extend(result)
            elif isinstance(result, Exception):
                logger.error(f"Error in fetch task: {result}")
        
        # Sort by publication date (newest first)
        all_articles.sort(key=lambda x: x['published'], reverse=True)
        
        # Remove duplicates based on title similarity
        unique_articles = self._remove_duplicates(all_articles)
        
        logger.info(f"Fetched total of {len(unique_articles)} unique articles from all sources")
        return unique_articles[:50]  # Return top 50 most recent

    def _remove_duplicates(self, articles: List[Dict]) -> List[Dict]:
        """Remove duplicate articles based on title similarity"""
        unique_articles = []
        seen_titles = set()
        
        for article in articles:
            # Create a normalized title for comparison
            normalized_title = re.sub(r'[^\w\s]', '', article['title'].lower()).strip()
            
            # Check if we've seen a very similar title
            is_duplicate = False
            for seen_title in seen_titles:
                # Calculate simple similarity
                words1 = set(normalized_title.split())
                words2 = set(seen_title.split())
                
                if len(words1) > 0 and len(words2) > 0:
                    intersection = len(words1.intersection(words2))
                    union = len(words1.union(words2))
                    similarity = intersection / union
                    
                    if similarity > 0.7:  # 70% similarity threshold
                        is_duplicate = True
                        break
            
            if not is_duplicate:
                unique_articles.append(article)
                seen_titles.add(normalized_title)
        
        return unique_articles
    
    async def enhance_articles_with_full_content(self, articles: List[Dict], commodity_focus: Optional[str] = None, max_enhance: int = 5) -> List[Dict]:
        """Enhance articles by fetching full content and generating NLTK summaries"""
        if not self.enable_full_content or not self.content_extractor:
            logger.warning("Full content extraction not enabled")
            return articles
        
        # Import source config for intelligent enhancement
        try:
            from source_config import SOURCE_ACCESS_MAP, SourceAccessLevel, get_fallback_strategy
        except ImportError:
            logger.warning("Source config not available, using default enhancement")
            SOURCE_ACCESS_MAP = {}
            SourceAccessLevel = None
        
        enhanced_articles = []
        enhance_count = 0
        
        for article in articles:
            try:
                # Only enhance up to max_enhance articles due to processing time
                if enhance_count >= max_enhance:
                    enhanced_articles.append(article)
                    continue
                
                url = article.get('url', '')
                source = article.get('source', '').lower().replace(' ', '_')
                
                if not url:
                    enhanced_articles.append(article)
                    continue
                
                # Check if source is known to be paywalled/blocked
                if SOURCE_ACCESS_MAP and SourceAccessLevel:
                    access_level = SOURCE_ACCESS_MAP.get(source, SourceAccessLevel.LIMITED)
                    if access_level == SourceAccessLevel.RSS_ONLY:
                        logger.info(f"Skipping enhancement for {source} (known paywall/blocked)")
                        article['enhancement_skipped'] = 'paywall'
                        enhanced_articles.append(article)
                        continue
                
                logger.info(f"Enhancing article: {article.get('title', 'Unknown')}")
                
                # Fetch full content
                content_data = await self.content_extractor.fetch_article_content(url)
                
                if content_data.get('error') or not content_data.get('content'):
                    logger.warning(f"Failed to extract content from {url}: {content_data.get('error', 'Unknown error')}")
                    enhanced_articles.append(article)
                    continue
                
                full_content = content_data['content']
                
                # Generate NLTK summary if enabled
                enhanced_summary = article.get('summary', '')
                if self.enable_nltk_summary and self.nltk_summarizer and len(full_content) > 200:
                    # Get commodity-specific keywords for better summarization
                    focus_keywords = get_commodity_keywords(commodity_focus) if commodity_focus else []
                    
                    summary_result = self.nltk_summarizer.summarize_text(
                        full_content, 
                        num_sentences=3, 
                        focus_keywords=focus_keywords
                    )
                    
                    if not summary_result.get('error'):
                        enhanced_summary = summary_result['summary']
                        logger.info(f"Generated NLTK summary ({summary_result['sentences_summary']} sentences from {summary_result['sentences_original']})")
                
                # Create enhanced article
                enhanced_article = {
                    **article,
                    'summary': enhanced_summary,
                    'full_content': full_content,
                    'word_count': content_data.get('word_count', 0),
                    'enhanced': True,
                    'enhancement_method': 'nltk_summarization' if self.enable_nltk_summary else 'full_content_only',
                    'extraction_time': content_data.get('extraction_time')
                }
                
                enhanced_articles.append(enhanced_article)
                enhance_count += 1
                
                # Small delay to be respectful to source servers
                await asyncio.sleep(0.5)
                
            except Exception as e:
                logger.error(f"Error enhancing article {article.get('url', '')}: {e}")
                enhanced_articles.append(article)
        
        logger.info(f"Enhanced {enhance_count} articles with full content")
        return enhanced_articles


def check_anti_scraping_status(error: Exception) -> dict:
    """Analyze error responses to detect anti-scraping measures.
    
    Args:
        error: The exception that occurred during the request
        
    Returns:
        Dict containing:
            - has_anti_scraping (bool): Whether anti-scraping measures were detected
            - details (str): Description of the protection type detected
            - recommendations (list): List of possible workarounds
    """
    result = {
        'has_anti_scraping': False,
        'details': '',
        'recommendations': []
    }
    
    error_str = str(error).lower()
    
    # Check for common anti-scraping indicators
    if any(x in error_str for x in ['403', 'forbidden']):
        result['has_anti_scraping'] = True
        result['details'] = 'Access forbidden - likely due to anti-scraping protection'
        result['recommendations'] = [
            'Consider reducing request frequency',
            'Check if an official API is available',
            'Review the site\'s terms of service and robots.txt'
        ]
    
    elif any(x in error_str for x in ['429', 'too many requests']):
        result['has_anti_scraping'] = True
        result['details'] = 'Rate limiting detected'
        result['recommendations'] = [
            'Implement rate limiting in your requests',
            'Add delays between requests',
            'Consider using multiple proxy servers'
        ]
        
    elif any(x in error_str for x in ['captcha', 'recaptcha', 'security challenge']):
        result['has_anti_scraping'] = True
        result['details'] = 'CAPTCHA or security challenge detected'
        result['recommendations'] = [
            'Check if an official API is available',
            'Review the site\'s terms of service'
        ]
    
    elif 'security controls triggered' in error_str:
        result['has_anti_scraping'] = True
        result['details'] = 'Security controls triggered - likely automated access detection'
        result['recommendations'] = [
            'Check if an official API is available',
            'Consider implementing browser-like headers',
            'Review the site\'s terms of service'
        ]
    
    return result

# Singleton instance
news_sources = NewsDataSources()

async def fetch_latest_news() -> List[Dict]:
    """Main function to fetch latest news from all sources"""
    async with NewsDataSources() as sources:
        return await sources.fetch_all_sources()

# Test function
async def test_news_sources():
    """Test function to verify all news sources are working"""
    print("Testing news data sources...")
    
    async with NewsDataSources() as sources:
        print("Testing Reuters...")
        reuters = await sources.fetch_reuters_commodities()
        print(f"Reuters: {len(reuters)} articles")
        
        print("Testing Yahoo Finance...")
        yahoo = await sources.fetch_yahoo_finance_commodities()
        print(f"Yahoo Finance: {len(yahoo)} articles")
        
        print("Testing EIA...")
        eia = await sources.fetch_eia_reports()
        print(f"EIA: {len(eia)} articles")
        
        print("Testing IEA...")
        iea = await sources.fetch_iea_news()
        print(f"IEA: {len(iea)} articles")
        
        print("Testing Bloomberg...")
        bloomberg = await sources.fetch_bloomberg_commodities()
        print(f"Bloomberg: {len(bloomberg)} articles")
        
        print("Testing S&P Global...")
        sp = await sources.fetch_sp_global_platts()
        print(f"S&P Global: {len(sp)} articles")
        
        print("Testing NGI...")
        ngi = await sources.fetch_ngi_news()
        print(f"NGI: {len(ngi)} articles")
        
        print("Testing Kitco...")
        kitco = await sources.fetch_kitco_news()
        print(f"Kitco: {len(kitco)} articles")
        
        print("Testing Metal Bulletin...")
        mb = await sources.fetch_metal_bulletin_news()
        print(f"Metal Bulletin: {len(mb)} articles")
        
        print("Testing Energy.gov...")
        eg = await sources.fetch_energy_gov_news()
        print(f"Energy.gov: {len(eg)} articles")
        
        print("\nFetching all sources together...")
        print("\nFetching all sources together...")
        all_news = await sources.fetch_all_sources()
        print(f"Total unique articles: {len(all_news)}")
        
        # Print sample articles
        print("\nSample articles:")
        for i, article in enumerate(all_news[:5]):
            print(f"{i+1}. [{article['source']}] {article['title']}")
            print(f"   Published: {article['published']}")
            print(f"   URL: {article['url']}")
            print()

if __name__ == "__main__":
    asyncio.run(test_news_sources())

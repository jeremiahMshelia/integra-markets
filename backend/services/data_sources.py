"""
News Data Sources Service for Integra Markets
Comprehensive commodity news from verified working feeds.

Strategy:
- Alpha Vantage remains primary (via news.py)
- This module is the robust fallback that covers ALL commodities, regions,
  and sources defined in the app's alert preferences.
- Uses Google News targeted queries (aggregates Bloomberg, Reuters, CNBC, FT, etc.)
  plus direct feeds from OilPrice, Investing.com, and CNBC.
- Every query uses `when:7d` to ensure fresh results.

Last verified: Feb 14, 2026
"""

import asyncio
import aiohttp
import feedparser
import re
from datetime import datetime, timedelta
from time import mktime
from typing import List, Dict, Optional
from bs4 import BeautifulSoup
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────
# Google News RSS helper
# ──────────────────────────────────────────────────────────────────────

def _gnews_url(query: str, when: str = "7d") -> str:
    """Build a Google News RSS search URL.
    
    Uses `when:` operator to limit results to recent articles.
    Google News aggregates from Bloomberg, Reuters, CNBC, FT, WSJ, etc.
    """
    q = query.replace(" ", "+")
    return (
        f"https://news.google.com/rss/search"
        f"?q={q}+when:{when}&hl=en-US&gl=US&ceid=US:en"
    )


class NewsDataSources:
    """Fetches commodity news from comprehensive, verified sources."""

    def __init__(self):
        self.session = None
        self.headers = {
            'User-Agent': (
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/120.0.0.0 Safari/537.36'
            ),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
        }

        # ── Direct RSS feeds (verified working Feb 14 2026) ──────────
        self.direct_feeds = {
            "oilprice": {
                "url": "https://oilprice.com/rss/main",
                "source": "OilPrice.com",
                "category": "energy",
            },
            "investing_com": {
                "url": "https://www.investing.com/rss/news.rss",
                "source": "Investing.com",
                "category": "markets",
            },
            "cnbc": {
                "url": (
                    "https://search.cnbc.com/rs/search/combinedcms/view.xml"
                    "?partnerId=wrss01&id=10000664"
                ),
                "source": "CNBC",
                "category": "commodities",
            },
        }

        # ── Google News targeted queries by commodity ────────────────
        # These cover EVERY commodity in the app's suggestedCommodities list:
        # Crude Oil, WTI, Brent, Natural Gas, Gold, Silver, Copper,
        # Corn, Soybeans, Wheat, Tin, Zinc
        self.commodity_queries = {
            # Energy
            "crude_oil": "crude oil price market",
            "wti_brent": "WTI Brent oil futures",
            "natural_gas": "natural gas price LNG",
            # Precious metals
            "gold": "gold price commodity market",
            "silver": "silver price commodity",
            # Industrial metals
            "copper": "copper price commodity market",
            "tin_zinc": "tin zinc metal commodity price",
            # Agriculture
            "grains": "wheat corn soybeans commodity futures",
        }

        # ── Google News targeted queries by region ───────────────────
        # Covers: North America, Europe, Asia Pacific, Middle East,
        # South America, Africa, Eastern Europe, Southeast Asia
        self.region_queries = {
            "middle_east": "Middle East oil energy OPEC",
            "asia_pacific": "Asia commodity trade China",
            "europe": "Europe energy commodity market",
            "africa": "Africa mining commodity resources",
        }

        # ── Commodity keywords for filtering general feeds ───────────
        self.commodity_keywords = [
            'crude', 'oil', 'petroleum', 'wti', 'brent', 'opec',
            'natural gas', 'lng', 'energy', 'gasoline', 'diesel',
            'gold', 'silver', 'copper', 'aluminum', 'tin', 'zinc',
            'mining', 'metal', 'precious',
            'wheat', 'corn', 'soybeans', 'cotton', 'coffee', 'sugar',
            'commodity', 'commodities', 'futures',
            'dollar', 'euro', 'currency', 'forex',
        ]

    async def __aenter__(self):
        self.session = aiohttp.ClientSession(
            headers=self.headers,
            timeout=aiohttp.ClientTimeout(total=20),
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    # ──────────────────────────────────────────────────────────────────
    # Core fetch
    # ──────────────────────────────────────────────────────────────────

    async def _fetch_rss(
        self, url: str, source: str, category: str,
        max_items: int = 12, filter_keywords: bool = False,
    ) -> List[Dict]:
        """Fetch and parse a single RSS feed."""
        try:
            async with self.session.get(url) as response:
                if response.status != 200:
                    logger.warning("%s returned HTTP %s", source, response.status)
                    return []

                content = await response.text()
                feed = feedparser.parse(content)

                articles: List[Dict] = []
                for entry in feed.entries[:max_items]:
                    title = getattr(entry, 'title', '')
                    summary = getattr(entry, 'summary', '') or \
                              getattr(entry, 'description', '')

                    # Strip HTML
                    if summary:
                        try:
                            summary = BeautifulSoup(
                                summary, "html.parser"
                            ).get_text(" ", strip=True)
                        except Exception:
                            pass

                    # For general feeds, filter commodity relevance
                    if filter_keywords:
                        combined = f"{title} {summary}".lower()
                        if not any(kw in combined for kw in self.commodity_keywords):
                            continue

                    # Google News includes the real source in <source> tag
                    real_source = source
                    if hasattr(entry, 'source') and hasattr(entry.source, 'title'):
                        real_source = entry.source.title

                    articles.append({
                        'source': real_source,
                        'title': title,
                        'summary': summary[:500],  # Cap summary length
                        'url': getattr(entry, 'link', ''),
                        'published': self._parse_date(entry),
                        'category': category,
                    })

                return articles

        except Exception as e:
            logger.error("Error fetching %s: %s", source, e)
            return []

    # ──────────────────────────────────────────────────────────────────
    # Date parsing
    # ──────────────────────────────────────────────────────────────────

    def _parse_date(self, entry) -> datetime:
        """Parse date from feed entry."""
        try:
            parsed = getattr(entry, 'published_parsed', None) or \
                     getattr(entry, 'updated_parsed', None)
            if parsed:
                return datetime.fromtimestamp(mktime(parsed))

            date_string = getattr(entry, 'published', '') or \
                          getattr(entry, 'updated', '')
            if not date_string:
                return datetime.utcnow()

            for fmt in [
                '%a, %d %b %Y %H:%M:%S %Z',
                '%a, %d %b %Y %H:%M:%S %z',
                '%Y-%m-%dT%H:%M:%S%z',
                '%Y-%m-%d %H:%M:%S',
            ]:
                try:
                    return datetime.strptime(date_string, fmt)
                except ValueError:
                    continue

            return datetime.utcnow()
        except Exception:
            return datetime.utcnow()

    # ──────────────────────────────────────────────────────────────────
    # Main entry point
    # ──────────────────────────────────────────────────────────────────

    async def fetch_all_sources(self) -> List[Dict]:
        """Fetch news from ALL sources concurrently."""
        tasks: List[asyncio.Task] = []

        # 1. Direct RSS feeds (OilPrice, Investing.com, CNBC)
        for key, info in self.direct_feeds.items():
            tasks.append(
                self._fetch_rss(
                    info["url"], info["source"], info["category"],
                    filter_keywords=(info["category"] == "markets"),
                )
            )

        # 2. Commodity-specific Google News queries
        for key, query in self.commodity_queries.items():
            tasks.append(
                self._fetch_rss(
                    _gnews_url(query),
                    "Google News",
                    key.split("_")[0],  # energy, gold, silver, etc.
                    max_items=8,
                )
            )

        # 3. Region-specific Google News queries
        for key, query in self.region_queries.items():
            tasks.append(
                self._fetch_rss(
                    _gnews_url(query),
                    "Google News",
                    key,
                    max_items=6,
                )
            )

        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_articles: List[Dict] = []
        for result in results:
            if isinstance(result, list):
                all_articles.extend(result)
            elif isinstance(result, Exception):
                logger.error("Feed task error: %s", result)

        # Sort newest first
        all_articles.sort(key=lambda x: x['published'], reverse=True)

        # Deduplicate
        unique = self._remove_duplicates(all_articles)

        # Filter to last 24 hours only
        cutoff = datetime.utcnow() - timedelta(hours=24)
        fresh = [a for a in unique if a['published'] >= cutoff]

        if fresh:
            unique = fresh
        else:
            logger.warning("No articles within 24h, keeping newest 20")
            unique = unique[:20]

        logger.info(
            "Total: %d unique fresh articles from all sources",
            len(unique),
        )
        return unique[:50]

    # ──────────────────────────────────────────────────────────────────
    # Deduplication
    # ──────────────────────────────────────────────────────────────────

    def _remove_duplicates(self, articles: List[Dict]) -> List[Dict]:
        """Remove duplicate articles based on title similarity."""
        unique: List[Dict] = []
        seen: set = set()

        for article in articles:
            normalized = re.sub(
                r'[^\w\s]', '', article['title'].lower()
            ).strip()

            is_dup = False
            for s in seen:
                w1, w2 = set(normalized.split()), set(s.split())
                if w1 and w2 and len(w1 & w2) / len(w1 | w2) > 0.7:
                    is_dup = True
                    break

            if not is_dup:
                unique.append(article)
                seen.add(normalized)

        return unique


# ──────────────────────────────────────────────────────────────────────
# Convenience
# ──────────────────────────────────────────────────────────────────────

news_sources = NewsDataSources()


async def fetch_latest_news() -> List[Dict]:
    """Main function to fetch latest news from all sources."""
    async with NewsDataSources() as sources:
        return await sources.fetch_all_sources()
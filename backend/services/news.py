"""
News service with enhanced caching for high-volume production use.
Integrates multiple news sources with intelligent caching strategies.
"""

import logging
import asyncio
import hashlib
import os
import re
from typing import Dict, List, Any, Optional, Union
from datetime import datetime, timedelta
import time
from urllib.parse import urlparse
from email.utils import parsedate_to_datetime
import feedparser
import httpx
from bs4 import BeautifulSoup

try:
    from groq import Groq
    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False

from services.enhanced_caching import cache_manager, cached
from services.news_preprocessing import preprocess_news, create_pipeline_ready_output
from services.sentiment import analyze_text as analyze_sentiment
from services.alpha_vantage import get_news as alpha_get_news
try:
    from services.data_sources import NewsDataSources
    DATA_SOURCES_AVAILABLE = True
except ImportError:
    DATA_SOURCES_AVAILABLE = False

# Domains whose images should never be used (logos, favicons, etc.)
_BLOCKED_IMAGE_DOMAINS = {
    "news.google.com",
    "lh3.googleusercontent.com",
    "encrypted-tbn0.gstatic.com",
    "www.google.com",
    "google.com",
    "gstatic.com",
    "t0.gstatic.com",
    "t1.gstatic.com",
    "t2.gstatic.com",
    "t3.gstatic.com",
}

def _is_blocked_image(url: str) -> bool:
    """Return True if the image URL belongs to a blocked domain (e.g. Google)."""
    try:
        host = urlparse(url).hostname or ""
        return host in _BLOCKED_IMAGE_DOMAINS
    except Exception:
        return False


logger = logging.getLogger(__name__)

class NewsService:
    """
    Enhanced news service with production-grade caching for high user loads.
    Implements aggressive caching strategies to minimize API calls and improve performance.
    """
    
    def __init__(self):
        """Initialize the news service with enhanced caching"""
        # Use Chrome User-Agent — sites allow this for normal browsing
        self.client = httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": "https://www.google.com/",
                "Upgrade-Insecure-Requests": "1",
            },
        )
        
        # ── Groq client for AI-powered summaries ─────────────────────
        groq_key = os.getenv("GROQ_API_KEY")
        if GROQ_AVAILABLE and groq_key:
            self.groq = Groq(api_key=groq_key)
            self.groq_model = "llama-3.3-70b-versatile"  # Fast + cheap
            logger.info("Groq AI summary generation ENABLED")
        else:
            self.groq = None
            self.groq_model = None
            logger.warning("Groq AI summary generation DISABLED (no key or package)")
        
        # Enhanced cache TTL for production (aggressive caching for 100-1000 users)
        self.cache_ttl = {
            "rss_feeds": 300,       # 5 minutes for RSS feeds (fresher news)
            "article_content": 7200, # 2 hours for full article content
            "sentiment_analysis": 14400, # 4 hours for sentiment analysis
            "preprocessed_news": 10800,  # 3 hours for preprocessed data
            "search_results": 3600   # 1 hour for search results
        }
        
        # RSS feed sources — verified working feeds (tested Feb 14 2026)
        self.rss_sources = {
            "oilprice": "https://oilprice.com/rss/main",
            "investing_com": "https://www.investing.com/rss/news.rss",
            "cnbc_commodities": "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664",
            "google_news_oil": "https://news.google.com/rss/search?q=crude+oil+price+when:7d&hl=en-US&gl=US&ceid=US:en",
            "google_news_gold": "https://news.google.com/rss/search?q=gold+price+commodities+when:7d&hl=en-US&gl=US&ceid=US:en",
        }
        
        # Commodity keywords for filtering relevant news
        self.commodity_keywords = {
            "oil": ["crude", "oil", "petroleum", "wti", "brent", "opec", "drilling", "refinery"],
            "gas": ["natural gas", "lng", "pipeline", "gas prices", "energy"],
            "metals": ["gold", "silver", "copper", "aluminum", "steel", "mining"],
            "agriculture": ["wheat", "corn", "soybeans", "cotton", "coffee", "sugar", "cattle"]
        }
        
        logger.info("NewsService initialized with enhanced caching for production")
    
    def _get_sample_articles(self) -> List[Dict[str, Any]]:
        now = datetime.utcnow()
        ts = now.isoformat()
        return [
            {
                "title": "US Natural Gas Storage Exceeds Expectations",
                "url": "https://www.bloomberg.com",
                "published": ts,
                "summary": "Weekly natural gas storage report shows higher than expected inventory build, indicating potential oversupply conditions in key markets.",
                "source": "Bloomberg",
                "commodity": "NAT GAS",
            },
            {
                "title": "Gold Prices Rally on Fed Policy Uncertainty",
                "url": "https://www.marketwatch.com",
                "published": ts,
                "summary": "Precious metals gain momentum as investors seek safe haven assets amid monetary policy shifts.",
                "source": "MarketWatch",
                "commodity": "GOLD",
            },
            {
                "title": "Oil Demand Forecasts Remain Steady",
                "url": "https://www.iea.org",
                "published": ts,
                "summary": "International Energy Agency maintains stable outlook for global oil consumption through Q4.",
                "source": "IEA",
                "commodity": "OIL",
            },
        ]
    
    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()
    
    def _generate_cache_key(self, *args) -> str:
        """Generate a consistent cache key from arguments"""
        key_string = "|".join(str(arg) for arg in args)
        return hashlib.md5(key_string.encode()).hexdigest()
    
    @cached("news_rss", ttl_seconds=1800)  # 30-minute cache for RSS feeds
    async def _fetch_rss_feed(self, url: str) -> Dict[str, Any]:
        """
        Fetch and parse RSS feed with caching.
        
        Args:
            url: RSS feed URL
            
        Returns:
            Parsed feed data
        """
        try:
            logger.debug(f"Fetching RSS feed: {url}")
            response = await self.client.get(url)
            response.raise_for_status()
            
            # Parse RSS feed
            feed = feedparser.parse(response.text)
            
            # Extract articles
            articles = []
            for entry in feed.entries[:20]:  # Limit to 20 most recent
                # Choose best available summary/description and strip HTML
                summary = entry.get("summary", "") or entry.get("description", "")
                if not summary:
                    content_list = entry.get("content") or []
                    if content_list and isinstance(content_list, list):
                        try:
                            summary = content_list[0].get("value", "")
                        except Exception:
                            summary = ""
                if summary:
                    try:
                        summary = BeautifulSoup(summary, "html.parser").get_text(" ", strip=True)
                    except Exception:
                        pass

                # Normalize published time to ISO string when possible
                published = entry.get("published", "") or entry.get("updated", "")
                try:
                    parsed_struct = entry.get("published_parsed") or entry.get("updated_parsed")
                    if parsed_struct:
                        dt = datetime.fromtimestamp(time.mktime(parsed_struct))
                        published = dt.isoformat()
                    elif isinstance(published, str) and published:
                        dt = parsedate_to_datetime(published)
                        published = dt.isoformat()
                except Exception:
                    # Fall back to original string if parsing fails
                    pass

                articles.append({
                    "title": entry.get("title", ""),
                    "url": entry.get("link", ""),
                    "published": published,
                    "summary": summary,
                    "source": feed.feed.get("title", "Unknown")
                })
            
            return {
                "articles": articles,
                "feed_title": feed.feed.get("title", ""),
                "last_updated": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error fetching RSS feed {url}: {str(e)}")
            return {"articles": [], "error": str(e)}
    
    @cached("news_content", ttl_seconds=7200)  # 2-hour cache for article content
    async def _fetch_article_content(self, url: str) -> Dict[str, Any]:
        """
        Fetch full article content with caching.
        
        Args:
            url: Article URL
            
        Returns:
            Article content data
        """
        try:
            logger.debug(f"Fetching article content: {url}")
            response = await self.client.get(url)
            response.raise_for_status()
            
            # Parse HTML content
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Extract article text (basic extraction)
            paragraphs = soup.find_all('p')
            content = ' '.join([p.get_text() for p in paragraphs])
            
            # Extract title
            title = ""
            title_tags = soup.find_all(['h1', 'title'])
            if title_tags:
                title = title_tags[0].get_text().strip()
            
            return {
                "title": title,
                "content": content[:5000],  # Limit content length
                "url": url,
                "extracted_at": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error fetching article content {url}: {str(e)}")
            return {"content": "", "error": str(e)}
    
    # ──────────────────────────────────────────────────────────────────
    # Google News URL resolution
    # ──────────────────────────────────────────────────────────────────
    async def _resolve_google_news_url(self, url: str) -> str:
        """Resolve a Google News redirect URL to the actual article URL.
        
        Google News RSS links look like:
          https://news.google.com/rss/articles/CBMi...
        They 302-redirect to the real article.
        """
        if "news.google.com" not in url:
            return url
        try:
            # Use a client that does NOT follow redirects to capture Location header
            async with httpx.AsyncClient(
                timeout=8.0,
                follow_redirects=False,
                headers=self.client.headers,
            ) as tmp:
                resp = await tmp.get(url)
                if resp.status_code in (301, 302, 303, 307, 308):
                    real_url = resp.headers.get("location", url)
                    logger.debug("Resolved Google News URL -> %s", real_url[:80])
                    return real_url
            # If it returned 200, Google rendered a page. Try extracting the
            # canonical <link> or <a> tag.
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, "html.parser")
                # Google News pages embed the real URL in a <a data-n-au> tag
                for a in soup.find_all("a", href=True):
                    href = a["href"]
                    if href.startswith("http") and "news.google.com" not in href:
                        logger.debug("Resolved Google News URL (from page) -> %s", href[:80])
                        return href
            return url
        except Exception as e:
            logger.warning("Could not resolve Google News URL %s: %s", url[:60], e)
            return url

    @cached("news_image", ttl_seconds=86400)  # 24-hour cache for images
    async def _extract_article_image(self, url: str) -> Optional[str]:
        """
        Extract og:image or other image from article URL.
        Uses social media crawler approach for maximum compatibility.
        
        Priority:
        1. og:image / og:image:url
        2. twitter:image / twitter:image:src
        3. First significant image in content
        
        Skips Google logos / favicons.
        """
        # Resolve Google News redirects first
        url = await self._resolve_google_news_url(url)
        
        try:
            # Fetch with shorter timeout for image extraction
            response = await self.client.get(url, timeout=8.0)
            response.raise_for_status()
            
            html = response.text
            soup = BeautifulSoup(html, 'html.parser')
            
            # Priority 1: og:image (most reliable for social previews)
            for prop in ['og:image', 'og:image:url', 'og:image:secure_url']:
                og_image = soup.find('meta', property=prop)
                if og_image and og_image.get('content'):
                    img_url = og_image['content']
                    if img_url.startswith('http') and not _is_blocked_image(img_url):
                        logger.debug(f"Found {prop} for {url}: {img_url[:50]}...")
                        return img_url
            
            # Priority 2: twitter:image
            for name in ['twitter:image', 'twitter:image:src']:
                twitter_image = soup.find('meta', attrs={'name': name})
                if twitter_image and twitter_image.get('content'):
                    img_url = twitter_image['content']
                    if img_url.startswith('http') and not _is_blocked_image(img_url):
                        logger.debug(f"Found {name} for {url}: {img_url[:50]}...")
                        return img_url
                # Also check property attribute
                twitter_image = soup.find('meta', property=name)
                if twitter_image and twitter_image.get('content'):
                    img_url = twitter_image['content']
                    if img_url.startswith('http') and not _is_blocked_image(img_url):
                        return img_url
            
            # Priority 3: image_src link tag
            image_link = soup.find('link', rel='image_src')
            if image_link and image_link.get('href'):
                href = image_link['href']
                if not _is_blocked_image(href):
                    return href
            
            # Priority 4: First significant image in article/main content
            main_content = soup.find('article') or soup.find('main') or soup.find('div', class_='content') or soup
            images = main_content.find_all('img', src=True)
            
            for img in images:
                src = img.get('src', '')
                if not src:
                    continue
                    
                # Skip tiny images, trackers, and blocked domains
                if any(x in src.lower() for x in ['1x1', 'pixel', 'spacer', 'blank', 'tracking']):
                    continue
                if src.startswith('data:') and len(src) < 1000:
                    continue
                    
                # Make relative URLs absolute
                if not src.startswith('http'):
                    from urllib.parse import urljoin
                    src = urljoin(url, src)
                
                if _is_blocked_image(src):
                    continue
                
                # Check if it's a real content image
                width = img.get('width', '')
                height = img.get('height', '')
                try:
                    w = int(width) if width else 0
                    h = int(height) if height else 0
                    if w >= 200 or h >= 150:
                        logger.debug(f"Found large img for {url}: {src[:50]}...")
                        return src
                except (ValueError, TypeError):
                    pass
                
                # Accept if path suggests content image
                if any(x in src.lower() for x in ['article', 'content', 'media', 'image', 'photo', 'news', 'upload']):
                    return src
            
            logger.debug(f"No image found for {url}")
            return None
            
        except Exception as e:
            logger.warning(f"Could not extract image from {url}: {str(e)}")
            return None
    
    async def _enrich_articles_with_images(self, articles: List[Dict[str, Any]], max_concurrent: int = 5) -> None:
        """
        Enrich articles with image URLs by extracting from source pages.
        Modifies articles in place. Also filters out blocked images that
        may have been set earlier (e.g. Google logo).
        """
        # Only fetch images for first N articles to avoid too many requests
        articles_to_enrich = articles[:12]  # Top 12 for visual display
        
        async def fetch_image(article: Dict[str, Any]) -> None:
            url = article.get('url', '')
            
            # Resolve Google News redirect URLs to real article URLs
            if url and "news.google.com" in url:
                resolved = await self._resolve_google_news_url(url)
                if resolved != url:
                    article['url'] = resolved  # Update article URL too
                    url = resolved
            
            # If image already exists, validate it isn't a blocked image
            existing_img = article.get('image_url', '')
            if existing_img and _is_blocked_image(existing_img):
                logger.debug("Removing blocked image from article: %s", existing_img[:60])
                article['image_url'] = None
                existing_img = None
            
            # If image already exists and is valid, skip
            if existing_img:
                return

            if url:
                image_url = await self._extract_article_image(url)
                if image_url:
                    article['image_url'] = image_url
        
        # Process in batches to limit concurrency
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def fetch_with_semaphore(article):
            async with semaphore:
                await fetch_image(article)
        
        tasks = [fetch_with_semaphore(a) for a in articles_to_enrich]
        await asyncio.gather(*tasks, return_exceptions=True)
    
    # ──────────────────────────────────────────────────────────────────
    # Groq AI-powered summary improvement
    # ──────────────────────────────────────────────────────────────────
    def _needs_summary_fix(self, article: Dict[str, Any]) -> bool:
        """Determine if an article summary needs AI improvement."""
        summary = (article.get("summary") or "").strip()
        title = (article.get("title") or "").strip()
        
        # No summary at all
        if not summary or len(summary) < 20:
            return True
        
        # Summary is just the title repeated (or very similar)
        if summary.lower().replace(" ", "") == title.lower().replace(" ", ""):
            return True
        
        # Summary looks like a page title / site name (no sentence structure)
        if len(summary) < 80 and "." not in summary and "," not in summary:
            return True
        
        # Summary is truncated mid-sentence (doesn't end with sentence-ending punct)
        last_char = summary.rstrip()[-1] if summary.rstrip() else ""
        if last_char not in ".!?\"'" and len(summary) > 150:
            return True
        
        # Summary ends with common truncation patterns
        if re.search(r'\b(the|a|an|and|or|for|in|of|to|with|by|from|at|is|are|was)\s*$', summary, re.I):
            return True
        
        return False
    
    async def _improve_summaries_with_groq(self, articles: List[Dict[str, Any]]) -> None:
        """Use Groq Llama 3.3 70B to generate clean summaries for articles
        that have broken/truncated/missing summaries. Modifies articles in place.
        
        Strategy:
          - Batch articles to minimise API calls (5 per request)
          - Only process articles whose summary actually needs fixing
          - Cache results so we never re-summarise the same title
        """
        if not self.groq:
            return
        
        # Identify articles that need fixing
        to_fix: List[Dict[str, Any]] = []
        for article in articles:
            # Check cache first
            cache_key = self._generate_cache_key("groq_summary", article.get("title", ""))
            cached_summary = cache_manager.get("groq_summary", cache_key)
            if cached_summary is not None:
                article["summary"] = cached_summary
                continue
            
            if self._needs_summary_fix(article):
                to_fix.append(article)
        
        if not to_fix:
            logger.debug("All summaries are clean, skipping Groq")
            return
        
        logger.info("Improving %d article summaries via Groq", len(to_fix))
        
        # Process in batches of 5
        batch_size = 5
        for i in range(0, len(to_fix), batch_size):
            batch = to_fix[i:i + batch_size]
            await self._groq_summarize_batch(batch)
    
    async def _groq_summarize_batch(self, articles: List[Dict[str, Any]]) -> None:
        """Send a batch of articles to Groq and update their summaries."""
        if not articles:
            return
        
        # Build the prompt
        items = []
        for idx, article in enumerate(articles):
            title = article.get("title", "No title")
            raw_summary = (article.get("summary") or "")[:600]
            items.append(f"[{idx + 1}] Title: {title}\nRaw text: {raw_summary}")
        
        prompt = (
            "You are a professional financial news editor for a commodity markets app.\n"
            "Below are news articles with broken, truncated, or missing summaries.\n"
            "For EACH article, write a clean, complete summary of exactly 2-3 sentences.\n"
            "Focus on the key facts and market impact. Do NOT start with 'This article...'.\n"
            "Write in a professional, concise tone suitable for commodity traders.\n\n"
            + "\n\n".join(items)
            + "\n\nRespond with ONLY the summaries, one per article, in this exact format:\n"
            "[1] Your summary here.\n"
            "[2] Your summary here.\n"
            "...and so on. No extra commentary."
        )
        
        try:
            # Run in executor since groq SDK is synchronous
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.groq.chat.completions.create(
                    model=self.groq_model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                    max_tokens=2000,
                )
            )
            
            content = response.choices[0].message.content or ""
            
            # Parse the numbered responses
            summaries = {}
            for match in re.finditer(r'\[(\d+)\]\s*(.+?)(?=\[\d+\]|\Z)', content, re.DOTALL):
                idx = int(match.group(1)) - 1
                summary_text = match.group(2).strip()
                if summary_text and len(summary_text) > 20:
                    summaries[idx] = summary_text
            
            # Apply summaries to articles and cache them
            for idx, article in enumerate(articles):
                if idx in summaries:
                    article["summary"] = summaries[idx]
                    # Cache for 4 hours
                    cache_key = self._generate_cache_key("groq_summary", article.get("title", ""))
                    cache_manager.set("groq_summary", cache_key, summaries[idx], 14400)
                    logger.debug("Improved summary for: %s", article.get("title", "?")[:50])
                    
        except Exception as e:
            logger.error("Groq batch summarization failed: %s", str(e))
    
    async def get_latest_news(self, 
                            commodities: Optional[List[str]] = None,
                            limit: int = 50,
                            include_sentiment: bool = True,
                            hours: Optional[int] = None) -> Dict[str, Any]:
        """
        Get latest commodity news with enhanced caching.
        
        Args:
            commodities: List of commodity types to filter by
            limit: Maximum number of articles to return
            include_sentiment: Whether to include sentiment analysis
            
        Returns:
            Dict containing news articles with metadata
        """
        cache_key = self._generate_cache_key("latest_news", str(commodities), limit, include_sentiment, hours)
        
        # Check cache first
        cached_result = cache_manager.get("news_latest", cache_key)
        if cached_result is not None:
            logger.debug("Cache HIT for latest news")
            return cached_result
        
        logger.info(f"Fetching latest news for commodities: {commodities}")
        
        all_articles: List[Dict[str, Any]] = []

        # --- Primary source: Alpha Vantage NEWS_SENTIMENT (global feed) ---
        try:
            # Call without topics or tickers to use the broad global feed,
            # then filter by commodity keywords below.
            av_response = await alpha_get_news(limit=limit)
            if isinstance(av_response, dict) and isinstance(av_response.get("articles"), list):
                for a in av_response["articles"]:
                    all_articles.append({
                        "title": a.get("title", ""),
                        "url": a.get("url", ""),
                        # Alpha Vantage uses time_published like 20241119T150000Z
                        "published": a.get("time_published", ""),
                        "time_published": a.get("time_published", ""),
                        "summary": a.get("summary", ""),
                        "source": a.get("source", "Alpha Vantage"),
                        "source_name": "alpha_vantage",
                        # Include sentiment from Alpha Vantage
                        "sentiment": a.get("sentiment", "NEUTRAL"),
                        "sentiment_score": a.get("sentiment_score", 0.0),
                    })
                logger.info("Alpha Vantage provided %d raw articles before filtering", len(all_articles))
        except Exception as e:
            logger.error(f"Error fetching Alpha Vantage news: {str(e)}")

        # --- Secondary source: NewsDataSources (robust RSS feeds) ---
        if (not all_articles or len(all_articles) < 5) and DATA_SOURCES_AVAILABLE:
            logger.info("Alpha Vantage returned limited/no news, falling back to NewsDataSources")
            try:
                async with NewsDataSources() as sources:
                    # Fetch from all available sources
                    rss_articles = await sources.fetch_all_sources()
                    
                    # Convert to internal format
                    for article in rss_articles:
                        # Skip if we already have this URL
                        if any(a.get("url") == article.get("url") for a in all_articles):
                            continue
                            
                        # Normalize timestamp
                        pub_date = article.get("published", datetime.utcnow())
                        if isinstance(pub_date, datetime):
                            pass  # Already a datetime, good
                        elif isinstance(pub_date, str):
                            try:
                                pub_date = datetime.fromisoformat(pub_date.replace("Z", "+00:00"))
                            except:
                                pub_date = datetime.utcnow()
                        else:
                            pub_date = datetime.utcnow()
                        
                        # Calculate sentiment locally since RSS doesn't provide it
                        combined_text = f"{article.get('title', '')} {article.get('summary', '')}"
                        sentiment_result = await analyze_sentiment(combined_text)
                        
                        # Extract ensemble sentiment
                        ensemble = sentiment_result.get("ensemble", {})
                        sentiment_label = ensemble.get("sentiment", "NEUTRAL")
                        sentiment_conf = ensemble.get("confidence", 0.0)

                        # Store published as ISO string so _parse_pub_dt works later
                        pub_str = pub_date.strftime("%Y-%m-%dT%H:%M:%S")
                        all_articles.append({
                            "title": article.get("title", ""),
                            "url": article.get("url", ""),
                            "time_published": pub_date.strftime("%Y%m%dT%H%M%S"),
                            "summary": article.get("summary", ""),
                            "source": article.get("source", "RSS"),
                            "source_name": "rss_fallback",
                            "sentiment": sentiment_label,
                            "sentiment_score": sentiment_conf,
                            "published": pub_str
                        })
                    
                    logger.info(f"NewsDataSources provided {len(rss_articles)} articles, total now {len(all_articles)}")
            except Exception as e:
                logger.error(f"Error fetching from NewsDataSources: {str(e)}")

        # --- Tertiary source: direct RSS feeds (only if everything else failed) ---
        if not all_articles:
            tasks = []
            for source_name, rss_url in self.rss_sources.items():
                task = self._fetch_rss_feed(rss_url)
                tasks.append((source_name, task))
            
            # Execute all RSS fetches concurrently
            for source_name, task in tasks:
                try:
                    feed_data = await task
                    if feed_data.get("articles"):
                        for article in feed_data["articles"]:
                            article["source_name"] = source_name
                            all_articles.append(article)
                except Exception as e:
                    logger.error(f"Error processing feed {source_name}: {str(e)}")
        
        # Filter by commodity keywords if specified
        if commodities:
            filtered_articles = []

            def _normalize_commodity(name: str) -> Optional[str]:
                key = (name or "").lower().strip()
                if key in self.commodity_keywords:
                    return key
                if key in ("oil", "brent", "wti", "crude", "energy"):
                    return "oil"
                if key in ("nat gas", "natural gas", "gas", "lng"):
                    return "gas"
                if key in ("gold", "silver", "copper", "metals", "metal"):
                    return "metals"
                if key in ("wheat", "corn", "soybeans", "soybean", "agriculture", "ag"):
                    return "agriculture"
                return None

            normalized_map: Dict[str, Optional[str]] = {
                commodity: _normalize_commodity(commodity) for commodity in commodities
            }

            for article in all_articles:
                article_text = f"{article.get('title', '')} {article.get('summary', '')}".lower()
                
                for commodity in commodities:
                    category_key = normalized_map.get(commodity)
                    if not category_key:
                        continue
                    keywords = self.commodity_keywords.get(category_key, [])
                    if any(keyword.lower() in article_text for keyword in keywords):
                        article["commodity"] = commodity
                        filtered_articles.append(article)
                        break

            if filtered_articles:
                # Put commodity-matched articles first but keep all others as well
                unmatched = [a for a in all_articles if a not in filtered_articles]
                all_articles = filtered_articles + unmatched

        def _parse_pub_dt(published_val: Any) -> Optional[datetime]:
            """Parse various published/time formats into a datetime.

            Handles: datetime objects, ISO strings, RFC2822, Alpha Vantage compact.
            """
            if published_val is None:
                return None
            # Handle datetime objects directly (from data_sources.py)
            if isinstance(published_val, datetime):
                return published_val
            if not isinstance(published_val, str) or not published_val:
                return None
            s = published_val.strip()

            # Alpha Vantage format: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
            if len(s) >= 15 and s[:8].isdigit() and s[8] == "T" and s[9:15].isdigit():
                try:
                    year = int(s[0:4])
                    month = int(s[4:6])
                    day = int(s[6:8])
                    hour = int(s[9:11])
                    minute = int(s[11:13])
                    second = int(s[13:15])
                    return datetime(year, month, day, hour, minute, second)
                except Exception:
                    pass

            try:
                return datetime.fromisoformat(s.replace("Z", "+00:00"))
            except Exception:
                try:
                    return parsedate_to_datetime(s)
                except Exception:
                    return None

        # Filter by recency if hours window is provided
        if hours is not None and hours > 0 and all_articles:
            cutoff = datetime.utcnow() - timedelta(hours=hours)
            recent_articles: List[Dict[str, Any]] = []
            for article in all_articles:
                published = article.get("published") or article.get("time_published")
                article_dt = _parse_pub_dt(published)
                if article_dt and article_dt >= cutoff:
                    recent_articles.append(article)

            if recent_articles:
                all_articles = recent_articles
            else:
                logger.warning(
                    "No articles within requested %s-hour window; "
                    "returning unfiltered articles instead",
                    hours,
                )

        # Hard cap — only show articles from the last 24 hours
        max_age_hours = 24
        if all_articles:
            cutoff = datetime.utcnow() - timedelta(hours=max_age_hours)
            recent_by_days: List[Dict[str, Any]] = []
            for article in all_articles:
                published = article.get("published") or article.get("time_published")
                article_dt = _parse_pub_dt(published)
                if article_dt and article_dt >= cutoff:
                    recent_by_days.append(article)

            if recent_by_days:
                all_articles = recent_by_days
            else:
                logger.warning(
                    "All %d articles older than %s hours; keeping newest 10 anyway",
                    len(all_articles), max_age_hours,
                )
                # Keep the newest articles anyway rather than showing nothing
                all_articles = all_articles[:10]

        # Sort by published date (most recent first)
        all_articles.sort(key=lambda x: x.get("published", ""), reverse=True)
        
        # Limit results
        all_articles = all_articles[:limit]
        
        # Add sentiment analysis if requested
        if include_sentiment:
            for article in all_articles:
                try:
                    # Skip if article already has valid sentiment from Alpha Vantage
                    # Trust the original sentiment - don't re-analyze
                    has_valid_sentiment = (
                        article.get("sentiment") and 
                        article.get("sentiment_score") is not None and
                        article.get("sentiment_score") >= 0.5  # Our normalized scores are 0.5-0.99
                    )
                    if has_valid_sentiment:
                        logger.debug(f"Skipping sentiment analysis - already has: {article.get('sentiment')} {article.get('sentiment_score')}")
                        continue
                    
                    # Use cached sentiment analysis
                    sentiment_key = self._generate_cache_key("sentiment", article.get("url", ""), article.get("title", ""))
                    cached_sentiment = cache_manager.get("news_sentiment", sentiment_key)
                    
                    if cached_sentiment is not None:
                        article.update(cached_sentiment)
                    else:
                        # Analyze sentiment
                        text = f"{article.get('title', '')} {article.get('summary', '')}"
                        sentiment_result = await analyze_sentiment(text)
                        
                        # Extract from ensemble (analyze_text returns {ensemble: {sentiment, confidence}, ...})
                        ensemble = sentiment_result.get("ensemble", {})
                        article.update({
                            "sentiment": ensemble.get("sentiment", "NEUTRAL").upper(),
                            "sentiment_score": ensemble.get("confidence", 0.0),
                            "sentiment_analysis": sentiment_result
                        })
                        
                        # Cache the sentiment analysis
                        cache_manager.set("news_sentiment", sentiment_key, {
                            "sentiment": article["sentiment"],
                            "sentiment_score": article["sentiment_score"],
                            "sentiment_analysis": article["sentiment_analysis"]
                        }, self.cache_ttl["sentiment_analysis"])
                        
                except Exception as e:
                    logger.error(f"Error analyzing sentiment for article: {str(e)}")
                    # Only set defaults if no sentiment exists
                    if not article.get("sentiment"):
                        article.update({
                            "sentiment": "NEUTRAL",
                            "sentiment_score": 0.0
                        })
        
        # Enrich articles with images for desktop visual display
        try:
            await self._enrich_articles_with_images(all_articles)
        except Exception as e:
            logger.warning(f"Could not enrich articles with images: {str(e)}")
        
        # ── AI-powered summary cleanup via Groq ─────────────────────
        try:
            await self._improve_summaries_with_groq(all_articles)
        except Exception as e:
            logger.warning(f"Groq summary improvement failed (non-fatal): {str(e)}")
        
        result = {
            "articles": all_articles,
            "total_count": len(all_articles),
            "commodities_filter": commodities,
            "timestamp": datetime.now().isoformat(),
            "cache_info": {
                "cached": False,
                "cache_key": cache_key
            }
        }
        
        # Cache the result
        cache_manager.set("news_latest", cache_key, result, self.cache_ttl["rss_feeds"])
        
        return result
    
    async def get_news_analysis(self, url: str) -> Dict[str, Any]:
        """
        Get comprehensive news analysis with enhanced preprocessing and caching.
        
        Args:
            url: Article URL
            
        Returns:
            Dict containing preprocessed analysis
        """
        cache_key = self._generate_cache_key("news_analysis", url)
        
        # Check cache first
        cached_result = cache_manager.get("news_analysis", cache_key)
        if cached_result is not None:
            logger.debug("Cache HIT for news analysis")
            return cached_result
        
        logger.info(f"Analyzing news article: {url}")
        
        try:
            # Fetch article content
            content_data = await self._fetch_article_content(url)
            
            if content_data.get("error"):
                return {"error": content_data["error"]}
            
            # Create enhanced preprocessing pipeline
            full_text = f"{content_data.get('title', '')} {content_data.get('content', '')}"
            pipeline_output = create_pipeline_ready_output(full_text)
            
            # Add metadata
            pipeline_output.update({
                "url": url,
                "title": content_data.get("title", ""),
                "analyzed_at": datetime.now().isoformat(),
                "cache_info": {
                    "cached": False,
                    "cache_key": cache_key
                }
            })
            
            # Cache the result
            cache_manager.set("news_analysis", cache_key, pipeline_output, self.cache_ttl["preprocessed_news"])
            
            return pipeline_output
            
        except Exception as e:
            logger.error(f"Error analyzing news article {url}: {str(e)}")
            return {"error": str(e)}
    
    async def search_news(self, 
                         query: str,
                         commodities: Optional[List[str]] = None,
                         limit: int = 20) -> Dict[str, Any]:
        """
        Search news articles with caching.
        
        Args:
            query: Search query
            commodities: Optional commodity filter
            limit: Maximum results
            
        Returns:
            Search results
        """
        cache_key = self._generate_cache_key("search", query, str(commodities), limit)
        
        # Check cache first
        cached_result = cache_manager.get("news_search", cache_key)
        if cached_result is not None:
            logger.debug("Cache HIT for news search")
            return cached_result
        
        logger.info(f"Searching news: {query}")
        
        # Get all recent news
        all_news = await self.get_latest_news(commodities=commodities, limit=200, include_sentiment=False)
        
        # Filter by search query
        query_lower = query.lower()
        matching_articles = []
        
        for article in all_news.get("articles", []):
            article_text = f"{article.get('title', '')} {article.get('summary', '')}".lower()
            if query_lower in article_text:
                matching_articles.append(article)
        
        # Limit results
        matching_articles = matching_articles[:limit]
        
        result = {
            "articles": matching_articles,
            "query": query,
            "total_found": len(matching_articles),
            "commodities_filter": commodities,
            "timestamp": datetime.now().isoformat(),
            "cache_info": {
                "cached": False,
                "cache_key": cache_key
            }
        }
        
        # Cache the result
        cache_manager.set("news_search", cache_key, result, self.cache_ttl["search_results"])
        
        return result
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get news service cache statistics"""
        base_stats = cache_manager.get_stats()
        
        # Add service-specific metrics
        base_stats.update({
            "cache_ttl_settings": self.cache_ttl,
            "rss_sources_count": len(self.rss_sources),
            "commodity_categories": list(self.commodity_keywords.keys())
        })
        
        return base_stats

# Create singleton instance
news_service = NewsService()

# Convenience functions for external use
async def get_latest_commodity_news(
    commodities: Optional[List[str]] = None,
    limit: int = 50,
    hours: Optional[int] = None,
) -> Dict[str, Any]:
    """Get latest commodity news with enhanced caching"""
    return await news_service.get_latest_news(
        commodities=commodities,
        limit=limit,
        include_sentiment=True,
        hours=hours,
    )

async def analyze_news_article(url: str) -> Dict[str, Any]:
    """Analyze a news article with comprehensive preprocessing"""
    return await news_service.get_news_analysis(url)

async def search_commodity_news(query: str, commodities: Optional[List[str]] = None, limit: int = 20) -> Dict[str, Any]:
    """Search commodity news with caching"""
    return await news_service.search_news(query=query, commodities=commodities, limit=limit)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client
import datetime
import logging
from contextlib import asynccontextmanager

# Import article summarizer
try:
    from article_summarizer import ArticleSummarizer
    SUMMARIZER_AVAILABLE = True
except ImportError:
    SUMMARIZER_AVAILABLE = False

# Import news data sources
try:
    from data_sources import NewsDataSources
    NEWS_SOURCES_AVAILABLE = True
except ImportError:
    NEWS_SOURCES_AVAILABLE = False
    logging.warning("News data sources not available")

# Import user news service
try:
    from user_news_service import user_news_service
    USER_NEWS_AVAILABLE = True
except ImportError:
    USER_NEWS_AVAILABLE = False
    user_news_service = None

# Import Groq AI service
try:
    from groq_ai_service import GroqAIService, ResponseMode
    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False
    logging.warning("Groq AI service not available")

# NLTK imports
try:
    import nltk
    from nltk.sentiment.vader import SentimentIntensityAnalyzer
    NLTK_AVAILABLE = True
except ImportError:
    NLTK_AVAILABLE = False

# Load environment variables
parent_dir = Path(__file__).parent.parent
env_path = parent_dir / '.env'
load_dotenv(env_path)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize VADER analyzer
vader_analyzer = None
article_summarizer = None
groq_service = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup"""
    global vader_analyzer, article_summarizer, groq_service
    
    logger.info("Starting Integra Markets Enhanced Backend with NLP...")
    
    if NLTK_AVAILABLE:
        try:
            # Download required NLTK data
            try:
                nltk.data.find('vader_lexicon')
            except LookupError:
                logger.info("Downloading VADER lexicon...")
                nltk.download('vader_lexicon', quiet=True)
            
            # Initialize VADER
            vader_analyzer = SentimentIntensityAnalyzer()
            logger.info("VADER sentiment analyzer initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize VADER: {e}")
    else:
        logger.warning("NLTK not available - using basic sentiment analysis")
    
    # Initialize article summarizer
    if SUMMARIZER_AVAILABLE:
        try:
            article_summarizer = ArticleSummarizer()
            logger.info("Article summarizer initialized")
        except Exception as e:
            logger.error(f"Failed to initialize article summarizer: {e}")
    
    # Initialize Groq AI service
    if GROQ_AVAILABLE and os.getenv("GROQ_API_KEY"):
        try:
            groq_service = GroqAIService()
            logger.info("Groq AI service initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Groq AI: {e}")
    
    yield
    
    # Cleanup
    logger.info("Shutting down...")

# Create FastAPI app
app = FastAPI(
    title="Integra Markets AI Backend",
    description="Financial AI Analysis API with NLP Support",
    version="2.1.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Supabase
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")

if supabase_url and supabase_key:
    supabase: Client = create_client(supabase_url, supabase_key)
    logger.info("Supabase client initialized")
else:
    supabase = None
    logger.warning("Supabase credentials not found")

# Pydantic models
class SentimentRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to analyze")
    commodity: Optional[str] = Field(None, description="Specific commodity context")
    enhanced: bool = Field(True, description="Use enhanced analysis")

class NewsAnalysisRequest(BaseModel):
    text: str
    source: Optional[str] = None

class ArticleSummarizeRequest(BaseModel):
    url: str = Field(..., description="URL of the article to summarize")
    sentences: int = Field(5, ge=1, le=10, description="Number of sentences in summary")
    commodity: Optional[str] = Field(None, description="Specific commodity to focus on")

class AIAnalysisRequest(BaseModel):
    query: str = Field(..., description="Query for AI analysis")
    commodity: Optional[str] = Field(None, description="Specific commodity context")
    use_tools: bool = Field(True, description="Enable tool use")
    search_web: bool = Field(True, description="Enable web search")

class AIChatRequest(BaseModel):
    messages: List[Dict[str, str]] = Field(..., description="Chat messages")
    available_tools: Optional[List[str]] = Field(None, description="Available tools to use")
    commodity: Optional[str] = Field(None, description="Commodity context")
    mode: Optional[str] = Field("reasoning", description="Response mode")

class NewsRequest(BaseModel):
    max_articles: Optional[int] = Field(20, ge=1, le=50, description="Maximum number of articles to return")
    sources: Optional[List[str]] = Field(None, description="Specific news sources to fetch from")
    commodity_filter: Optional[str] = Field(None, description="Filter for specific commodity")
    hours_back: Optional[int] = Field(24, ge=1, le=168, description="Hours back to fetch news from")
    enhanced_content: Optional[bool] = Field(False, description="Enable full HTML content extraction and NLTK summarization")
    max_enhanced: Optional[int] = Field(3, ge=1, le=10, description="Maximum number of articles to enhance with full content")
    alert_frequency: Optional[str] = Field("realtime", description="Alert frequency preference (realtime, daily, weekly)")
    min_impact: Optional[str] = Field("LOW", description="Minimum impact level for alerts (LOW, MEDIUM, HIGH)")

class UserNewsRequest(BaseModel):
    user_id: str = Field(..., description="User ID in Supabase")
    max_articles: Optional[int] = Field(20, ge=1, le=50)
    enhanced_content: Optional[bool] = Field(False)
    max_enhanced: Optional[int] = Field(3, ge=1, le=10)

class ComprehensiveAnalysisRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to analyze")
    commodity: Optional[str] = Field(None, description="Specific commodity context")
    include_preprocessing: bool = Field(True, description="Include preprocessing with trigger keywords")
    include_finbert: bool = Field(True, description="Include FinBERT sentiment analysis")

# Root endpoint
@app.get('/')
def read_root():
    return {
        "message": "Integra Markets AI Backend (Simplified NLP)",
        "version": "2.1.0",
        "features": {
            "nltk": NLTK_AVAILABLE,
            "vader": vader_analyzer is not None,
            "supabase": bool(supabase),
            "groq_ai": groq_service is not None,
            "article_summarizer": article_summarizer is not None
        },
        "endpoints": [
            "/health",
            "/api/sentiment",
            "/api/sentiment/market",
            "/api/sentiment/movers", 
            "/api/news/analysis",
            "/api/news/feed",
            "/api/user/news",
            "/api/weather/alerts",
            "/api/models/status",
            "/api/summarize/article",
            "/ai/analyze",
            "/ai/chat",
            "/ai/report"
        ]
    }

# Health check
@app.get('/health')
def health_check():
    return {
        "status": "healthy",
        "supabase_connected": bool(supabase),
        "nltk_available": NLTK_AVAILABLE,
        "vader_available": vader_analyzer is not None,
        "timestamp": datetime.datetime.now().isoformat()
    }

# Models status
@app.get('/api/models/status')
def get_models_status():
    return {
        "nltk_available": NLTK_AVAILABLE,
        "vader_available": vader_analyzer is not None,
        "finbert_available": False,  # Not in this simplified version
        "groq_available": groq_service is not None,
        "models_loaded": vader_analyzer is not None or groq_service is not None
    }

# Enhanced sentiment analysis
@app.post('/api/sentiment')
async def analyze_sentiment(request: SentimentRequest):
    try:
        if vader_analyzer:
            # Use VADER for sentiment analysis
            scores = vader_analyzer.polarity_scores(request.text)
            
            # Determine overall sentiment
            compound = scores['compound']
            if compound >= 0.05:
                sentiment = "BULLISH"
                confidence = 0.5 + (compound * 0.5)
            elif compound <= -0.05:
                sentiment = "BEARISH" 
                confidence = 0.5 + (abs(compound) * 0.5)
            else:
                sentiment = "NEUTRAL"
                confidence = 0.5 + (abs(compound) * 2)
            
            # Add commodity-specific context if provided
            if request.commodity:
                # Adjust sentiment based on commodity keywords
                commodity_keywords = {
                    "oil": ["production", "opec", "barrel", "crude", "petroleum"],
                    "gold": ["mining", "precious", "metal", "bullion", "reserve"],
                    "wheat": ["harvest", "grain", "crop", "yield", "agriculture"],
                    "gas": ["natural gas", "lng", "pipeline", "energy", "heating"]
                }
                
                text_lower = request.text.lower()
                if request.commodity.lower() in commodity_keywords:
                    keywords = commodity_keywords[request.commodity.lower()]
                    keyword_count = sum(1 for kw in keywords if kw in text_lower)
                    if keyword_count > 0:
                        confidence = min(0.95, confidence + (keyword_count * 0.05))
            
            return {
                "text": request.text,
                "sentiment": sentiment,
                "confidence": round(confidence, 3),
                "method": "vader",
                "commodity_specific": request.commodity is not None,
                "scores": {
                    "compound": round(scores['compound'], 3),
                    "positive": round(scores['pos'], 3),
                    "negative": round(scores['neg'], 3),
                    "neutral": round(scores['neu'], 3)
                }
            }
        else:
            # Fallback to basic analysis
            return basic_sentiment_analysis(request.text, request.commodity)
            
    except Exception as e:
        logger.error(f"Sentiment analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Market sentiment endpoint
@app.get('/api/sentiment/market')
async def get_market_sentiment():
    try:
        # Aggregate market sentiment (in production, this would use real data)
        commodities_sentiment = [
            {"name": "OIL", "sentiment": "BULLISH", "change": 2.5, "confidence": 0.75},
            {"name": "NAT GAS", "sentiment": "BEARISH", "change": -1.8, "confidence": 0.68},
            {"name": "WHEAT", "sentiment": "NEUTRAL", "change": 0.3, "confidence": 0.52},
            {"name": "GOLD", "sentiment": "BULLISH", "change": 1.2, "confidence": 0.71},
            {"name": "CORN", "sentiment": "NEUTRAL", "change": -0.5, "confidence": 0.55},
            {"name": "COPPER", "sentiment": "BEARISH", "change": -2.1, "confidence": 0.69}
        ]
        
        # Calculate overall market sentiment
        bullish_count = sum(1 for c in commodities_sentiment if c["sentiment"] == "BULLISH")
        bearish_count = sum(1 for c in commodities_sentiment if c["sentiment"] == "BEARISH")
        
        if bullish_count > bearish_count:
            overall = "BULLISH"
            confidence = 0.65 + (bullish_count - bearish_count) * 0.05
        elif bearish_count > bullish_count:
            overall = "BEARISH"
            confidence = 0.65 + (bearish_count - bullish_count) * 0.05
        else:
            overall = "NEUTRAL"
            confidence = 0.50
        
        return {
            "overall": overall,
            "confidence": round(confidence, 2),
            "timestamp": datetime.datetime.now().isoformat(),
            "commodities": commodities_sentiment,
            "analysis_method": "vader" if vader_analyzer else "basic"
        }
    except Exception as e:
        logger.error(f"Market sentiment error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Top movers endpoint
@app.get('/api/sentiment/movers')
async def get_top_movers():
    return [
        {"symbol": "OIL", "sentiment": 0.75, "trend": "bullish", "volume": "high", "change_24h": 2.5},
        {"symbol": "WHEAT", "sentiment": -0.45, "trend": "bearish", "volume": "medium", "change_24h": -1.2},
        {"symbol": "GOLD", "sentiment": 0.60, "trend": "bullish", "volume": "high", "change_24h": 1.8},
        {"symbol": "NAT GAS", "sentiment": -0.55, "trend": "bearish", "volume": "low", "change_24h": -2.1}
    ]

# News analysis endpoint
@app.post('/api/news/analysis')
async def analyze_news(request: NewsAnalysisRequest):
    try:
        # Analyze news using available sentiment analyzer
        sentiment_result = await analyze_sentiment(
            SentimentRequest(text=request.text, enhanced=True)
        )
        
        # Extract key information
        keywords = extract_keywords(request.text)
        market_impact = determine_market_impact(sentiment_result["sentiment"], sentiment_result["confidence"])
        
        return {
            "text": request.text,
            "source": request.source,
            "sentiment": sentiment_result["sentiment"],
            "confidence": sentiment_result["confidence"],
            "keywords": keywords,
            "market_impact": market_impact,
            "timestamp": datetime.datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"News analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Weather alerts endpoint  
@app.get('/api/weather/alerts')
async def get_weather_alerts():
    # Sample weather alerts
    return {
        "alerts": [
            {
                "id": "1",
                "type": "drought",
                "severity": "moderate",
                "region": "Midwest US",
                "impact": "Potential wheat and corn yield reduction",
                "commodities_affected": ["WHEAT", "CORN"],
                "confidence": 0.78,
                "timestamp": datetime.datetime.now().isoformat()
            },
            {
                "id": "2", 
                "type": "frost",
                "severity": "low",
                "region": "Brazil",
                "impact": "Minor risk to coffee production",
                "commodities_affected": ["COFFEE"],
                "confidence": 0.65,
                "timestamp": datetime.datetime.now().isoformat()
            }
        ],
        "last_updated": datetime.datetime.now().isoformat()
    }

# News feed endpoint - fetches real news from multiple sources
@app.post('/api/news/feed')
async def get_news_feed(request: NewsRequest):
    """Fetch real news articles from multiple financial sources"""
    try:
        if not NEWS_SOURCES_AVAILABLE:
            logger.warning("News sources not available, returning mock data")
            return get_mock_news_data(request.max_articles)
        
        # Fetch news from real sources with optional content enhancement
        all_articles = []
        
        # Initialize NewsDataSources with enhanced content options
        enable_enhancement = request.enhanced_content or False
        async with NewsDataSources(
            enable_full_content=enable_enhancement,
            enable_nltk_summary=enable_enhancement
        ) as news_sources:
            # Fetch from different sources in parallel
            import asyncio
            
            tasks = []
            if not request.sources or 'reuters' in (request.sources or []):
                tasks.append(news_sources.fetch_reuters_commodities())
            if not request.sources or 'yahoo' in (request.sources or []):
                tasks.append(news_sources.fetch_yahoo_finance_commodities())
            if not request.sources or 'eia' in (request.sources or []):
                tasks.append(news_sources.fetch_eia_reports())
            if not request.sources or 'iea' in (request.sources or []):
                tasks.append(news_sources.fetch_iea_news())
            if not request.sources or 'bloomberg' in (request.sources or []):
                tasks.append(news_sources.fetch_bloomberg_commodities())
            if not request.sources or 'oilprice' in (request.sources or []):
                tasks.append(news_sources.fetch_oilprice_news())
            
            # Execute all fetching tasks concurrently
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Combine results and filter out exceptions
            for result in results:
                if isinstance(result, list):
                    all_articles.extend(result)
                elif isinstance(result, Exception):
                    logger.error(f"Error fetching news: {result}")
        
        # Determine time window based on alert frequency
        hours_back = request.hours_back or {
            'realtime': 4,  # Last 4 hours for realtime
            'daily': 24,    # Last 24 hours for daily
            'weekly': 168   # Last week for weekly
        }.get(request.alert_frequency, 24)
        
        # Filter articles by date
        cutoff_time = datetime.datetime.now() - datetime.timedelta(hours=request.hours_back)
        time_filtered_articles = []
        for article in all_articles:
            try:
                # Parse the published date
                published_str = article.get('published', '')
                if published_str:
                    # Handle both datetime objects and strings
                    if isinstance(published_str, datetime.datetime):
                        published_date = published_str
                    else:
                        published_date = datetime.datetime.fromisoformat(published_str.replace('Z', '+00:00'))
                    
                    # Only include articles within the time window
                    if published_date >= cutoff_time:
                        time_filtered_articles.append(article)
                    else:
                        logger.debug(f"Filtering out old article: {article.get('title', '')[:50]} from {published_str}")
            except Exception as e:
                # If date parsing fails, include the article (better to show than hide)
                logger.warning(f"Could not parse date for article: {e}")
                time_filtered_articles.append(article)
        
        all_articles = time_filtered_articles
        logger.info(f"After time filtering ({request.hours_back}h): {len(all_articles)} articles remain")
        
        # If we have too few articles, progressively expand the time window
        min_articles = 5  # Minimum articles we want to show
        if len(all_articles) < min_articles:
            logger.info(f"Only {len(all_articles)} articles found in {request.hours_back}h window, expanding search...")
            
            # Try expanding to 24 hours, then 48 hours
            for expanded_hours in [24, 48]:
                if expanded_hours <= request.hours_back:
                    continue  # Skip if we're already searching this far back
                
                expanded_cutoff = datetime.datetime.now() - datetime.timedelta(hours=expanded_hours)
                expanded_articles = []
                
                for article in results[0] if isinstance(results[0], list) else []:
                    try:
                        published_str = article.get('published', '')
                        if published_str:
                            if isinstance(published_str, datetime.datetime):
                                published_date = published_str
                            else:
                                published_date = datetime.datetime.fromisoformat(published_str.replace('Z', '+00:00'))
                            
                            if published_date >= expanded_cutoff:
                                # Check if not already in our list
                                if not any(a.get('title') == article.get('title') for a in all_articles):
                                    expanded_articles.append(article)
                    except:
                        pass
                
                all_articles.extend(expanded_articles)
                logger.info(f"Expanded to {expanded_hours}h: now have {len(all_articles)} articles")
                
                if len(all_articles) >= min_articles:
                    break
        
        # Filter articles by commodity if specified
        if request.commodity_filter:
            commodity_filter = request.commodity_filter.lower()
            filtered_articles = []
            for article in all_articles:
                title_lower = article.get('title', '').lower()
                summary_lower = article.get('summary', '').lower()
                if commodity_filter in title_lower or commodity_filter in summary_lower:
                    filtered_articles.append(article)
            all_articles = filtered_articles
        
        # Filter by impact level if specified
        if request.min_impact:
            impact_levels = {'LOW': 0, 'MEDIUM': 1, 'HIGH': 2}
            min_impact_level = impact_levels.get(request.min_impact.upper(), 0)
            
            impact_filtered = []
            for article in all_articles:
                article_impact = article.get('market_impact', 'LOW').upper()
                if impact_levels.get(article_impact, 0) >= min_impact_level:
                    impact_filtered.append(article)
            all_articles = impact_filtered
            logger.info(f"After impact filtering (min={request.min_impact}): {len(all_articles)} articles remain")
        
        # Sort by priority and date
        def article_priority(article):
            # High impact, recent articles get highest priority
            impact_score = {
                'HIGH': 3,
                'MEDIUM': 2,
                'LOW': 1
            }.get(article.get('market_impact', 'LOW').upper(), 0)
            
            published = article.get('published', '')
            if not published:
                return (0, 0)  # Lowest priority for articles without dates
            
            if isinstance(published, str):
                try:
                    published = datetime.datetime.fromisoformat(published.replace('Z', '+00:00'))
                except:
                    return (0, 0)
            
            # Convert to timestamp for sorting
            date_score = published.timestamp()
            
            return (impact_score, date_score)
        
        all_articles.sort(key=article_priority, reverse=True)
        
        # Limit to requested number of articles
        articles = all_articles[:request.max_articles]
        
        # Enhance articles with full content and NLTK summaries if requested
        if request.enhanced_content and NEWS_SOURCES_AVAILABLE:
            try:
                async with NewsDataSources(
                    enable_full_content=True,
                    enable_nltk_summary=True
                ) as content_sources:
                    articles = await content_sources.enhance_articles_with_full_content(
                        articles,
                        commodity_focus=request.commodity_filter,
                        max_enhance=request.max_enhanced or 3
                    )
                logger.info(f"Enhanced {sum(1 for a in articles if a.get('enhanced', False))} articles with full content")
            except Exception as e:
                logger.error(f"Error enhancing articles with full content: {e}")
        
        # Add sentiment analysis to each article
        enhanced_articles = []
        for article in articles:
            try:
                # Use enhanced summary if available, otherwise use original title + summary
                if article.get('enhanced') and article.get('summary'):
                    # For enhanced articles, use the NLTK-generated summary
                    text_for_analysis = f"{article.get('title', '')}. {article.get('summary', '')}"
                    logger.debug(f"Using enhanced summary for sentiment analysis: {article.get('title', '')[:50]}...")
                else:
                    # For regular articles, combine title and summary
                    text_for_analysis = f"{article.get('title', '')}. {article.get('summary', '')}"
                
                if vader_analyzer:
                    scores = vader_analyzer.polarity_scores(text_for_analysis)
                    compound = scores['compound']
                    
                    if compound >= 0.05:
                        sentiment = "BULLISH"
                        confidence = 0.5 + (compound * 0.5)
                    elif compound <= -0.05:
                        sentiment = "BEARISH"
                        confidence = 0.5 + (abs(compound) * 0.5)
                    else:
                        sentiment = "NEUTRAL"
                        confidence = 0.5
                else:
                    # Fallback sentiment analysis
                    basic_result = basic_sentiment_analysis(text_for_analysis)
                    sentiment = basic_result['sentiment']
                    confidence = basic_result['confidence']
                
                # Enhance article with sentiment data
                enhanced_article = {
                    'id': len(enhanced_articles) + 1,
                    'title': article.get('title', ''),
                    'summary': article.get('summary', ''),
                    'source': article.get('source', ''),
                    'source_url': article.get('url', ''),
                    'time_published': article.get('published', datetime.datetime.now().isoformat()),
                    'sentiment': sentiment,
                    'sentiment_score': round(confidence, 2),
                    'categories': [article.get('category', 'general')],
                    'tickers': extract_commodity_tickers(text_for_analysis),
                    'keywords': extract_keywords(text_for_analysis),
                    # Include enhanced content fields if available
                    'enhanced': article.get('enhanced', False),
                    'word_count': article.get('word_count'),
                    'enhancement_method': article.get('enhancement_method')
                }
                
                # Remove None values from enhanced_article
                enhanced_article = {k: v for k, v in enhanced_article.items() if v is not None}
                enhanced_articles.append(enhanced_article)
                
            except Exception as e:
                logger.error(f"Error processing article: {e}")
                # Add article without sentiment if processing fails
                enhanced_article = {
                    'id': len(enhanced_articles) + 1,
                    'title': article.get('title', ''),
                    'summary': article.get('summary', ''),
                    'source': article.get('source', ''),
                    'source_url': article.get('url', ''),
                    'time_published': article.get('published', datetime.datetime.now().isoformat()),
                    'sentiment': 'NEUTRAL',
                    'sentiment_score': 0.5,
                    'categories': [article.get('category', 'general')],
                    'tickers': [],
                    'keywords': []
                }
                enhanced_articles.append(enhanced_article)
        
        logger.info(f"Fetched and processed {len(enhanced_articles)} news articles")
        
        # Calculate enhancement statistics
        enhanced_count = sum(1 for article in enhanced_articles if article.get('enhanced', False))
        
        return {
            'status': 'success',
            'articles': enhanced_articles,
            'total_fetched': len(all_articles),
            'sources_used': list(set(article.get('source') for article in all_articles if article.get('source'))),
            'timestamp': datetime.datetime.now().isoformat(),
            'analysis_method': 'vader' if vader_analyzer else 'basic',
            'content_enhanced': request.enhanced_content or False,
            'enhanced_articles_count': enhanced_count,
            'enhancement_method': 'nltk_summarization' if request.enhanced_content else None
        }
    
    except Exception as e:
        logger.error(f"News feed error: {e}")
        # Return mock data as fallback
        return get_mock_news_data(request.max_articles)

# New: User-specific news via Supabase preferences
@app.post('/api/user/news')
async def get_user_news(request: UserNewsRequest):
    """Fetch personalized news based on user's saved preferences in Supabase"""
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        # Load user preferences
        res = supabase.table('user_preferences').select('*').eq('user_id', request.user_id).single().execute()
        if not getattr(res, 'data', None):
            raise HTTPException(status_code=404, detail="User preferences not found")
        prefs = res.data

        # Normalize sources to match our fetchers
        source_map = {
            'yahoo_finance': 'yahoo',
            'yahoo': 'yahoo',
            'reuters': 'reuters',
            'bloomberg': 'bloomberg',
            'eia': 'eia',
            'iea': 'iea',
            'marketwatch': 'marketwatch',
            'sp_global': 'sp_global',
            'cnbc': 'cnbc',
        }
        pref_sources = prefs.get('sources') or []
        normalized_sources = [source_map.get(s.lower().replace(' ', '_'), s.lower()) for s in pref_sources]
        normalized_sources = list({s for s in normalized_sources if s}) or None

        # Choose a commodity filter if user has a primary commodity
        commodities = prefs.get('commodities') or []
        commodity_filter = None
        if isinstance(commodities, list) and len(commodities) == 1:
            commodity_filter = commodities[0]

        # Handle custom website URLs if provided
        website_urls = prefs.get('websiteURLs') or []
        keywords = prefs.get('keywords') or []
        
        # If user has custom websites and user_news_service is available, use it
        if website_urls and USER_NEWS_AVAILABLE and user_news_service:
            # Use the advanced user news service that handles custom URLs
            result = await user_news_service.get_user_based_news(prefs)
            result['enhanced_content'] = request.enhanced_content or False
            return result
        
        # Otherwise use the standard news feed pipeline
        news_req = NewsRequest(
            max_articles=request.max_articles or 20,
            sources=normalized_sources,
            commodity_filter=commodity_filter,
            hours_back=24,
            enhanced_content=request.enhanced_content or False,
            max_enhanced=request.max_enhanced or 3
        )
        result = await get_news_feed(news_req)

        # Add user context to the result
        result['user_preferences'] = {
            'commodities': commodities,
            'sources': pref_sources,
            'regions': prefs.get('regions') or [],
            'keywords': keywords,
            'websiteURLs': website_urls,
            'alert_threshold': prefs.get('alertThreshold', 'medium')
        }
        result['status'] = result.get('status', 'success')
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"User news error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Comprehensive analysis endpoint with preprocessing
@app.post('/api/comprehensive-analysis')
async def comprehensive_analysis(request: ComprehensiveAnalysisRequest):
    """Perform comprehensive analysis with preprocessing and trigger keywords"""
    try:
        result = {
            "text": request.text,
            "commodity": request.commodity,
            "timestamp": datetime.datetime.now().isoformat()
        }
        
        # Preprocessing: Extract trigger keywords with relevance scores
        if request.include_preprocessing:
            trigger_keywords = extract_trigger_keywords_with_relevance(request.text, request.commodity)
            
            # Format for frontend compatibility
            result["preprocessing"] = {
                "trigger_keywords": trigger_keywords,
                "commodity": request.commodity,
                "event_type": "market_movement",  # Could be enhanced with classification
                "market_impact": "medium"  # Could be enhanced with impact analysis
            }
        
        # Sentiment Analysis
        sentiment_req = SentimentRequest(
            text=request.text,
            commodity=request.commodity,
            enhanced=request.include_finbert
        )
        sentiment_result = await analyze_sentiment(sentiment_req)
        
        # Structure the sentiment analysis for frontend
        result["sentiment_analysis"] = {
            "sentiment": sentiment_result["sentiment"],
            "confidence": sentiment_result["confidence"],
            "details": {
                "method": sentiment_result.get("method", "basic"),
                "commodity_specific": sentiment_result.get("commodity_specific", False)
            }
        }
        
        # Add FinBERT-style probabilities if using enhanced analysis
        if request.include_finbert:
            # Convert single sentiment to probability distribution
            if sentiment_result["sentiment"] == "BULLISH":
                probabilities = {
                    "positive": sentiment_result["confidence"],
                    "negative": (1 - sentiment_result["confidence"]) * 0.3,
                    "neutral": (1 - sentiment_result["confidence"]) * 0.7
                }
            elif sentiment_result["sentiment"] == "BEARISH":
                probabilities = {
                    "positive": (1 - sentiment_result["confidence"]) * 0.3,
                    "negative": sentiment_result["confidence"],
                    "neutral": (1 - sentiment_result["confidence"]) * 0.7
                }
            else:  # NEUTRAL
                probabilities = {
                    "positive": (1 - sentiment_result["confidence"]) * 0.5,
                    "negative": (1 - sentiment_result["confidence"]) * 0.5,
                    "neutral": sentiment_result["confidence"]
                }
            
            result["sentiment_analysis"]["details"]["finbert"] = {
                "sentiment": sentiment_result["sentiment"],
                "probabilities": probabilities
            }
        
        # Add VADER analysis if available
        if vader_analyzer:
            scores = vader_analyzer.polarity_scores(request.text)
            result["sentiment_analysis"]["details"]["vader"] = {
                "compound": scores['compound'],
                "positive": scores['pos'],
                "negative": scores['neg'],
                "neutral": scores['neu']
            }
        
        # Calculate market impact based on sentiment and keywords
        if request.include_preprocessing and trigger_keywords:
            # High impact if we have high-relevance keywords and strong sentiment
            max_relevance = max(kw['relevance'] for kw in trigger_keywords)
            if max_relevance > 0.8 and sentiment_result["confidence"] > 0.7:
                market_impact = "HIGH"
            elif max_relevance > 0.6 or sentiment_result["confidence"] > 0.6:
                market_impact = "MEDIUM"
            else:
                market_impact = "LOW"
            
            result["sentiment_analysis"]["market_impact"] = market_impact
            result["sentiment_analysis"]["confidence"] = sentiment_result["confidence"]
        
        # Add trading intelligence (simplified recommendations)
        trading_intelligence = {
            "risk_level": "Medium",
            "time_horizon": "Short-term",
            "recommendations": []
        }
        
        if sentiment_result["sentiment"] == "BULLISH":
            trading_intelligence["recommendations"] = [
                "Consider long positions on momentum confirmation",
                "Watch for resistance levels",
                "Set stop-loss orders to manage risk"
            ]
        elif sentiment_result["sentiment"] == "BEARISH":
            trading_intelligence["recommendations"] = [
                "Consider defensive positioning",
                "Look for support levels",
                "Monitor for oversold conditions"
            ]
        else:
            trading_intelligence["recommendations"] = [
                "Wait for clearer directional signals",
                "Consider range-trading strategies",
                "Monitor for breakout opportunities"
            ]
        
        result["trading_intelligence"] = trading_intelligence
        
        # Add the complete analysis object for compatibility
        result["analysis"] = result["sentiment_analysis"]
        
        return result
        
    except Exception as e:
        logger.error(f"Comprehensive analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Legacy endpoint for backward compatibility
@app.post('/analyze-sentiment')
async def analyze_sentiment_legacy(request: SentimentRequest):
    result = await analyze_sentiment(request)
    return {
        "text": request.text,
        "sentiment": result["sentiment"].lower(),
        "confidence": result["confidence"],
        "timestamp": datetime.datetime.now().isoformat()
    }

# Helper functions
def basic_sentiment_analysis(text: str, commodity: Optional[str] = None) -> dict:
    """Basic keyword-based sentiment analysis"""
    positive_words = ['surge', 'gain', 'profit', 'growth', 'increase', 'rise', 'boom', 'rally', 'strong', 'high']
    negative_words = ['fall', 'drop', 'loss', 'decline', 'decrease', 'crash', 'plunge', 'cut', 'weak', 'low']
    
    text_lower = text.lower()
    positive_count = sum(1 for word in positive_words if word in text_lower)
    negative_count = sum(1 for word in negative_words if word in text_lower)
    
    if positive_count > negative_count:
        sentiment = "BULLISH"
        confidence = min(0.85, 0.6 + (positive_count * 0.08))
    elif negative_count > positive_count:
        sentiment = "BEARISH"
        confidence = min(0.85, 0.6 + (negative_count * 0.08))
    else:
        sentiment = "NEUTRAL"
        confidence = 0.5
    
    return {
        "sentiment": sentiment,
        "confidence": round(confidence, 3),
        "method": "basic_keyword",
        "commodity_specific": commodity is not None
    }

def extract_keywords(text: str) -> List[str]:
    """Extract relevant keywords from text"""
    # Common commodity and market keywords
    keywords = []
    commodity_terms = ["oil", "gas", "wheat", "corn", "gold", "silver", "copper", "coffee", "sugar"]
    market_terms = ["price", "production", "supply", "demand", "forecast", "harvest", "export", "import"]
    
    text_lower = text.lower()
    for term in commodity_terms + market_terms:
        if term in text_lower:
            keywords.append(term)
    
    return keywords[:5]  # Return top 5 keywords

def extract_trigger_keywords_with_relevance(text: str, commodity: Optional[str] = None) -> List[Dict[str, Any]]:
    """Extract trigger keywords with relevance scores for comprehensive analysis"""
    import re
    from collections import Counter
    
    text_lower = text.lower()
    trigger_keywords = []
    
    # Define keyword categories with base relevance scores
    keyword_patterns = {
        # High relevance (0.8-1.0) - Direct market movers
        'high': {
            'patterns': [
                (r'opec\+?\s*(decision|meeting|cut|increase)', 'OPEC decision'),
                (r'(production|output)\s+(cut|reduction|increase|boost)', 'production change'),
                (r'(supply|demand)\s+(shortage|surplus|disruption|shock)', 'supply/demand shock'),
                (r'(price|prices)\s+(surge|plunge|spike|crash)', 'price movement'),
                (r'sanctions?\s+(imposed|lifted|announced)', 'sanctions'),
                (r'(hurricane|storm|drought|flood)\s+(threat|damage|impact)', 'weather event'),
                (r'(inventory|stockpile)\s+(draw|build|change)', 'inventory change'),
                (r'fed\s+(rate|decision|meeting|hike|cut)', 'Fed policy'),
                (r'(war|conflict|tension)\s+(escalate|easing|risk)', 'geopolitical'),
            ],
            'base_relevance': 0.85
        },
        # Medium relevance (0.5-0.8) - Important indicators
        'medium': {
            'patterns': [
                (r'(export|import)\s+(ban|restriction|increase)', 'trade policy'),
                (r'(bullish|bearish)\s+(sentiment|outlook|trend)', 'market sentiment'),
                (r'technical\s+(support|resistance|breakout)', 'technical analysis'),
                (r'(harvest|planting)\s+(season|forecast|delay)', 'agricultural cycle'),
                (r'(refinery|pipeline)\s+(outage|maintenance|restart)', 'infrastructure'),
                (r'economic\s+(growth|recession|slowdown)', 'economic indicator'),
                (r'(futures|options)\s+(trading|volume|position)', 'derivatives market'),
            ],
            'base_relevance': 0.65
        },
        # Low relevance (0.3-0.5) - Context indicators
        'low': {
            'patterns': [
                (r'analyst\s+(forecast|prediction|estimate)', 'analyst view'),
                (r'market\s+(open|close|trading)', 'market status'),
                (r'year\s+(high|low|average)', 'price level'),
                (r'seasonal\s+(pattern|trend|demand)', 'seasonality'),
            ],
            'base_relevance': 0.45
        }
    }
    
    # Extract keywords based on patterns
    found_keywords = set()  # Track to avoid duplicates
    
    for priority, config in keyword_patterns.items():
        for pattern, keyword_phrase in config['patterns']:
            matches = re.finditer(pattern, text_lower)
            for match in matches:
                matched_text = match.group(0)
                
                # Skip if we already have this keyword
                if keyword_phrase in found_keywords:
                    continue
                    
                found_keywords.add(keyword_phrase)
                
                # Calculate relevance based on factors
                relevance = config['base_relevance']
                
                # Boost relevance if commodity-specific
                if commodity and commodity.lower() in matched_text:
                    relevance += 0.1
                
                # Boost if appears in first 100 characters (likely headline)
                if match.start() < 100:
                    relevance += 0.05
                
                # Boost if appears multiple times
                count = len(re.findall(pattern, text_lower))
                if count > 1:
                    relevance += min(0.1, count * 0.03)
                
                # Cap at 1.0
                relevance = min(1.0, relevance)
                
                trigger_keywords.append({
                    'keyword': keyword_phrase,
                    'relevance': round(relevance, 2),
                    'matched_text': matched_text,
                    'category': priority
                })
    
    # Also extract standalone important terms
    important_terms = [
        ('surge', 0.7), ('plunge', 0.7), ('spike', 0.7), ('crash', 0.75),
        ('rally', 0.65), ('selloff', 0.65), ('breakout', 0.6),
        ('disruption', 0.8), ('shortage', 0.8), ('surplus', 0.75),
        ('sanctions', 0.85), ('embargo', 0.85), ('blockade', 0.8),
        ('OPEC', 0.8), ('Fed', 0.75), ('ECB', 0.7),
        ('inflation', 0.7), ('recession', 0.75), ('recovery', 0.65),
    ]
    
    for term, base_relevance in important_terms:
        if term.lower() in text_lower and term not in found_keywords:
            # Find context around the term
            index = text_lower.find(term.lower())
            start = max(0, index - 20)
            end = min(len(text), index + len(term) + 20)
            context = text[start:end].strip()
            
            # Extract 2-3 word phrase around the term
            words = context.split()
            term_index = next((i for i, w in enumerate(words) if term.lower() in w.lower()), None)
            
            if term_index is not None:
                # Get surrounding words
                phrase_start = max(0, term_index - 1)
                phrase_end = min(len(words), term_index + 2)
                keyword_phrase = ' '.join(words[phrase_start:phrase_end])
                
                # Clean up the phrase
                keyword_phrase = re.sub(r'[.,;!?]', '', keyword_phrase).strip()
                
                if keyword_phrase and keyword_phrase not in found_keywords:
                    found_keywords.add(keyword_phrase)
                    trigger_keywords.append({
                        'keyword': keyword_phrase,
                        'relevance': base_relevance,
                        'matched_text': context,
                        'category': 'extracted'
                    })
    
    # Sort by relevance and return top keywords
    trigger_keywords.sort(key=lambda x: x['relevance'], reverse=True)
    
    # Return top 10 keywords, but ensure we have at least 3
    result = trigger_keywords[:10]
    
    # If we have fewer than 3 keywords, add some basic ones
    if len(result) < 3:
        basic_keywords = extract_keywords(text)
        for kw in basic_keywords:
            if len(result) >= 10:
                break
            if kw not in [k['keyword'] for k in result]:
                result.append({
                    'keyword': kw,
                    'relevance': 0.4,
                    'category': 'basic'
                })
    
    return result

def determine_market_impact(sentiment: str, confidence: float) -> str:
    """Determine market impact based on sentiment and confidence"""
    if confidence >= 0.8:
        if sentiment == "BULLISH":
            return "strong_positive"
        elif sentiment == "BEARISH":
            return "strong_negative"
    elif confidence >= 0.6:
        if sentiment == "BULLISH":
            return "moderate_positive"
        elif sentiment == "BEARISH":
            return "moderate_negative"
    
    return "neutral"

def extract_commodity_tickers(text: str) -> List[str]:
    """Extract commodity tickers from text"""
    tickers = []
    text_lower = text.lower()
    
    # Map commodities to tickers
    commodity_map = {
        'oil': ['WTI', 'BRENT'],
        'crude': ['WTI', 'BRENT'],
        'petroleum': ['WTI'],
        'gas': ['NAT GAS'],
        'natural gas': ['NAT GAS'],
        'gold': ['GOLD'],
        'silver': ['SILVER'],
        'copper': ['COPPER'],
        'wheat': ['WHEAT'],
        'corn': ['CORN'],
        'coffee': ['COFFEE'],
        'sugar': ['SUGAR']
    }
    
    for commodity, ticker_list in commodity_map.items():
        if commodity in text_lower:
            tickers.extend(ticker_list)
    
    return list(set(tickers))  # Remove duplicates

async def get_live_news_data(max_articles: int = 20) -> dict:
    """Fetch live news data from RSS feeds with fallback"""
    try:
        if not NEWS_SOURCES_AVAILABLE:
            logger.error("News sources module not available - check data_sources.py import")
            raise ImportError("NewsDataSources not available")
        
        # Fetch live news from RSS feeds
        async with NewsDataSources() as news_sources:
            all_articles = await news_sources.fetch_all_sources()
            
            # Limit to requested number and add required fields
            articles = []
            for i, article in enumerate(all_articles[:max_articles]):
                # Ensure all required fields are present
                processed_article = {
                    'id': i + 1,
                    'title': article.get('title', 'No Title'),
                    'summary': article.get('summary', ''),
                    'source': article.get('source', 'Unknown'),
                    'source_url': article.get('url', ''),
                    'time_published': article.get('published', datetime.datetime.now().isoformat()),
                    'sentiment': 'NEUTRAL',  # Will be analyzed separately
                    'sentiment_score': 0.5,
                    'categories': [article.get('category', 'general')],
                    'tickers': [],  # Will be extracted from content
                    'keywords': []  # Will be extracted from content
                }
                articles.append(processed_article)
            
            return {
                'status': 'live',
                'articles': articles,
                'total_fetched': len(articles),
                'sources_used': list(set([a.get('source', 'Unknown') for a in all_articles])),
                'timestamp': datetime.datetime.now().isoformat(),
                'analysis_method': 'live_rss_feeds',
                'message': f'Fetched {len(articles)} live articles from RSS feeds'
            }
            
    except Exception as e:
        logger.error(f"Failed to fetch live news: {e}")
        # Minimal fallback with error message
        return {
            'status': 'error',
            'articles': [],
            'total_fetched': 0,
            'sources_used': [],
            'timestamp': datetime.datetime.now().isoformat(),
            'analysis_method': 'error_fallback',
            'message': f'Error fetching live news: {str(e)}',
            'error': str(e)
        }

# Article summarization endpoint
@app.post('/api/summarize/article')
async def summarize_article(request: ArticleSummarizeRequest):
    """Summarize a financial news article from URL"""
    if not SUMMARIZER_AVAILABLE or not article_summarizer:
        return {
            "error": "Article summarization not available",
            "url": request.url,
            "fallback": True,
            "message": "Please install sumy or newspaper3k for article summarization"
        }
    
    try:
        # Summarize the article
        if request.commodity:
            result = article_summarizer.summarize_commodity_news(request.url, request.commodity)
        else:
            result = article_summarizer.summarize_url(request.url, request.sentences)
        
        # Add sentiment analysis to summary
        if 'summary' in result and result['summary']:
            summary_text = ' '.join(result['summary'])
            sentiment_analysis = await analyze_sentiment(
                SentimentRequest(text=summary_text, commodity=request.commodity)
            )
            result['sentiment_analysis'] = {
                "overall": sentiment_analysis['sentiment'],
                "confidence": sentiment_analysis['confidence']
            }
        
        return result
        
    except Exception as e:
        logger.error(f"Article summarization error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Groq AI Analysis endpoint
@app.post('/ai/analyze')
async def ai_analyze(request: AIAnalysisRequest):
    """Perform AI analysis with reasoning and tools"""
    if not GROQ_AVAILABLE or not groq_service:
        # Fallback to basic sentiment analysis
        sentiment_result = await analyze_sentiment(
            SentimentRequest(text=request.query, commodity=request.commodity)
        )
        return {
            "query": request.query,
            "analysis": sentiment_result,
            "reasoning": "Using basic sentiment analysis (Groq AI not available)",
            "tool_results": []
        }
    
    try:
        result = await groq_service.analyze_with_reasoning(
            request.query,
            commodity=request.commodity,
            use_tools=request.use_tools,
            search_web=request.search_web
        )
        return result
    except Exception as e:
        logger.error(f"AI analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Groq AI Chat endpoint
@app.post('/ai/chat')
async def ai_chat(request: AIChatRequest):
    """Chat with AI using tool capabilities"""
    if not GROQ_AVAILABLE or not groq_service:
        return {
            "response": "I'm currently using basic analysis. Groq AI is not available.",
            "tool_results": [],
            "messages": request.messages
        }
    
    try:
        # Add commodity context if provided
        if request.commodity and request.messages:
            request.messages[0]["content"] += f" (Context: {request.commodity} commodity)"
        
        result = await groq_service.chat_with_tools(
            request.messages,
            available_tools=request.available_tools
        )
        return result
    except Exception as e:
        logger.error(f"AI chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Groq AI Market Report endpoint
@app.post('/ai/report')
async def generate_ai_report(
    commodities: List[str] = ["oil", "gold", "wheat"],
    include_predictions: bool = True,
    include_news: bool = True
):
    """Generate comprehensive AI market report"""
    if not GROQ_AVAILABLE or not groq_service:
        # Return basic report
        return {
            "generated_at": datetime.datetime.now().isoformat(),
            "commodities": {c: {"sentiment": "neutral", "confidence": 0.5} for c in commodities},
            "overview": "AI analysis not available. Using basic sentiment.",
            "insights": ["Limited analysis available without Groq AI"]
        }
    
    try:
        report = await groq_service.generate_market_report(
            commodities,
            include_predictions=include_predictions,
            include_news=include_news
        )
        return report
    except Exception as e:
        logger.error(f"AI report generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Test endpoint to verify news feed is working
@app.get('/api/test/news')
async def test_news_endpoint():
    """Test endpoint for news functionality"""
    return {
        "message": "News endpoint is working",
        "news_sources_available": NEWS_SOURCES_AVAILABLE,
        "endpoints_available": [
            "/api/news/feed (POST)",
            "/api/news/analysis (POST)",
            "/api/sentiment/market (GET)",
            "/api/sentiment/movers (GET)"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")

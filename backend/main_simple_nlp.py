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
import re
import base64
import hashlib
from urllib.parse import urlparse
from contextlib import asynccontextmanager
from uuid import uuid4

try:
    from cryptography.fernet import Fernet
    CONNECTOR_CRYPTO_AVAILABLE = True
except ImportError:
    CONNECTOR_CRYPTO_AVAILABLE = False

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

class OverallSentimentRequest(BaseModel):
    topic_text: str = Field(..., min_length=1, description="Market topic or question to score against recent headlines")
    commodity: Optional[str] = Field(None, description="Optional commodity override")
    max_headlines: int = Field(20, ge=5, le=50, description="Maximum recent headlines to include")
    refresh_if_empty: bool = Field(True, description="Fetch the latest feed if the recent-headlines cache is empty")
    event_url: Optional[str] = Field(None, description="Canonical Polymarket event URL for event-driven analysis")
    event_slug: Optional[str] = Field(None, description="Canonical Polymarket event slug")

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

class LexiconExplainRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to analyze with the commodity lexicon")
    commodity: Optional[str] = Field(None, description="Commodity context to force during analysis")
    include_rulebook: bool = Field(False, description="Include the underlying commodity rulebook in the response")

class DashboardSentimentEngineRequest(BaseModel):
    commodities: Optional[List[str]] = Field(None, description="Tracked commodities to include in the dashboard snapshot")
    max_headlines: int = Field(15, ge=5, le=50, description="Maximum headlines per commodity snapshot")
    refresh_if_empty: bool = Field(True, description="Fetch headlines if the dashboard cache is empty")

class ConnectorCredentialRequest(BaseModel):
    auth_type: str = Field("api_key", description="Credential mode: none, api_key, or bearer")
    api_key: Optional[str] = Field(None, description="User-provided API key or subscription token")
    bearer_token: Optional[str] = Field(None, description="User-provided bearer token")
    api_key_header: Optional[str] = Field("Authorization", description="Header name used when auth_type is api_key")
    persist_secret: bool = Field(True, description="Store the credential encrypted for future connector runs")

class PolymarketConnectorRequest(BaseModel):
    user_id: str = Field(..., description="Owning user ID")
    name: str = Field(..., min_length=1, description="User-visible connector name")
    source_mode: str = Field("tenant_private", description="shared, hybrid, or tenant_private")
    base_url: Optional[str] = Field("https://polymarket.com", description="Base endpoint or portal URL for the connector")
    event_url: Optional[str] = Field(None, description="Optional canonical Polymarket event URL")
    event_slug: Optional[str] = Field(None, description="Optional Polymarket event slug")
    website_urls: Optional[List[str]] = Field(default_factory=list, description="Optional user-owned source URLs")
    custom_headers: Optional[Dict[str, str]] = Field(default_factory=dict, description="Additional pass-through headers")
    use_personal_subscription: bool = Field(True, description="Whether this connector should use the user's own vendor credentials")
    bypass_shared_limits: bool = Field(True, description="Whether requests should avoid shared platform source pools")
    rate_limit_per_minute: Optional[int] = Field(None, ge=1, le=10000, description="Tenant-specific limit for this connector")
    cache_ttl_seconds: int = Field(60, ge=0, le=3600, description="Connector-local cache TTL")
    credentials: Optional[ConnectorCredentialRequest] = Field(None, description="Optional BYO credential payload")

class PolymarketConnectorValidationRequest(BaseModel):
    connector: PolymarketConnectorRequest

class PolymarketSentimentRequest(BaseModel):
    topic_text: str = Field(..., min_length=1, description="Market topic or question to score")
    user_id: Optional[str] = Field(None, description="Optional owning user ID when resolving a saved connector")
    connector_id: Optional[str] = Field(None, description="Optional saved Polymarket connector ID")
    event_url: Optional[str] = Field(None, description="Canonical Polymarket event URL")
    event_slug: Optional[str] = Field(None, description="Canonical Polymarket event slug")
    max_headlines: int = Field(20, ge=5, le=50, description="Maximum headlines to include")
    refresh_if_empty: bool = Field(True, description="Fetch headlines if cache is empty")
    credentials: Optional[ConnectorCredentialRequest] = Field(None, description="Optional one-off BYO credential without saving")

RECENT_NEWS_CACHE: Dict[str, Any] = {
    "timestamp": None,
    "articles": []
}

PREDICTION_MARKET_CONNECTORS_TABLE = "prediction_market_connectors"

COMMODITY_METADATA: Dict[str, Dict[str, Any]] = {
    "oil": {
        "display_name": "Oil",
        "category": "energy",
        "dashboard_symbol": "OIL",
        "aliases": ["oil", "crude", "crude oil", "wti", "brent"]
    },
    "gas": {
        "display_name": "Natural Gas",
        "category": "energy",
        "dashboard_symbol": "NAT GAS",
        "aliases": ["gas", "nat gas", "natural gas", "lng"]
    },
    "gold": {
        "display_name": "Gold",
        "category": "metals",
        "dashboard_symbol": "GOLD",
        "aliases": ["gold"]
    },
    "silver": {
        "display_name": "Silver",
        "category": "metals",
        "dashboard_symbol": "SILVER",
        "aliases": ["silver"]
    },
    "uranium": {
        "display_name": "Uranium",
        "category": "energy transition",
        "dashboard_symbol": "URANIUM",
        "aliases": ["uranium", "u3o8"]
    },
    "forex": {
        "display_name": "Forex",
        "category": "macro",
        "dashboard_symbol": "FOREX",
        "aliases": ["forex", "fx", "usd", "dollar", "eurusd", "usdjpy"]
    },
    "bitcoin": {
        "display_name": "Bitcoin",
        "category": "digital assets",
        "dashboard_symbol": "BTC",
        "aliases": ["bitcoin", "btc"]
    },
    "wheat": {
        "display_name": "Wheat",
        "category": "agriculture",
        "dashboard_symbol": "WHEAT",
        "aliases": ["wheat"]
    },
    "corn": {
        "display_name": "Corn",
        "category": "agriculture",
        "dashboard_symbol": "CORN",
        "aliases": ["corn"]
    },
    "macro": {
        "display_name": "Macro",
        "category": "macro",
        "dashboard_symbol": "MACRO",
        "aliases": ["macro"]
    },
    "weather": {
        "display_name": "Weather",
        "category": "weather",
        "dashboard_symbol": "WEATHER",
        "aliases": ["weather"]
    }
}

def get_connector_cipher() -> Optional["Fernet"]:
    secret = os.getenv("CONNECTOR_ENCRYPTION_KEY")
    if not secret or not CONNECTOR_CRYPTO_AVAILABLE:
        return None

    try:
        raw_key = secret.encode("utf-8")
        if len(raw_key) != 44:
            raw_key = base64.urlsafe_b64encode(hashlib.sha256(raw_key).digest())
        return Fernet(raw_key)
    except Exception as exc:
        logger.error(f"Connector encryption setup failed: {exc}")
        return None

def mask_secret(secret: Optional[str]) -> Optional[str]:
    if not secret:
        return None
    if len(secret) <= 8:
        return "*" * len(secret)
    return f"{secret[:4]}...{secret[-4:]}"

def serialize_connector_credentials(credentials: Optional[ConnectorCredentialRequest]) -> Dict[str, Any]:
    if not credentials:
        return {
            "auth_type": "none",
            "api_key_header": None,
            "has_secret": False,
            "masked_secret": None,
            "persisted": False
        }

    secret_value = credentials.api_key or credentials.bearer_token
    return {
        "auth_type": credentials.auth_type,
        "api_key_header": credentials.api_key_header,
        "has_secret": bool(secret_value),
        "masked_secret": mask_secret(secret_value),
        "persisted": bool(secret_value and credentials.persist_secret)
    }

def encrypt_connector_secret(secret: Optional[str]) -> Optional[str]:
    if not secret:
        return None

    cipher = get_connector_cipher()
    if not cipher:
        raise HTTPException(
            status_code=503,
            detail="Connector secret persistence requires CONNECTOR_ENCRYPTION_KEY and cryptography support"
        )

    return cipher.encrypt(secret.encode("utf-8")).decode("utf-8")

def normalize_polymarket_connector_payload(payload: PolymarketConnectorRequest, encrypt_secret: bool = True) -> Dict[str, Any]:
    canonical_slug = extract_polymarket_event_slug(payload.event_slug) or extract_polymarket_event_slug(payload.event_url)
    canonical_url = payload.event_url if is_official_polymarket_event_url(payload.event_url) else build_polymarket_event_url(canonical_slug)
    credentials_summary = serialize_connector_credentials(payload.credentials)
    secret_value = None
    if payload.credentials:
        secret_value = payload.credentials.api_key or payload.credentials.bearer_token

    return {
        "provider": "polymarket",
        "name": payload.name.strip(),
        "user_id": payload.user_id,
        "source_mode": payload.source_mode,
        "base_url": payload.base_url or "https://polymarket.com",
        "event_url": canonical_url,
        "event_slug": canonical_slug,
        "website_urls": payload.website_urls or [],
        "custom_headers": payload.custom_headers or {},
        "use_personal_subscription": payload.use_personal_subscription,
        "bypass_shared_limits": payload.bypass_shared_limits,
        "rate_limit_per_minute": payload.rate_limit_per_minute,
        "cache_ttl_seconds": payload.cache_ttl_seconds,
        "auth_type": credentials_summary["auth_type"],
        "api_key_header": credentials_summary["api_key_header"],
        "credential_mask": credentials_summary["masked_secret"],
        "credential_encrypted": (
            encrypt_connector_secret(secret_value)
            if encrypt_secret and secret_value and payload.credentials and payload.credentials.persist_secret
            else None
        ),
        "credential_persisted": credentials_summary["persisted"],
        "has_secret": credentials_summary["has_secret"],
        "auth_via_app": bool(secret_value),
        "vendor_auth_still_required": bool(secret_value),
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

def build_polymarket_connector_assessment(payload: Dict[str, Any]) -> Dict[str, Any]:
    warnings: List[str] = []
    if payload["has_secret"]:
        warnings.append("Vendor access is still authenticated by the user's own Polymarket or upstream subscription credential.")
    else:
        warnings.append("Public event metadata can work without a private credential, but private or premium endpoints require BYO credentials.")

    if not payload["credential_persisted"] and payload["has_secret"]:
        warnings.append("Credential was accepted only for the current request and will not be reused later.")

    return {
        "provider": "polymarket",
        "source_mode": payload["source_mode"],
        "app_manages_auth_replay": payload["has_secret"],
        "vendor_auth_still_required": payload["vendor_auth_still_required"],
        "bypass_shared_limits": payload["bypass_shared_limits"],
        "uses_personal_subscription": payload["use_personal_subscription"],
        "warnings": warnings
    }

def require_supabase() -> Client:
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase is not configured")
    return supabase

def serialize_saved_polymarket_connector(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": record.get("id"),
        "provider": record.get("provider", "polymarket"),
        "name": record.get("name"),
        "user_id": record.get("user_id"),
        "source_mode": record.get("source_mode", "tenant_private"),
        "base_url": record.get("base_url"),
        "event_url": record.get("event_url"),
        "event_slug": record.get("event_slug"),
        "website_urls": record.get("website_urls") or [],
        "custom_headers": record.get("custom_headers") or {},
        "use_personal_subscription": bool(record.get("use_personal_subscription")),
        "bypass_shared_limits": bool(record.get("bypass_shared_limits")),
        "rate_limit_per_minute": record.get("rate_limit_per_minute"),
        "cache_ttl_seconds": record.get("cache_ttl_seconds", 60),
        "auth": {
            "auth_type": record.get("auth_type", "none"),
            "api_key_header": record.get("api_key_header"),
            "has_secret": bool(record.get("has_secret")),
            "masked_secret": record.get("credential_mask"),
            "persisted": bool(record.get("credential_persisted"))
        },
        "authentication": {
            "validated_by_app": bool(record.get("has_secret")),
            "vendor_auth_still_required": bool(record.get("vendor_auth_still_required", record.get("has_secret"))),
            "app_manages_auth_replay": bool(record.get("auth_via_app")),
            "credential_status": "stored_encrypted" if record.get("credential_persisted") else "not_stored"
        },
        "created_at": record.get("created_at"),
        "updated_at": record.get("updated_at")
    }

def fetch_saved_polymarket_connector(connector_id: str, user_id: Optional[str] = None) -> Dict[str, Any]:
    db = require_supabase()
    query = db.table(PREDICTION_MARKET_CONNECTORS_TABLE).select("*").eq("id", connector_id).eq("provider", "polymarket")
    if user_id:
        query = query.eq("user_id", user_id)
    result = query.execute()
    if not getattr(result, "data", None):
        raise HTTPException(status_code=404, detail="Polymarket connector not found")
    return result.data[0]

def validate_connector_credentials(credentials: Optional[ConnectorCredentialRequest]) -> None:
    if not credentials:
        return

    auth_type = (credentials.auth_type or "none").lower()
    if auth_type not in {"none", "api_key", "bearer"}:
        raise HTTPException(status_code=400, detail="auth_type must be one of: none, api_key, bearer")
    if auth_type == "api_key" and not credentials.api_key:
        raise HTTPException(status_code=400, detail="api_key is required when auth_type is api_key")
    if auth_type == "bearer" and not credentials.bearer_token:
        raise HTTPException(status_code=400, detail="bearer_token is required when auth_type is bearer")

def validate_polymarket_connector_request(payload: PolymarketConnectorRequest) -> Dict[str, Any]:
    validate_connector_credentials(payload.credentials)

    source_mode = payload.source_mode.lower()
    if source_mode not in {"shared", "hybrid", "tenant_private"}:
        raise HTTPException(status_code=400, detail="source_mode must be one of: shared, hybrid, tenant_private")

    canonical_slug = extract_polymarket_event_slug(payload.event_slug) or extract_polymarket_event_slug(payload.event_url)
    canonical_event_url = payload.event_url if is_official_polymarket_event_url(payload.event_url) else build_polymarket_event_url(canonical_slug)

    return {
        "canonical_event_url": canonical_event_url,
        "canonical_event_slug": canonical_slug,
        "authentication": build_polymarket_connector_assessment(normalize_polymarket_connector_payload(payload, encrypt_secret=False)),
        "storage_supported": bool(get_connector_cipher() or not (payload.credentials and (payload.credentials.api_key or payload.credentials.bearer_token) and payload.credentials.persist_secret))
    }

def serialize_commodity_rulebook(commodity: str) -> Dict[str, Any]:
    rulebook = get_commodity_rulebook()
    normalized = normalize_commodity(commodity)
    if not normalized or normalized not in rulebook:
        raise HTTPException(status_code=404, detail=f"Unsupported commodity '{commodity}'")

    metadata = COMMODITY_METADATA.get(normalized, {})
    bullish_rules = rulebook[normalized]["bullish"]
    bearish_rules = rulebook[normalized]["bearish"]

    return {
        "commodity": normalized,
        "display_name": metadata.get("display_name", normalized.title()),
        "category": metadata.get("category", "general"),
        "dashboard_symbol": metadata.get("dashboard_symbol", normalized.upper()),
        "aliases": metadata.get("aliases", [normalized]),
        "bullish_rules": bullish_rules,
        "bearish_rules": bearish_rules,
        "rule_count": len(bullish_rules) + len(bearish_rules)
    }

async def ensure_recent_news_cache(max_headlines: int, commodity_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    articles = RECENT_NEWS_CACHE.get("articles") or []
    if articles:
        return articles

    news_result = await get_news_feed(
        NewsRequest(
            max_articles=max(max_headlines, 20),
            commodity_filter=commodity_filter
        )
    )
    return news_result.get("articles", [])

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
            "/api/prediction-market/connectors/polymarket",
            "/api/prediction-market/connectors/polymarket/{user_id}",
            "/api/prediction-market/connectors/polymarket/validate",
            "/api/prediction-market/polymarket/sentiment",
            "/api/lexicon/commodities",
            "/api/lexicon/commodities/{commodity}",
            "/api/lexicon/explain",
            "/api/dashboard/sentiment-engine",
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

@app.post('/api/prediction-market/connectors/polymarket/validate')
def validate_polymarket_connector(request: PolymarketConnectorValidationRequest):
    validation = validate_polymarket_connector_request(request.connector)
    payload = normalize_polymarket_connector_payload(request.connector, encrypt_secret=False)
    return {
        "provider": "polymarket",
        "connector_preview": {
            "name": payload["name"],
            "user_id": payload["user_id"],
            "source_mode": payload["source_mode"],
            "base_url": payload["base_url"],
            "event_url": validation["canonical_event_url"],
            "event_slug": validation["canonical_event_slug"],
            "website_urls": payload["website_urls"],
            "rate_limit_per_minute": payload["rate_limit_per_minute"],
            "cache_ttl_seconds": payload["cache_ttl_seconds"]
        },
        "auth": {
            "auth_type": payload["auth_type"],
            "api_key_header": payload["api_key_header"],
            "has_secret": payload["has_secret"],
            "masked_secret": payload["credential_mask"],
            "persist_secret": payload["credential_persisted"],
            "storage_supported": validation["storage_supported"]
        },
        "authentication": validation["authentication"],
        "message": "Your app validates and optionally stores the credential, but vendor access is still authenticated against the user's own Polymarket or upstream subscription."
    }

@app.post('/api/prediction-market/connectors/polymarket')
def create_polymarket_connector(request: PolymarketConnectorRequest):
    validate_polymarket_connector_request(request)
    db = require_supabase()
    payload = normalize_polymarket_connector_payload(request)
    connector_id = str(uuid4())
    insert_payload = {
        "id": connector_id,
        **payload
    }
    result = db.table(PREDICTION_MARKET_CONNECTORS_TABLE).insert(insert_payload).execute()
    if not getattr(result, "data", None):
        raise HTTPException(status_code=500, detail="Failed to persist Polymarket connector")
    saved = serialize_saved_polymarket_connector(result.data[0])
    saved["message"] = "Connector stored. Your app can now replay this tenant-scoped credential for Polymarket-related sentiment and source fetches."
    return saved

@app.get('/api/prediction-market/connectors/polymarket/{user_id}')
def list_polymarket_connectors(user_id: str):
    db = require_supabase()
    result = db.table(PREDICTION_MARKET_CONNECTORS_TABLE).select("*").eq("provider", "polymarket").eq("user_id", user_id).order("created_at", desc=True).execute()
    connectors = [serialize_saved_polymarket_connector(record) for record in (getattr(result, "data", None) or [])]
    return {
        "provider": "polymarket",
        "count": len(connectors),
        "connectors": connectors
    }

@app.delete('/api/prediction-market/connectors/polymarket/{connector_id}')
def delete_polymarket_connector(connector_id: str, user_id: Optional[str] = None):
    db = require_supabase()
    query = db.table(PREDICTION_MARKET_CONNECTORS_TABLE).delete().eq("id", connector_id).eq("provider", "polymarket")
    if user_id:
        query = query.eq("user_id", user_id)
    result = query.execute()
    if not getattr(result, "data", None):
        raise HTTPException(status_code=404, detail="Polymarket connector not found")
    return {"success": True, "deleted_id": connector_id}

@app.post('/api/prediction-market/polymarket/sentiment')
async def get_polymarket_connector_sentiment(request: PolymarketSentimentRequest):
    connector_record = None
    credentials_summary = serialize_connector_credentials(request.credentials)

    if request.connector_id:
        connector_record = fetch_saved_polymarket_connector(request.connector_id, request.user_id)
        if not request.event_url:
            request.event_url = connector_record.get("event_url")
        if not request.event_slug:
            request.event_slug = connector_record.get("event_slug")
        if connector_record.get("auth_type"):
            credentials_summary = {
                "auth_type": connector_record.get("auth_type", "none"),
                "api_key_header": connector_record.get("api_key_header"),
                "has_secret": bool(connector_record.get("has_secret")),
                "masked_secret": connector_record.get("credential_mask"),
                "persisted": bool(connector_record.get("credential_persisted"))
            }

    overview = await get_overall_news_sentiment(
        OverallSentimentRequest(
            topic_text=request.topic_text,
            max_headlines=request.max_headlines,
            refresh_if_empty=request.refresh_if_empty,
            event_url=request.event_url,
            event_slug=request.event_slug
        )
    )
    overview["provider"] = "polymarket"
    overview["connector_context"] = {
        "connector_id": connector_record.get("id") if connector_record else None,
        "source_mode": connector_record.get("source_mode", "shared") if connector_record else "shared",
        "uses_personal_subscription": bool(connector_record.get("use_personal_subscription")) if connector_record else credentials_summary["has_secret"],
        "bypass_shared_limits": bool(connector_record.get("bypass_shared_limits")) if connector_record else credentials_summary["has_secret"],
        "auth": credentials_summary,
        "authentication": {
            "validated_by_app": credentials_summary["has_secret"],
            "vendor_auth_still_required": credentials_summary["has_secret"],
            "app_manages_auth_replay": bool(connector_record and connector_record.get("auth_via_app")),
            "message": "Your app validates and optionally replays the BYO credential, but the upstream vendor still performs the actual authentication."
        }
    }
    return overview

@app.get('/api/lexicon/commodities')
def get_commodity_lexicon_catalog():
    rulebook = get_commodity_rulebook()
    commodities = []
    for commodity in sorted(rulebook.keys()):
        commodity_payload = serialize_commodity_rulebook(commodity)
        commodities.append({
            "commodity": commodity_payload["commodity"],
            "display_name": commodity_payload["display_name"],
            "category": commodity_payload["category"],
            "dashboard_symbol": commodity_payload["dashboard_symbol"],
            "aliases": commodity_payload["aliases"],
            "rule_count": commodity_payload["rule_count"]
        })

    return {
        "count": len(commodities),
        "commodities": commodities,
        "version": app.version
    }

@app.get('/api/lexicon/commodities/{commodity}')
def get_commodity_lexicon_detail(commodity: str):
    return serialize_commodity_rulebook(commodity)

@app.post('/api/lexicon/explain')
async def explain_commodity_lexicon(request: LexiconExplainRequest):
    scores = vader_analyzer.polarity_scores(request.text) if vader_analyzer else None
    sentiment_result = analyze_market_sentiment(request.text, request.commodity, scores)
    rulebook_payload = None
    if request.include_rulebook and sentiment_result.get("commodity"):
        rulebook_payload = serialize_commodity_rulebook(sentiment_result["commodity"])

    return {
        "text": request.text,
        "commodity": sentiment_result.get("commodity"),
        "sentiment": sentiment_result.get("sentiment"),
        "confidence": sentiment_result.get("confidence"),
        "method": sentiment_result.get("method"),
        "market_context": sentiment_result.get("market_context", {}),
        "keywords": extract_keywords(request.text),
        "tickers": extract_commodity_tickers(request.text),
        "rulebook": rulebook_payload,
        "timestamp": datetime.datetime.now().isoformat()
    }

@app.post('/api/dashboard/sentiment-engine')
async def get_dashboard_sentiment_engine(request: DashboardSentimentEngineRequest):
    requested_commodities = request.commodities or ["oil", "gas", "gold", "wheat"]
    normalized_requested: List[str] = []
    for commodity in requested_commodities:
        normalized = normalize_commodity(commodity)
        if normalized and normalized not in normalized_requested and normalized in get_commodity_rulebook():
            normalized_requested.append(normalized)

    if not normalized_requested:
        normalized_requested = ["oil", "gas", "gold", "wheat"]

    articles = await ensure_recent_news_cache(request.max_headlines, normalized_requested[0] if len(normalized_requested) == 1 else None)

    commodity_snapshots = []
    sentiment_labels = {"BULLISH": 0, "BEARISH": 0, "NEUTRAL": 0}
    for commodity in normalized_requested:
        lexicon_detail = serialize_commodity_rulebook(commodity)
        overview = build_headline_sentiment_overview(
            lexicon_detail["display_name"],
            articles,
            commodity=commodity,
            max_headlines=request.max_headlines
        )
        sentiment_labels[overview["overall_sentiment"]] = sentiment_labels.get(overview["overall_sentiment"], 0) + 1
        commodity_snapshots.append({
            "commodity": commodity,
            "display_name": lexicon_detail["display_name"],
            "category": lexicon_detail["category"],
            "dashboard_symbol": lexicon_detail["dashboard_symbol"],
            "aliases": lexicon_detail["aliases"],
            "rule_count": lexicon_detail["rule_count"],
            "overall_sentiment": overview["overall_sentiment"],
            "confidence": overview["confidence"],
            "headline_count": overview["headline_count"],
            "target_assets": overview["target_assets"],
            "summary": overview["summary"],
            "matched_signals": overview.get("matched_signals", []),
            "sample_headlines": overview.get("sample_headlines", []),
            "sentiment_breakdown": overview.get("sentiment_breakdown", {}),
            "lexicon": {
                "bullish_rules": lexicon_detail["bullish_rules"],
                "bearish_rules": lexicon_detail["bearish_rules"]
            }
        })

    if sentiment_labels["BULLISH"] > sentiment_labels["BEARISH"]:
        overall_sentiment = "BULLISH"
    elif sentiment_labels["BEARISH"] > sentiment_labels["BULLISH"]:
        overall_sentiment = "BEARISH"
    else:
        overall_sentiment = "NEUTRAL"

    avg_confidence = round(
        sum(snapshot["confidence"] for snapshot in commodity_snapshots) / max(len(commodity_snapshots), 1),
        3
    )

    return {
        "overall_sentiment": overall_sentiment,
        "confidence": avg_confidence,
        "commodities": commodity_snapshots,
        "cache_timestamp": RECENT_NEWS_CACHE.get("timestamp"),
        "generated_at": datetime.datetime.now().isoformat()
    }

# Enhanced sentiment analysis
@app.post('/api/sentiment')
async def analyze_sentiment(request: SentimentRequest):
    try:
        if GROQ_AVAILABLE and groq_service and request.enhanced:
            try:
                ai = await groq_service.analyze_news_compound(request.text, request.commodity)
                if isinstance(ai, dict) and ai.get("sentiment") and ai.get("sentiment_score") is not None:
                    return {
                        "text": request.text,
                        "sentiment": ai["sentiment"],
                        "confidence": round(float(ai["sentiment_score"]), 3),
                        "method": "groq_compound",
                        "commodity_specific": request.commodity is not None,
                        "ai": {
                            "summary": ai.get("summary"),
                            "keywords": ai.get("keywords"),
                            "what_it_means_for_traders": ai.get("what_it_means_for_traders"),
                            "trade_ideas": ai.get("trade_ideas")
                        }
                    }
            except Exception as e:
                logger.error(f"GROQ compound sentiment error: {e}")
        if vader_analyzer:
            # Use VADER for sentiment analysis
            scores = vader_analyzer.polarity_scores(request.text)
            market_result = analyze_market_sentiment(
                request.text,
                request.commodity,
                scores=scores
            )
            return {
                "text": request.text,
                "sentiment": market_result["sentiment"],
                "confidence": market_result["confidence"],
                "method": market_result["method"],
                "commodity_specific": market_result["commodity_specific"],
                "commodity": market_result["commodity"],
                "market_context": market_result["market_context"],
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
        ai_insights = None
        if GROQ_AVAILABLE and groq_service:
            try:
                ai_insights = await groq_service.analyze_news_compound(request.text)
            except Exception as e:
                logger.error(f"Compound analysis error: {e}")
                ai_insights = None
        return {
            "text": request.text,
            "source": request.source,
            "sentiment": sentiment_result["sentiment"],
            "confidence": sentiment_result["confidence"],
            "keywords": keywords,
            "market_impact": market_impact,
            "ai_insights": ai_insights,
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
        cutoff_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours_back)
        time_filtered_articles = []
        for article in all_articles:
            try:
                # Parse the published date
                published_str = article.get('published', '')
                if published_str:
                    # Handle both datetime objects and strings
                    if isinstance(published_str, datetime.datetime):
                        published_date = (
                            published_str if published_str.tzinfo
                            else published_str.replace(tzinfo=datetime.timezone.utc)
                        )
                    else:
                        published_date = datetime.datetime.fromisoformat(published_str.replace('Z', '+00:00'))
                        if published_date.tzinfo is None:
                            published_date = published_date.replace(tzinfo=datetime.timezone.utc)
                    
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
        logger.info(f"After time filtering ({hours_back}h): {len(all_articles)} articles remain")
        
        # If we have too few articles, progressively expand the time window
        min_articles = 5  # Minimum articles we want to show
        if len(all_articles) < min_articles:
            logger.info(f"Only {len(all_articles)} articles found in {hours_back}h window, expanding search...")
            
            # Try expanding to 24 hours, then 48 hours
            for expanded_hours in [24, 48]:
                if expanded_hours <= hours_back:
                    continue  # Skip if we're already searching this far back
                
                expanded_cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=expanded_hours)
                expanded_articles = []
                
                for article in results[0] if isinstance(results[0], list) else []:
                    try:
                        published_str = article.get('published', '')
                        if published_str:
                            if isinstance(published_str, datetime.datetime):
                                published_date = (
                                    published_str if published_str.tzinfo
                                    else published_str.replace(tzinfo=datetime.timezone.utc)
                                )
                            else:
                                published_date = datetime.datetime.fromisoformat(published_str.replace('Z', '+00:00'))
                                if published_date.tzinfo is None:
                                    published_date = published_date.replace(tzinfo=datetime.timezone.utc)
                            
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
                
                inferred_commodity = request.commodity_filter or normalize_commodity(None, text_for_analysis)
                if vader_analyzer:
                    scores = vader_analyzer.polarity_scores(text_for_analysis)
                    market_result = analyze_market_sentiment(
                        text_for_analysis,
                        inferred_commodity,
                        scores=scores
                    )
                    sentiment = market_result['sentiment']
                    confidence = market_result['confidence']
                else:
                    # Fallback sentiment analysis
                    basic_result = basic_sentiment_analysis(text_for_analysis, inferred_commodity)
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
                    'commodity': inferred_commodity,
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
        RECENT_NEWS_CACHE["timestamp"] = datetime.datetime.now().isoformat()
        RECENT_NEWS_CACHE["articles"] = enhanced_articles[:50]
        overall_sentiment = build_headline_sentiment_overview(
            request.commodity_filter or "commodities market",
            enhanced_articles,
            commodity=request.commodity_filter,
            max_headlines=min(request.max_articles or 20, 20)
        )
        
        return {
            'status': 'success',
            'articles': enhanced_articles,
            'total_fetched': len(all_articles),
            'sources_used': list(set(article.get('source') for article in all_articles if article.get('source'))),
            'timestamp': datetime.datetime.now().isoformat(),
            'analysis_method': 'vader' if vader_analyzer else 'basic',
            'content_enhanced': request.enhanced_content or False,
            'enhanced_articles_count': enhanced_count,
            'enhancement_method': 'nltk_summarization' if request.enhanced_content else None,
            'overall_sentiment': overall_sentiment
        }
    
    except Exception as e:
        logger.error(f"News feed error: {e}")
        # Return mock data as fallback
        return get_mock_news_data(request.max_articles)

@app.post('/api/news/overall-sentiment')
async def get_overall_news_sentiment(request: OverallSentimentRequest):
    """Aggregate the latest cached headlines into a market-level sentiment summary."""
    articles = RECENT_NEWS_CACHE.get("articles") or []

    if not articles and request.refresh_if_empty:
        news_result = await get_news_feed(
            NewsRequest(
                max_articles=max(request.max_headlines, 20),
                commodity_filter=request.commodity
            )
        )
        articles = news_result.get("articles", [])

    overview = build_headline_sentiment_overview(
        request.topic_text,
        articles,
        commodity=request.commodity,
        max_headlines=request.max_headlines,
        event_url=request.event_url,
        event_slug=request.event_slug
    )
    overview["cache_timestamp"] = RECENT_NEWS_CACHE.get("timestamp")
    return overview

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

def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))

def normalize_commodity(commodity: Optional[str], text: Optional[str] = None) -> Optional[str]:
    """Normalize commodity names and infer one from text if needed."""
    alias_map = {
        "oil": "oil",
        "crude": "oil",
        "crude oil": "oil",
        "wti": "oil",
        "brent": "oil",
        "gas": "gas",
        "nat gas": "gas",
        "natural gas": "gas",
        "lng": "gas",
        "gold": "gold",
        "silver": "silver",
        "uranium": "uranium",
        "u3o8": "uranium",
        "forex": "forex",
        "fx": "forex",
        "usd": "forex",
        "dollar": "forex",
        "eurusd": "forex",
        "usdjpy": "forex",
        "bitcoin": "bitcoin",
        "btc": "bitcoin",
        "wheat": "wheat",
        "corn": "corn",
        "macro": "macro",
        "weather": "weather"
    }
    if commodity:
        return alias_map.get(commodity.strip().lower(), commodity.strip().lower())
    if not text:
        return None
    text_lower = text.lower()
    for alias, normalized in alias_map.items():
        if alias in text_lower:
            return normalized
    return None

def get_commodity_rulebook() -> Dict[str, Dict[str, List[Dict[str, str]]]]:
    """Commodity-specific directional rules layered on top of VADER tone."""
    return {
        "oil": {
            "bullish": [
                {"pattern": r"opec\+?.{0,20}(cut|reduce|curb)", "signal": "OPEC supply cut"},
                {"pattern": r"(inventory|stockpile).{0,12}(draw|drop|fall)", "signal": "Inventory draw"},
                {"pattern": r"(sanctions|embargo|conflict|war).{0,24}(oil|crude|shipping|export)?", "signal": "Supply disruption risk"},
                {"pattern": r"(hurricane|storm|outage|disruption).{0,24}(production|supply|export|offshore)?", "signal": "Production disruption"},
                {"pattern": r"demand.{0,18}(rise|strong|increase|recover)", "signal": "Demand strengthening"}
            ],
            "bearish": [
                {"pattern": r"(production|output|supply).{0,18}(rise|increase|boost|grow)", "signal": "Supply growth"},
                {"pattern": r"(inventory|stockpile).{0,12}(build|rise|increase)", "signal": "Inventory build"},
                {"pattern": r"demand.{0,18}(slow|weak|fall|decline)", "signal": "Demand weakness"},
                {"pattern": r"(recession|slowdown|demand destruction)", "signal": "Macro demand risk"}
            ]
        },
        "gas": {
            "bullish": [
                {"pattern": r"(cold|freeze|arctic|winter storm)", "signal": "Heating demand surge"},
                {"pattern": r"(storage|inventory).{0,12}(draw|drop|below)", "signal": "Storage draw"},
                {"pattern": r"(lng|pipeline).{0,18}(outage|disruption|constraint)", "signal": "Supply constraint"}
            ],
            "bearish": [
                {"pattern": r"(warm|mild).{0,18}(weather|winter)", "signal": "Weak heating demand"},
                {"pattern": r"(storage|inventory).{0,12}(build|surplus|above)", "signal": "Storage surplus"},
                {"pattern": r"production.{0,18}(rise|increase|record)", "signal": "Production increase"}
            ]
        },
        "gold": {
            "bullish": [
                {"pattern": r"(rate cut|cuts rates|dovish|lower yields|yield fall|yield drops?)", "signal": "Lower real-rate pressure"},
                {"pattern": r"(inflation|cpi).{0,18}(rise|hot|sticky)", "signal": "Inflation hedge demand"},
                {"pattern": r"(geopolitical|conflict|war|safe[- ]haven)", "signal": "Safe-haven demand"},
                {"pattern": r"(dollar|usd).{0,18}(weak|falls?|declines?)", "signal": "Dollar weakness"}
            ],
            "bearish": [
                {"pattern": r"(rate hike|hawkish|higher yields|yield rise|yield jumps?)", "signal": "Higher yield pressure"},
                {"pattern": r"(dollar|usd).{0,18}(strong|rall(y|ies)|rises?)", "signal": "Dollar strength"},
                {"pattern": r"(risk-on|equities rally|strong payrolls|strong growth)", "signal": "Reduced defensive demand"}
            ]
        },
        "silver": {
            "bullish": [
                {"pattern": r"(rate cut|dovish|lower yields)", "signal": "Lower-rate support"},
                {"pattern": r"(solar|electronics|industrial demand).{0,18}(rise|strong|increase)", "signal": "Industrial demand strength"},
                {"pattern": r"(dollar|usd).{0,18}(weak|falls?|declines?)", "signal": "Dollar weakness"}
            ],
            "bearish": [
                {"pattern": r"(rate hike|hawkish|higher yields)", "signal": "Higher-rate pressure"},
                {"pattern": r"(industrial|manufacturing).{0,18}(slowdown|weakness|contract)", "signal": "Industrial demand weakness"},
                {"pattern": r"(dollar|usd).{0,18}(strong|rises?)", "signal": "Dollar strength"}
            ]
        },
        "uranium": {
            "bullish": [
                {"pattern": r"(nuclear|reactor|smr|small modular reactor).{0,24}(build|approval|restart|expand)", "signal": "Nuclear demand growth"},
                {"pattern": r"(uranium|fuel supply).{0,24}(shortage|tight|disruption|sanction)", "signal": "Fuel supply tightening"},
                {"pattern": r"(energy security|baseload power)", "signal": "Energy security support"}
            ],
            "bearish": [
                {"pattern": r"(nuclear|reactor).{0,24}(delay|shutdown|closure|cancel)", "signal": "Reactor demand delay"},
                {"pattern": r"(uranium|fuel supply).{0,24}(surplus|glut|oversupply)", "signal": "Fuel oversupply"},
                {"pattern": r"(regulatory|policy).{0,24}(pushback|block|ban)", "signal": "Policy headwind"}
            ]
        },
        "forex": {
            "bullish": [
                {"pattern": r"(hawkish fed|rate hike|higher yields|dollar strength|usd rally)", "signal": "Dollar-positive macro"},
                {"pattern": r"(safe[- ]haven|risk-off|flight to quality)", "signal": "Defensive FX bid"},
                {"pattern": r"(ecb|boj|boe).{0,24}(dovish|cut|ease)", "signal": "Foreign central-bank easing"}
            ],
            "bearish": [
                {"pattern": r"(dovish fed|rate cut|lower yields|dollar weakness|usd falls?)", "signal": "Dollar-negative macro"},
                {"pattern": r"(risk-on|carry trade|growth rebound)", "signal": "Risk-on FX rotation"},
                {"pattern": r"(ecb|boj|boe).{0,24}(hawkish|hike|tighten)", "signal": "Foreign central-bank support"}
            ]
        },
        "bitcoin": {
            "bullish": [
                {"pattern": r"(etf|spot etf).{0,18}(inflow|approval|demand)", "signal": "ETF demand"},
                {"pattern": r"(rate cut|liquidity|easing|dovish)", "signal": "Liquidity tailwind"},
                {"pattern": r"(institutional|adoption|treasury).{0,18}(buy|demand|allocation)", "signal": "Institutional adoption"}
            ],
            "bearish": [
                {"pattern": r"(sec|regulator|crackdown|ban|lawsuit)", "signal": "Regulatory pressure"},
                {"pattern": r"(hack|liquidation|outflow)", "signal": "Market stress"},
                {"pattern": r"(rate hike|higher yields|tightening)", "signal": "Liquidity headwind"}
            ]
        },
        "wheat": {
            "bullish": [
                {"pattern": r"(drought|flood|freeze|frost|heatwave)", "signal": "Crop risk"},
                {"pattern": r"(export ban|supply shortage|crop damage)", "signal": "Supply tightening"},
                {"pattern": r"(yield|harvest).{0,18}(fall|drop|miss)", "signal": "Weak harvest outlook"}
            ],
            "bearish": [
                {"pattern": r"(bumper crop|record harvest|strong yield)", "signal": "Strong harvest"},
                {"pattern": r"(export|supply).{0,18}(increase|recover)", "signal": "Supply recovery"},
                {"pattern": r"(rainfall|weather).{0,18}(improve|favorable)", "signal": "Improving crop conditions"}
            ]
        },
        "corn": {
            "bullish": [
                {"pattern": r"(drought|heatwave|crop stress|yield loss)", "signal": "Crop stress"},
                {"pattern": r"(ethanol demand|export sales).{0,18}(rise|strong)", "signal": "Demand support"}
            ],
            "bearish": [
                {"pattern": r"(record crop|strong yield|ample supply)", "signal": "Ample supply"},
                {"pattern": r"(rainfall|weather).{0,18}(improve|favorable)", "signal": "Improving crop conditions"}
            ]
        },
        "macro": {
            "bullish": [
                {"pattern": r"(soft landing|rate cut|disinflation|stimulus)", "signal": "Growth-supportive macro"},
                {"pattern": r"(cpi|inflation).{0,18}(cool|ease|slow)", "signal": "Cooling inflation"}
            ],
            "bearish": [
                {"pattern": r"(recession|slowdown|hard landing)", "signal": "Growth downside risk"},
                {"pattern": r"(cpi|inflation).{0,18}(hot|sticky|rise)", "signal": "Inflation pressure"},
                {"pattern": r"(hawkish|rate hike|tightening)", "signal": "Tighter policy"}
            ]
        },
        "weather": {
            "bullish": [
                {"pattern": r"(hurricane|storm|drought|flood|freeze|heatwave)", "signal": "Weather event risk"},
                {"pattern": r"(forecast|models?).{0,18}(worsen|intensif(y|ies))", "signal": "Forecast deterioration"}
            ],
            "bearish": [
                {"pattern": r"(forecast|models?).{0,18}(improve|moderate|weaken)", "signal": "Forecast improvement"},
                {"pattern": r"(storm|hurricane).{0,18}(downgrade|dissipate)", "signal": "Event weakening"}
            ]
        }
    }

def analyze_fundamental_direction(text: str, commodity: Optional[str]) -> Dict[str, Any]:
    """Interpret whether the text is fundamentally bullish or bearish for a commodity."""
    normalized = normalize_commodity(commodity, text)
    rulebook = get_commodity_rulebook()
    if not normalized or normalized not in rulebook:
        return {
            "commodity": normalized,
            "directional_score": 0.0,
            "matched_signals": [],
            "rule_bias": "NONE"
        }
    text_lower = text.lower()
    bullish_matches = []
    bearish_matches = []
    for entry in rulebook[normalized]["bullish"]:
        if re.search(entry["pattern"], text_lower):
            bullish_matches.append(entry["signal"])
    for entry in rulebook[normalized]["bearish"]:
        if re.search(entry["pattern"], text_lower):
            bearish_matches.append(entry["signal"])
    score = 0.22 * len(bullish_matches) - 0.22 * len(bearish_matches)
    score = _clamp(score, -0.9, 0.9)
    if score > 0:
        bias = "BULLISH"
    elif score < 0:
        bias = "BEARISH"
    else:
        bias = "NEUTRAL"
    matched = [
        {"signal": signal, "direction": "bullish"} for signal in bullish_matches
    ] + [
        {"signal": signal, "direction": "bearish"} for signal in bearish_matches
    ]
    return {
        "commodity": normalized,
        "directional_score": round(score, 3),
        "matched_signals": matched[:6],
        "rule_bias": bias
    }

def analyze_market_sentiment(text: str, commodity: Optional[str] = None, scores: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
    """Blend VADER tone with commodity-specific fundamental rules."""
    if scores is None:
        if vader_analyzer:
            scores = vader_analyzer.polarity_scores(text)
        else:
            return basic_sentiment_analysis(text, commodity)
    compound = scores["compound"]
    if compound >= 0.05:
        base_sentiment = "BULLISH"
    elif compound <= -0.05:
        base_sentiment = "BEARISH"
    else:
        base_sentiment = "NEUTRAL"
    base_confidence = 0.5 + (abs(compound) * 0.5 if base_sentiment != "NEUTRAL" else abs(compound) * 2)
    fundamental = analyze_fundamental_direction(text, commodity)
    has_rules = bool(fundamental["matched_signals"])
    combined_score = compound
    method = "vader"
    if has_rules:
        combined_score = (compound * 0.4) + (fundamental["directional_score"] * 0.6)
        method = "commodity_vader"
    if combined_score >= 0.12:
        sentiment = "BULLISH"
    elif combined_score <= -0.12:
        sentiment = "BEARISH"
    else:
        sentiment = "NEUTRAL"
    confidence = base_confidence
    if has_rules:
        confidence = _clamp(
            0.52 + (abs(combined_score) * 0.4) + min(0.12, len(fundamental["matched_signals"]) * 0.03),
            0.5,
            0.96
        )
    return {
        "sentiment": sentiment,
        "confidence": round(confidence, 3),
        "method": method,
        "commodity_specific": fundamental["commodity"] is not None,
        "commodity": fundamental["commodity"],
        "market_context": {
            "base_sentiment": base_sentiment,
            "base_confidence": round(_clamp(base_confidence, 0.5, 0.95), 3),
            "fundamental_bias": fundamental["rule_bias"],
            "directional_score": fundamental["directional_score"],
            "matched_signals": fundamental["matched_signals"]
        }
    }

def infer_market_targets(topic_text: str, commodity: Optional[str] = None) -> List[str]:
    """Infer the most relevant target assets for a market/topic prompt."""
    normalized = normalize_commodity(commodity, topic_text)
    if normalized:
        if normalized == "macro":
            return ["forex", "gold"]
        if normalized == "weather":
            return ["oil", "gas"]
        return [normalized]

    text_lower = topic_text.lower()
    target_rules = [
        (["wti", "brent", "crude", "opec", "hormuz", "oil", "shipping", "refinery"], ["oil"]),
        (["gold", "bullion", "safe haven"], ["gold"]),
        (["silver"], ["silver"]),
        (["uranium", "u3o8", "nuclear", "reactor", "smr"], ["uranium"]),
        (["forex", "fx", "usd", "dollar", "eur", "jpy", "gbp", "cad", "aud", "boj", "ecb", "boe"], ["forex"]),
        (["iran", "israel", "middle east", "strait of hormuz", "sanctions"], ["oil", "gold", "silver"]),
        (["fed", "rate cut", "rate hike", "inflation", "cpi", "payrolls", "central bank"], ["gold", "silver", "forex"]),
        (["risk-on", "risk-off", "recession", "growth"], ["gold", "forex"])
    ]

    inferred: List[str] = []
    for keywords, assets in target_rules:
        if any(keyword in text_lower for keyword in keywords):
            for asset in assets:
                if asset not in inferred:
                    inferred.append(asset)
    return inferred[:3]

def is_official_polymarket_event_url(value: Optional[str]) -> bool:
    if not value:
        return False

    try:
        parsed = urlparse(value)
    except Exception:
        return False

    return parsed.netloc in {"polymarket.com", "www.polymarket.com"} and parsed.path.startswith("/event/")

def build_polymarket_event_url(slug: Optional[str]) -> Optional[str]:
    if not slug:
        return None

    normalized_slug = slug.strip().lstrip("/").removeprefix("event/").rstrip("/")
    if not normalized_slug:
        return None

    return f"https://polymarket.com/event/{normalized_slug}"

def extract_polymarket_event_slug(value: Optional[str]) -> Optional[str]:
    if not value:
        return None

    if is_official_polymarket_event_url(value):
        parsed = urlparse(value)
        slug = re.sub(r"^/event/", "", parsed.path).rstrip("/")
        return slug or None

    normalized_slug = value.strip().lstrip("/").removeprefix("event/").rstrip("/")
    return normalized_slug or None

def score_article_relevance(article: Dict[str, Any], topic_text: str, target_assets: List[str]) -> float:
    """Rank how useful a cached headline is for a topic-specific aggregate read."""
    article_text = f"{article.get('title', '')} {article.get('summary', '')}".lower()
    topic_lower = topic_text.lower()
    score = 0.0

    article_commodity = normalize_commodity(article.get("commodity"), article_text)
    direct_asset_match = False
    if article_commodity and article_commodity in target_assets:
        score += 2.0
        direct_asset_match = True

    if article.get("sentiment") in {"BULLISH", "BEARISH"}:
        score += 0.2

    for asset in target_assets:
        if asset in article_text:
            score += 1.5
            direct_asset_match = True

    # For specific commodity dashboards, require an explicit commodity match.
    if target_assets and target_assets[0] not in {"macro", "weather"} and not direct_asset_match:
        return 0.0

    shared_keywords = set(extract_keywords(topic_lower)).intersection(extract_keywords(article_text))
    score += min(1.0, len(shared_keywords) * 0.25)

    if any(keyword in article_text and keyword in topic_lower for keyword in ["iran", "israel", "opec", "fed", "inflation", "hormuz", "nuclear", "usd"]):
        score += 1.25

    return score

def build_headline_sentiment_overview(
    topic_text: str,
    articles: List[Dict[str, Any]],
    commodity: Optional[str] = None,
    max_headlines: int = 20,
    event_url: Optional[str] = None,
    event_slug: Optional[str] = None
) -> Dict[str, Any]:
    """Summarize the last N relevant headlines into a single market-facing sentiment read."""
    canonical_event_slug = extract_polymarket_event_slug(event_slug) or extract_polymarket_event_slug(event_url)
    canonical_event_url = event_url if is_official_polymarket_event_url(event_url) else build_polymarket_event_url(canonical_event_slug)
    target_assets = infer_market_targets(topic_text, commodity)
    ranked_articles = sorted(
        articles,
        key=lambda article: score_article_relevance(article, topic_text, target_assets),
        reverse=True
    )
    relevant_articles = [
        article for article in ranked_articles
        if score_article_relevance(article, topic_text, target_assets) > 0
    ][:max_headlines]

    primary_target = target_assets[0] if target_assets else normalize_commodity(commodity, topic_text)
    if not relevant_articles:
        primary_label = primary_target.upper() if primary_target else "the market"
        return {
            "topic_text": topic_text,
            "primary_target": primary_target,
            "target_assets": [asset.upper() for asset in target_assets],
            "overall_sentiment": "NEUTRAL",
            "confidence": 0.5,
            "headline_count": 0,
            "summary": f"No recent relevant headlines were available, so the overall sentiment for {primary_label} remains neutral.",
            "sentiment_breakdown": {"bullish": 0, "bearish": 0, "neutral": 0},
            "sample_headlines": [],
            "method": "recent_headlines_cache",
            "event_url": canonical_event_url,
            "event_slug": canonical_event_slug,
            "source_url": canonical_event_url
        }

    weighted_score = 0.0
    total_weight = 0.0
    sentiment_breakdown = {"bullish": 0, "bearish": 0, "neutral": 0}
    signals: List[str] = []

    for article in relevant_articles:
        article_text = f"{article.get('title', '')}. {article.get('summary', '')}"
        article_commodity = primary_target or normalize_commodity(article.get("commodity"), article_text)
        market_result = analyze_market_sentiment(article_text, article_commodity)
        article_score = market_result["confidence"]
        if market_result["sentiment"] == "BULLISH":
            weighted_score += article_score
            sentiment_breakdown["bullish"] += 1
        elif market_result["sentiment"] == "BEARISH":
            weighted_score -= article_score
            sentiment_breakdown["bearish"] += 1
        else:
            sentiment_breakdown["neutral"] += 1
        total_weight += max(article_score, 0.2)
        for signal in market_result.get("market_context", {}).get("matched_signals", []):
            label = signal.get("signal")
            if label and label not in signals:
                signals.append(label)

    normalized_score = weighted_score / total_weight if total_weight else 0.0
    if normalized_score >= 0.15:
        overall_sentiment = "BULLISH"
    elif normalized_score <= -0.15:
        overall_sentiment = "BEARISH"
    else:
        overall_sentiment = "NEUTRAL"

    confidence = _clamp(
        0.52 + abs(normalized_score) * 0.35 + min(0.1, len(relevant_articles) * 0.01),
        0.5,
        0.95
    )
    label = (primary_target or "market").upper()
    summary = (
        f"Overall sentiment across the last {len(relevant_articles)} relevant headlines is "
        f"{overall_sentiment.lower()} for {label}, based on {sentiment_breakdown['bullish']} bullish, "
        f"{sentiment_breakdown['bearish']} bearish, and {sentiment_breakdown['neutral']} neutral reads."
    )
    if signals:
        summary += f" Key drivers include {', '.join(signals[:3]).lower()}."

    return {
        "topic_text": topic_text,
        "primary_target": primary_target,
        "target_assets": [asset.upper() for asset in target_assets],
        "overall_sentiment": overall_sentiment,
        "confidence": round(confidence, 3),
        "headline_count": len(relevant_articles),
        "summary": summary,
        "sentiment_breakdown": sentiment_breakdown,
        "sample_headlines": [article.get("title", "") for article in relevant_articles[:5]],
        "matched_signals": signals[:5],
        "method": "recent_headlines_cache",
        "event_url": canonical_event_url,
        "event_slug": canonical_event_slug,
        "source_url": canonical_event_url
    }

def extract_keywords(text: str) -> List[str]:
    """Extract relevant keywords from text"""
    # Common commodity and market keywords
    keywords = []
    commodity_terms = ["oil", "gas", "wheat", "corn", "gold", "silver", "copper", "coffee", "sugar", "bitcoin", "btc"]
    market_terms = ["price", "production", "supply", "demand", "forecast", "harvest", "export", "import", "inflation", "fed", "yield", "weather"]
    
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
        'bitcoin': ['BTC'],
        'btc': ['BTC'],
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

"""
Enhanced News Preprocessing Module for Commodity Trading
Incorporates domain knowledge from:
- Jim Rogers' "Hot Commodities"
- Marc Rich's trading strategies (Daniel Ammann)  
- Daniel Yergin's "The Prize"

This module extracts structured data from raw geopolitical/economic news
for sentiment analysis and trading strategy generation.
"""

import re
import json
import logging
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
from dataclasses import dataclass

# Configure logging
logger = logging.getLogger(__name__)

# Try to import spaCy, fallback to basic NER if not available
try:
    import spacy
    nlp = spacy.load("en_core_web_sm")
    SPACY_AVAILABLE = True
except (ImportError, OSError):
    logger.warning("spaCy not available, using fallback entity recognition")
    SPACY_AVAILABLE = False
    nlp = None

@dataclass
class ProcessingMetadata:
    """Metadata about the preprocessing operation"""
    timestamp: str
    spacy_used: bool
    confidence_score: float
    processing_version: str = "1.0"

# === DOMAIN KNOWLEDGE DICTIONARIES ===
# Based on Jim Rogers' commodity classifications and Marc Rich's trading insights

COMMODITY_KEYWORDS = {
    "oil": {
        "primary": ["crude", "oil", "petroleum", "WTI", "Brent", "drilling", "refinery", "gasoline", "diesel"],
        "secondary": ["OPEC", "pipeline", "tanker", "barrel", "rig", "upstream", "downstream", "crack spread"],
        "infrastructure": ["refinery", "pipeline", "storage", "terminal", "port", "loading", "discharge"],
        "key_players": ["Saudi Arabia", "Russia", "Iraq", "Iran", "Venezuela", "Nigeria", "Kuwait", "UAE"],
        "organizations": ["OPEC", "OPEC+", "IEA", "EIA", "SPR"],
        "trading_hubs": ["Cushing", "Rotterdam", "Singapore", "Houston", "Fujairah"]
    },
    
    "gas": {
        "primary": ["natural gas", "LNG", "gas", "methane", "pipeline gas", "shale gas"],
        "secondary": ["Henry Hub", "storage", "injection", "withdrawal", "heating", "cooling"],
        "infrastructure": ["pipeline", "LNG terminal", "storage facility", "compressor", "regasification"],
        "key_players": ["Russia", "Qatar", "Australia", "USA", "Algeria", "Nigeria"],
        "organizations": ["Gazprom", "Cheniere", "Shell", "BP", "TotalEnergies"],
        "trading_hubs": ["Henry Hub", "Title Transfer Facility", "National Balancing Point"]
    },
    
    "agriculture": {
        "primary": ["wheat", "corn", "soybeans", "rice", "sugar", "coffee", "cocoa", "cotton"],
        "secondary": ["harvest", "planting", "crop", "yield", "drought", "flooding", "fertilizer"],
        "infrastructure": ["grain elevator", "silo", "mill", "processing plant", "export terminal"],
        "key_players": ["USA", "Brazil", "Argentina", "Russia", "Ukraine", "Australia", "Canada"],
        "organizations": ["USDA", "CBOT", "ADM", "Cargill", "Bunge", "Louis Dreyfus"],
        "trading_hubs": ["Chicago", "Kansas City", "Minneapolis", "Paris", "London"]
    },
    
    "metals": {
        "primary": ["copper", "aluminum", "zinc", "lead", "tin", "nickel", "gold", "silver", "platinum"],
        "secondary": ["mine", "smelter", "refinery", "ore", "concentrate", "cathode", "ingot"],
        "infrastructure": ["mine", "smelter", "refinery", "warehouse", "LME", "processing facility"],
        "key_players": ["Chile", "Peru", "China", "Australia", "DRC", "Indonesia", "Russia"],
        "organizations": ["LME", "COMEX", "Glencore", "BHP", "Rio Tinto", "Freeport"],
        "trading_hubs": ["London", "Shanghai", "New York", "Singapore"]
    },
    
    "softs": {
        "primary": ["sugar", "coffee", "cocoa", "cotton", "orange juice", "lumber"],
        "secondary": ["plantation", "harvest", "processing", "roasting", "refining"],
        "infrastructure": ["plantation", "mill", "processing plant", "warehouse", "port"],
        "key_players": ["Brazil", "Colombia", "Vietnam", "India", "Ivory Coast", "Ghana"],
        "organizations": ["ICE", "CSCE", "Louis Dreyfus", "Olam", "Barry Callebaut"],
        "trading_hubs": ["New York", "London", "Paris"]
    }
}

# Event type classifications based on Marc Rich's trading strategies
EVENT_TYPE_KEYWORDS = {
    "supply_shock": [
        "production cut", "strike", "shutdown", "outage", "maintenance", "accident",
        "explosion", "fire", "technical problems", "force majeure", "disruption",
        "workers", "indefinite strike", "mine strike", "facility closure"
    ],
    "geopolitical_tension": [
        "sanctions", "embargo", "trade war", "conflict", "invasion", "military action",
        "diplomatic crisis", "blockade", "tensions escalate", "war", "terrorism",
        "imposed", "targeting", "banned", "restricted"
    ],
    "weather_event": [
        "drought", "flood", "hurricane", "typhoon", "freeze", "heat wave",
        "monsoon", "El Niño", "La Niña", "climate", "weather pattern",
        "severe drought", "damaged crops", "weather conditions"
    ],
    "policy_change": [
        "regulation", "tax", "tariff", "quota", "export ban", "import restriction",
        "policy change", "government decision", "central bank", "interest rate"
    ],
    "infrastructure_disruption": [
        "pipeline explosion", "port closure", "terminal shutdown", "refinery maintenance",
        "plant outage", "facility disruption", "transportation halt", "logistics failure", 
        "shipping disruption", "railway closure", "trucking strike", "pipeline rupture",
        "Nord Stream", "pipeline", "terminal", "facility"
    ],
    "production_change": [
        "production increase", "production decrease", "capacity expansion",
        "new project", "mine opening", "field development", "well completion"
    ],
    "demand_shift": [
        "consumption", "demand", "usage", "economic growth", "recession",
        "industrial activity", "manufacturing", "construction"
    ]
}

# Regional classifications based on Daniel Yergin's geopolitical insights
REGIONAL_KEYWORDS = {
    "Middle East": [
        "Saudi Arabia", "Iran", "Iraq", "Kuwait", "UAE", "Qatar", "Oman",
        "Persian Gulf", "Strait of Hormuz", "Red Sea", "Suez Canal"
    ],
    "North America": [
        "United States", "USA", "Canada", "Mexico", "Gulf of Mexico",
        "Permian Basin", "Bakken", "Eagle Ford", "Alberta", "Texas"
    ],
    "Europe": [
        "Norway", "UK", "Netherlands", "Germany", "France", "Italy",
        "North Sea", "Baltic Sea", "Mediterranean", "Black Sea", "Danish", "Denmark"
    ],
    "Asia Pacific": [
        "China", "Japan", "South Korea", "India", "Indonesia", "Malaysia",
        "Australia", "Singapore", "Taiwan", "Thailand", "Philippines"
    ],
    "Latin America": [
        "Brazil", "Venezuela", "Colombia", "Argentina", "Chile", "Peru",
        "Ecuador", "Bolivia", "Guyana", "Trinidad and Tobago"
    ],
    "Africa": [
        "Nigeria", "Angola", "Libya", "Algeria", "Egypt", "Ghana",
        "Equatorial Guinea", "Chad", "Sudan", "South Africa"
    ],
    "Eurasia": [
        "Russia", "Kazakhstan", "Azerbaijan", "Turkmenistan", "Uzbekistan",
        "Ukraine", "Belarus", "Georgia", "Caspian Sea", "Siberia"
    ]
}

# Market impact indicators based on trading psychology
MARKET_IMPACT_KEYWORDS = {
    "bullish": [
        "shortage", "tight supply", "low inventory", "strong demand", "robust consumption",
        "production cut", "supply disruption", "stockpile drawdown", "deficit"
    ],
    "bearish": [
        "oversupply", "surplus", "weak demand", "high inventory", "stockpile build",
        "production increase", "demand destruction", "economic slowdown", "glut"
    ],
    "neutral": [
        "stable", "unchanged", "steady", "balanced", "normal", "expected", "planned"
    ]
}

# === PREPROCESSING FUNCTIONS ===

def preprocess_news(text: str) -> Dict[str, Any]:
    """Enhanced preprocessing of news text with commodity market context"""
    if not text or text.strip() == "":
        return {"error": "Empty or invalid input text"}
    
    if text is None:
        return {"error": "Input text is None"}
    
    # Clean and normalize text
    cleaned_text = _clean_text(text)
    
    # Extract basic information
    commodity = _identify_commodity(cleaned_text)
    event_type = _identify_event_type(cleaned_text)
    region = _identify_region(cleaned_text)
    entities = _extract_entities_basic(cleaned_text)
    trigger_keywords = _find_trigger_keywords(cleaned_text, commodity, event_type)
    market_impact = _assess_market_impact(cleaned_text, event_type)
    severity = _determine_severity(cleaned_text, event_type, commodity)
    confidence_score = _calculate_confidence(commodity, event_type, trigger_keywords)
    summary = _generate_summary(cleaned_text)
    
    return {
        "commodity": commodity,
        "event_type": event_type,
        "region": region,
        "entities": entities,
        "trigger_keywords": trigger_keywords,
        "market_impact": market_impact,
        "severity": severity,
        "confidence_score": confidence_score,
        "summary": summary,
        "timestamp": datetime.now().isoformat()
    }

def create_pipeline_ready_output(text: str) -> Dict[str, Any]:
    """Create pipeline-ready output with enhanced context and weights"""
    preprocessing_result = preprocess_news(text)
    
    if "error" in preprocessing_result:
        return preprocessing_result
    
    enhanced_text = f"{text} [COMMODITY: {preprocessing_result['commodity']}]"
    
    weights = {
        "geopolitical_weight": 1.5 if preprocessing_result["event_type"] == "geopolitical_tension" else 1.0,
        "weather_weight": 1.3 if preprocessing_result["event_type"] == "weather_event" else 1.0,
        "supply_weight": 1.4 if preprocessing_result["event_type"] == "supply_shock" else 1.0,
        "confidence_weight": preprocessing_result["confidence_score"]
    }
    
    return {
        "text": enhanced_text,
        "preprocessing": preprocessing_result,
        "metadata": {
            "source": "news_preprocessing",
            "version": "1.0",
            "processed_at": datetime.now().isoformat()
        },
        "weights": weights
    }

def get_domain_keywords() -> Dict[str, Any]:
    """Get access to domain knowledge dictionaries"""
    return {
        "commodities": COMMODITY_KEYWORDS,
        "events": EVENT_TYPE_KEYWORDS,
        "regions": REGIONAL_KEYWORDS,
        "market_impact": MARKET_IMPACT_KEYWORDS
    }

def validate_preprocessing_result(result: Dict[str, Any]) -> bool:
    """Validate preprocessing result structure"""
    required_fields = [
        "commodity", "event_type", "region", "entities",
        "trigger_keywords", "market_impact", "severity",
        "confidence_score", "summary"
    ]
    return all(field in result for field in required_fields)

# Helper functions
def _clean_text(text: str) -> str:
    """Clean and normalize text"""
    text = re.sub(r'\s+', ' ', text.strip())
    text = re.sub(r'\bUS\b', 'United States', text)
    text = re.sub(r'\bUK\b', 'United Kingdom', text)
    text = re.sub(r'\bEU\b', 'European Union', text)
    return text

def _identify_commodity(text: str) -> str:
    """Identify primary commodity mentioned in text"""
    text_lower = text.lower()
    scores = {}
    
    for commodity, keywords in COMMODITY_KEYWORDS.items():
        score = 0
        for keyword in keywords["primary"]:
            score += text_lower.count(keyword.lower()) * 3
        for keyword in keywords["secondary"]:
            score += text_lower.count(keyword.lower()) * 1
        scores[commodity] = score
    
    if max(scores.values()) > 0:
        return max(scores, key=scores.get)
    return "general"

def _identify_event_type(text: str) -> str:
    """Identify event type from text"""
    text_lower = text.lower()
    scores = {}
    
    for event_type, keywords in EVENT_TYPE_KEYWORDS.items():
        score = sum(text_lower.count(keyword.lower()) for keyword in keywords)
        scores[event_type] = score
    
    if max(scores.values()) > 0:
        return max(scores, key=scores.get)
    return "market_movement"

def _identify_region(text: str) -> str:
    """Identify geographic region from text"""
    text_lower = text.lower()
    scores = {}
    
    for region, keywords in REGIONAL_KEYWORDS.items():
        score = 0
        for keyword in keywords:
            keyword_lower = keyword.lower()
            # Exact word boundary matching for better accuracy
            if re.search(r'\b' + re.escape(keyword_lower) + r'\b', text_lower):
                score += 5  # Higher score for exact matches
            elif keyword_lower in text_lower:
                score += 1
        scores[region] = score
    
    # Debug: prioritize based on context
    if "chile" in text_lower:
        scores["Latin America"] += 10
    if "iran" in text_lower:
        scores["Middle East"] += 10
    if "china" in text_lower and "electric vehicle" in text_lower:
        # China mentioned as consumer, not producer region
        pass
    
    if max(scores.values()) > 0:
        return max(scores, key=scores.get)
    return "Global"

def _extract_entities_basic(text: str) -> List[str]:
    """Basic entity extraction without spaCy"""
    entities = []
    words = text.split()
    
    for word in words:
        clean_word = re.sub(r'[^\w]', '', word)
        if clean_word and clean_word[0].isupper() and len(clean_word) > 2:
            if clean_word not in entities and not clean_word.isupper():
                entities.append(clean_word)
    
    known_entities = [
        "OPEC", "Gazprom", "BHP", "Iran", "Russia", "China", "Ukraine",
        "Saudi Arabia", "United States", "Europe", "Chile", "Brazil"
    ]
    
    text_upper = text.upper()
    for entity in known_entities:
        if entity.upper() in text_upper and entity not in entities:
            entities.append(entity)
    
    return entities[:10]

def _find_trigger_keywords(text: str, commodity: str, event_type: str) -> List[str]:
    """Find trigger keywords relevant to commodity and event"""
    text_lower = text.lower()
    keywords = []
    
    if commodity in COMMODITY_KEYWORDS:
        for keyword in COMMODITY_KEYWORDS[commodity]["primary"]:
            if keyword.lower() in text_lower:
                keywords.append(keyword)
    
    if event_type in EVENT_TYPE_KEYWORDS:
        for keyword in EVENT_TYPE_KEYWORDS[event_type]:
            if keyword.lower() in text_lower:
                keywords.append(keyword)
    
    market_terms = ["price", "trading", "futures", "market", "supply", "demand"]
    for term in market_terms:
        if term in text_lower and term not in keywords:
            keywords.append(term)
    
    return keywords

def _assess_market_impact(text: str, event_type: str) -> str:
    """Assess likely market impact (bullish/bearish/neutral)"""
    text_lower = text.lower()
    bullish_score = 0
    bearish_score = 0
    
    for keyword in MARKET_IMPACT_KEYWORDS["bullish"]:
        bullish_score += text_lower.count(keyword.lower())
    
    for keyword in MARKET_IMPACT_KEYWORDS["bearish"]:
        bearish_score += text_lower.count(keyword.lower())
    
    if event_type in ["supply_shock", "geopolitical_tension", "infrastructure_disruption"]:
        bullish_score += 2
    
    if any(term in text_lower for term in ["rose", "surged", "jumped", "climbed", "higher"]):
        bullish_score += 1
    if any(term in text_lower for term in ["fell", "dropped", "declined", "lower", "weakness"]):
        bearish_score += 1
    
    if bullish_score > bearish_score:
        return "bullish"
    elif bearish_score > bullish_score:
        return "bearish"
    else:
        return "neutral"

def _determine_severity(text: str, event_type: str, commodity: str) -> str:
    """Determine event severity"""
    text_lower = text.lower()
    
    # High severity terms that indicate major disruptions
    high_severity_terms = [
        "war", "sanctions", "embargo", "indefinite strike", "shutdown",
        "force majeure", "emergency", "crisis", "unprecedented", "imposed"
    ]
    
    # Medium severity - includes most operational disruptions
    medium_severity_terms = [
        "disruption", "reduction", "concern", "tension", "delay",
        "maintenance", "outage", "protest", "strike", "explosion"
    ]
    
    low_severity_terms = [
        "planned", "scheduled", "routine", "minor", "temporary"
    ]
    
    high_count = sum(text_lower.count(term) for term in high_severity_terms)
    medium_count = sum(text_lower.count(term) for term in medium_severity_terms)
    low_count = sum(text_lower.count(term) for term in low_severity_terms)
    
    # Check for percentage impacts
    percentage_matches = re.findall(r'(\d+)%', text)
    if percentage_matches:
        max_percentage = max(int(match) for match in percentage_matches)
        if max_percentage >= 15:
            high_count += 1
        elif max_percentage >= 5:
            medium_count += 1
    
    # Special cases for specific event types
    if event_type == "infrastructure_disruption":
        # Infrastructure disruptions default to medium unless multiple high indicators
        if high_count >= 2:
            return "high"
        else:
            return "medium"
    
    if high_count > 0:
        return "high"
    elif medium_count > 0:
        return "medium"
    elif low_count > 0:
        return "low"
    else:
        return "low"

def _calculate_confidence(commodity: str, event_type: str, trigger_keywords: List[str]) -> float:
    """Calculate confidence score for the analysis"""
    confidence = 0.0
    
    # Base confidence from commodity identification
    if commodity != "general":
        confidence += 0.3
    else:
        confidence += 0.02  # Very low for general
    
    # Event type confidence
    if event_type != "market_movement":
        confidence += 0.2
    else:
        confidence += 0.01  # Very low for generic movement
    
    # Keywords confidence - much more conservative
    keyword_confidence = min(len(trigger_keywords) * 0.02, 0.15)
    confidence += keyword_confidence
    
    # Heavy penalty for generic/mixed content
    generic_terms = ["economic", "analysts", "predict", "markets", "policy"]
    generic_count = sum(1 for term in generic_terms if any(term in kw.lower() for kw in trigger_keywords))
    
    if generic_count >= 2 or (commodity == "general" and event_type == "market_movement"):
        confidence *= 0.2  # Massive reduction for generic content
    
    return min(confidence, 1.0)

def _generate_summary(text: str) -> str:
    """Generate a summary of the text"""
    sentences = text.split('.')
    if not sentences:
        return text[:200] + "..." if len(text) > 200 else text
    
    first_sentence = sentences[0].strip()
    if len(first_sentence) > 200:
        return first_sentence[:200] + "..."
    
    if len(first_sentence) < 50 and len(sentences) > 1:
        second_sentence = sentences[1].strip()
        combined = f"{first_sentence}. {second_sentence}"
        if len(combined) <= 200:
            return combined
    
    return first_sentence
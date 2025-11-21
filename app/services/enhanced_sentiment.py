"""
Enhanced Sentiment Analysis Service
Integrates FinBERT and VADER for comprehensive sentiment analysis
"""
import asyncio
from typing import Dict, List, Optional
from pydantic import BaseModel
import logging

from core.config import settings

# Try to import sentiment analysis libraries
try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
    VADER_AVAILABLE = True
except ImportError:
    VADER_AVAILABLE = False
    logging.warning("VADER Sentiment not available. Install with: pip install vaderSentiment")

try:
    from transformers import BertTokenizer, BertForSequenceClassification
    import torch
    FINBERT_AVAILABLE = True
except ImportError:
    FINBERT_AVAILABLE = False
    logging.warning("FinBERT not available. Install with: pip install transformers torch")

class SentimentRequest(BaseModel):
    text: str
    commodity: Optional[str] = None
    enhanced: bool = False

class SentimentResult(BaseModel):
    sentiment: str
    confidence: float
    vader_scores: Optional[Dict] = None
    finbert_result: Optional[Dict] = None
    commodity_specific: bool = False
    market_impact: str = "neutral"
    severity: str = "low"

class EnhancedSentimentAnalyzer:
    def __init__(self):
        self.vader_analyzer = None
        self.finbert_model = None
        self.finbert_tokenizer = None
        self.initialized = False
        
    async def initialize(self):
        """Initialize the sentiment analysis models"""
        if self.initialized:
            return
            
        try:
            # Initialize VADER
            if VADER_AVAILABLE:
                self.vader_analyzer = SentimentIntensityAnalyzer()
                logging.info("VADER sentiment analyzer initialized")
            
            # Initialize FinBERT only when heavy LLM features are enabled and
            # we're not in offline/low-memory mode.
            if (
                FINBERT_AVAILABLE
                and settings.ENABLE_LLM_FEATURES
                and not settings.OFFLINE_MODE
            ):
                self.finbert_model = BertForSequenceClassification.from_pretrained(
                    "yiyanghkust/finbert-tone", 
                    num_labels=3
                )
                self.finbert_tokenizer = BertTokenizer.from_pretrained("yiyanghkust/finbert-tone")
                logging.info("FinBERT model initialized")
            else:
                logging.info("FinBERT initialization skipped (LLM features disabled or OFFLINE_MODE=true)")
                
            self.initialized = True
            
        except Exception as e:
            logging.error(f"Error initializing sentiment models: {e}")
            # Continue with basic functionality
            
    def analyze_vader(self, text: str) -> Optional[Dict]:
        """Analyze sentiment using VADER"""
        if not self.vader_analyzer:
            return None
            
        try:
            scores = self.vader_analyzer.polarity_scores(text)
            return {
                "positive": scores['pos'],
                "neutral": scores['neu'], 
                "negative": scores['neg'],
                "compound": scores['compound']
            }
        except Exception as e:
            logging.error(f"VADER analysis error: {e}")
            return None
    
    def analyze_finbert(self, text: str) -> Optional[Dict]:
        """Analyze sentiment using FinBERT"""
        if not self.finbert_model or not self.finbert_tokenizer:
            return None
            
        try:
            # Truncate text to model's max length
            inputs = self.finbert_tokenizer(
                text, 
                return_tensors="pt", 
                truncation=True, 
                max_length=512,
                padding=True
            )
            
            with torch.no_grad():
                outputs = self.finbert_model(**inputs)
                
            probs = torch.nn.functional.softmax(outputs.logits, dim=1)
            labels = ["negative", "neutral", "positive"]
            
            sentiment_idx = torch.argmax(probs).item()
            sentiment = labels[sentiment_idx]
            confidence = float(probs.max().item())
            
            return {
                "sentiment": sentiment,
                "confidence": confidence,
                "probabilities": {
                    "negative": float(probs[0][0]),
                    "neutral": float(probs[0][1]),
                    "positive": float(probs[0][2])
                }
            }
            
        except Exception as e:
            logging.error(f"FinBERT analysis error: {e}")
            return None
    
    def determine_market_impact(self, vader_result: Dict, finbert_result: Dict, commodity: str = None) -> tuple:
        """Determine market impact and severity based on sentiment analysis"""
        
        # Default values
        impact = "neutral"
        severity = "low"
        
        try:
            # Use FinBERT as primary, VADER as secondary
            if finbert_result:
                sentiment = finbert_result["sentiment"]
                confidence = finbert_result["confidence"]
                
                if sentiment == "positive" and confidence > 0.7:
                    impact = "bullish"
                    severity = "high" if confidence > 0.85 else "medium"
                elif sentiment == "negative" and confidence > 0.7:
                    impact = "bearish"
                    severity = "high" if confidence > 0.85 else "medium"
                    
            # Enhance with VADER compound score
            elif vader_result:
                compound = vader_result["compound"]
                
                if compound >= 0.5:
                    impact = "bullish"
                    severity = "high" if compound > 0.7 else "medium"
                elif compound <= -0.5:
                    impact = "bearish"
                    severity = "high" if compound < -0.7 else "medium"
                    
            # Commodity-specific adjustments
            if commodity in ["oil", "gas", "metals"] and impact == "bearish":
                # Supply disruptions often mean price increases for commodities
                if "supply" in impact or "disruption" in impact:
                    impact = "bullish"
                    
        except Exception as e:
            logging.error(f"Error determining market impact: {e}")
            
        return impact, severity
    
    async def analyze_comprehensive(self, request: SentimentRequest) -> SentimentResult:
        """Perform comprehensive sentiment analysis"""
        
        if not self.initialized:
            await self.initialize()
        
        # Analyze with both models
        vader_result = self.analyze_vader(request.text)
        finbert_result = self.analyze_finbert(request.text) if request.enhanced else None
        
        # Determine primary sentiment
        if finbert_result:
            primary_sentiment = finbert_result["sentiment"]
            confidence = finbert_result["confidence"]
        elif vader_result:
            compound = vader_result["compound"]
            if compound >= 0.05:
                primary_sentiment = "positive"
                confidence = abs(compound)
            elif compound <= -0.05:
                primary_sentiment = "negative"
                confidence = abs(compound)
            else:
                primary_sentiment = "neutral"
                confidence = 1 - abs(compound)
        else:
            # Fallback to basic analysis
            primary_sentiment = "neutral"
            confidence = 0.5
        
        # Map to trading sentiment
        sentiment_mapping = {
            "positive": "Bullish",
            "negative": "Bearish", 
            "neutral": "Neutral"
        }
        
        trading_sentiment = sentiment_mapping.get(primary_sentiment, "Neutral")
        
        # Determine market impact
        market_impact, severity = self.determine_market_impact(
            vader_result or {}, 
            finbert_result or {}, 
            request.commodity
        )
        
        return SentimentResult(
            sentiment=trading_sentiment,
            confidence=confidence,
            vader_scores=vader_result,
            finbert_result=finbert_result,
            commodity_specific=request.commodity is not None,
            market_impact=market_impact,
            severity=severity
        )

# Global instance
sentiment_analyzer = EnhancedSentimentAnalyzer()

async def analyze_market_sentiment(text: Optional[str] = None, commodity: str = None, enhanced: bool = False) -> Dict:
    """Main function for sentiment analysis"""

    if not text or not text.strip():
        text = "Overall commodity market sentiment based on recent news and price movements."

    request = SentimentRequest(
        text=text,
        commodity=commodity,
        enhanced=enhanced
    )
    
    result = await sentiment_analyzer.analyze_comprehensive(request)
    
    return {
        "sentiment": result.sentiment,
        "confidence": result.confidence,
        "market_impact": result.market_impact,
        "severity": result.severity,
        "commodity_specific": result.commodity_specific,
        "details": {
            "vader": result.vader_scores,
            "finbert": result.finbert_result
        }
    }
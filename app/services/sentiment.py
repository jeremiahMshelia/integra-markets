"""
Comprehensive sentiment analysis service for Integra Markets.
This service combines multiple sentiment analysis models to provide financial insights.
"""
import logging
import asyncio
from typing import Dict, Any, List, Optional
import nltk
from nltk.sentiment.vader import SentimentIntensityAnalyzer

# Import our smart sentiment analyzer (preprocessing + VADER + ML)
try:
    from services.smart_sentiment import analyze_financial_text as smart_analyze
    SMART_SENTIMENT_AVAILABLE = True
except ImportError:
    SMART_SENTIMENT_AVAILABLE = False
    logger.warning("Smart sentiment not available, using basic VADER only")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Download VADER lexicon if not already present
try:
    nltk.data.find('vader_lexicon')
except LookupError:
    logger.info("Downloading VADER lexicon for sentiment analysis")
    nltk.download('vader_lexicon', quiet=True)

class SentimentAnalyzer:
    """
    Ensemble sentiment analyzer that combines VADER and FinBERT models.
    Provides both general sentiment analysis and finance-specific analysis.
    """
    
    _instance = None  # Singleton instance
    
    def __new__(cls):
        """Implement singleton pattern for model reuse"""
        if cls._instance is None:
            cls._instance = super(SentimentAnalyzer, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        """Initialize the sentiment analyzer with VADER and FinBERT models"""
        if self._initialized:
            return
            
        logger.info("Initializing SentimentAnalyzer ensemble")
        self._initialized = True
        
        try:
            # Initialize VADER
            self.vader = SentimentIntensityAnalyzer()
            logger.info("VADER sentiment analyzer initialized")
            
            # FinBERT is already initialized in its own module
            logger.info("FinBERT integration ready")
            
            # Define sentiment mapping for consistency
            self.sentiment_map = {
                "bullish": "BULLISH",
                "bearish": "BEARISH", 
                "neutral": "NEUTRAL"
            }
            
            logger.info("Sentiment analysis ensemble initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing sentiment analyzer: {str(e)}")
            self._initialized = False
    
    async def analyze_text(self, text: str) -> Dict[str, Any]:
        """
        Analyze text sentiment using both VADER and FinBERT.
        
        Args:
            text: The text to analyze
            
        Returns:
            Dict containing the sentiment analysis results
        """
        if not text or not text.strip():
            return {
                "text": text,
                "vader": None,
                "finbert": None,
                "ensemble": {"sentiment": "NEUTRAL", "confidence": 0.5}
            }
        
        results = {
            "text": text,
            "vader": None,
            "finbert": None,
            "ensemble": None
        }
        
        # Run VADER analysis
        try:
            vader_result = self.vader.polarity_scores(text)
            results["vader"] = {
                "compound": vader_result["compound"],
                "positive": vader_result["pos"],
                "negative": vader_result["neg"],
                "neutral": vader_result["neu"]
            }
        except Exception as e:
            logger.error(f"Error in VADER analysis: {str(e)}")
        
        # Run Smart Sentiment analysis (or FinBERT if available)
        try:
            if SMART_SENTIMENT_AVAILABLE:
                # Use our smart analyzer (preprocessing + VADER + ML)
                smart_result = smart_analyze(text)
                results["finbert"] = smart_result
                logger.info(f"Using smart sentiment: {smart_result.get('method', 'unknown')}")
            else:
                # Fallback to basic VADER-based analysis
                logger.info("Using VADER-only fallback")
                results["finbert"] = None
        except Exception as e:
            logger.error(f"Error in sentiment analysis: {str(e)}")
        
        # Calculate ensemble result (combine VADER and FinBERT)
        results["ensemble"] = self._calculate_ensemble(results["vader"], results["finbert"])
        
        # Extract keywords and entities
        results["keywords"] = await self._extract_keywords(text)
        
        # Add market impact analysis
        results["market_impact"] = self._calculate_market_impact(results)
        
        return results
    
    async def analyze_article(self, article_id: int, article_text: str = None) -> Dict[str, Any]:
        """
        Analyze article sentiment by ID.
        
        Args:
            article_id: The ID of the article to analyze
            article_text: Optional text to analyze if not retrieving from database
            
        Returns:
            Dict containing the sentiment analysis results
        """
        # In a real implementation, we would retrieve the article from the database
        # For now, use the provided text or a placeholder
        if not article_text:
            # This would be replaced with a database query
            logger.info(f"Retrieving article with ID {article_id}")
            article_text = "OPEC+ announces unexpected production cuts of 1.1 million barrels per day starting in May, signaling a proactive approach to supporting oil prices amid global economic uncertainty."
        
        # Analyze the text
        analysis_result = await self.analyze_text(article_text)
        
        # Add article metadata
        analysis_result["article_id"] = article_id
        
        return analysis_result
    
    def _calculate_ensemble(self, vader_result: Dict[str, float], finbert_result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculate ensemble sentiment by combining VADER and FinBERT results.
        
        Args:
            vader_result: VADER analysis results
            finbert_result: FinBERT analysis results
            
        Returns:
            Dict containing the ensemble sentiment
        """
        # Handle missing results
        if not vader_result and not finbert_result:
            return {"sentiment": "NEUTRAL", "confidence": 0.5}
            
        if not vader_result:
            return {
                "sentiment": finbert_result.get("sentiment", "NEUTRAL"),
                "confidence": finbert_result.get("confidence", 0.5)
            }
            
        if not finbert_result:
            # Map VADER compound score to sentiment label
            sentiment = "NEUTRAL"
            confidence = 0.5
            
            if vader_result["compound"] > 0.05:
                sentiment = "BULLISH"
                confidence = 0.5 + (vader_result["compound"] * 0.5)  # Scale 0.05-1.0 to 0.5-1.0
            elif vader_result["compound"] < -0.05:
                sentiment = "BEARISH"
                confidence = 0.5 + (abs(vader_result["compound"]) * 0.5)  # Scale 0.05-1.0 to 0.5-1.0
                
            return {"sentiment": sentiment, "confidence": confidence}
        
        # Define weights for each model
        vader_weight = 0.3
        finbert_weight = 0.7
        
        # Map VADER compound score to sentiment label
        vader_sentiment = "NEUTRAL"
        if vader_result["compound"] > 0.05:
            vader_sentiment = "BULLISH"
        elif vader_result["compound"] < -0.05:
            vader_sentiment = "BEARISH"
        
        # Get FinBERT sentiment
        finbert_sentiment = finbert_result.get("sentiment", "NEUTRAL")
        
        # Create ensemble result
        ensemble = {}
        
        # If both models agree, use that sentiment with high confidence
        if vader_sentiment == finbert_sentiment:
            ensemble["sentiment"] = vader_sentiment
            ensemble["confidence"] = min(0.99, 0.8 + (0.2 * finbert_result.get("confidence", 0.5)))
        else:
            # Use weighted approach favoring FinBERT (more specialized for finance)
            ensemble["sentiment"] = finbert_sentiment
            ensemble["confidence"] = finbert_result.get("confidence", 0.5) * finbert_weight
            
            # Adjust confidence based on VADER strength
            if vader_sentiment != "NEUTRAL":
                ensemble["confidence"] *= (1 + (abs(vader_result["compound"]) * vader_weight))
                ensemble["confidence"] = min(0.99, ensemble["confidence"])  # Cap at 0.99
        
        return ensemble
    
    async def _extract_keywords(self, text: str) -> List[Dict[str, Any]]:
        """
        Extract keywords with sentiment scores.
        
        Args:
            text: The text to extract keywords from
            
        Returns:
            List of keywords with sentiment information
        """
        # Financial keywords to look for in text
        important_words = [
            "OPEC", "oil", "production", "cut", "barrel", "price", "market", "supply", "demand", 
            "inflation", "interest rate", "Fed", "reserve", "bank", "recession", "growth", "GDP",
            "earnings", "profit", "loss", "rally", "decline", "bullish", "bearish", "volatility"
        ]
        
        keywords = []
        
        for word in important_words:
            if word.lower() in text.lower():
                # For each found keyword, analyze its local sentiment context
                # In a real implementation, this would use more advanced NLP techniques
                try:
                    # Simple window-based approach (would be better with proper NLP parsing)
                    word_index = text.lower().find(word.lower())
                    start = max(0, word_index - 50)
                    end = min(len(text), word_index + 50)
                    context = text[start:end]
                    
                    # Get sentiment for this context
                    sentiment_score = self.vader.polarity_scores(context)["compound"]
                    sentiment_label = "positive" if sentiment_score > 0.05 else "negative" if sentiment_score < -0.05 else "neutral"
                    
                    keywords.append({
                        "word": word,
                        "sentiment": sentiment_label,
                        "score": abs(sentiment_score)
                    })
                except Exception as e:
                    logger.error(f"Error analyzing keyword context: {str(e)}")
        
        # Sort by score and take top 5
        keywords = sorted(keywords, key=lambda x: x["score"], reverse=True)[:5]
        
        return keywords
    
    def _calculate_market_impact(self, analysis_result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculate market impact based on sentiment analysis.
        
        Args:
            analysis_result: The sentiment analysis results
            
        Returns:
            Dict containing market impact assessment
        """
        ensemble = analysis_result.get("ensemble", {})
        
        if not ensemble:
            return {"impact": "UNKNOWN", "confidence": 0.0, "direction": "NEUTRAL"}
        
        sentiment = ensemble.get("sentiment", "NEUTRAL")
        confidence = ensemble.get("confidence", 0.5)
        
        # Determine impact level based on sentiment and confidence
        impact = "MEDIUM"
        if confidence > 0.8:
            if sentiment in ["BULLISH", "BEARISH"]:
                impact = "HIGH"
        elif confidence < 0.4:
            impact = "LOW"
        
        return {
            "impact": impact,
            "confidence": confidence,
            "direction": sentiment
        }

# Create singleton instance
sentiment_analyzer = SentimentAnalyzer()

async def analyze_text(text: str) -> Dict[str, Any]:
    """
    Analyze the sentiment of a text.
    
    Args:
        text: The text to analyze
        
    Returns:
        Dict containing the sentiment analysis results
    """
    return await sentiment_analyzer.analyze_text(text)

async def analyze_article(article_id: int) -> Dict[str, Any]:
    """
    Analyze the sentiment of an article by ID.
    
    Args:
        article_id: The ID of the article to analyze
        
    Returns:
        Dict containing the sentiment analysis results
    """
    return await sentiment_analyzer.analyze_article(article_id)

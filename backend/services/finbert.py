"""
FinBERT implementation for financial sentiment analysis.
This module uses Hugging Face Inference API for serverless sentiment analysis.
"""
import os
import logging
import requests
from typing import Dict, Any, Optional
from functools import lru_cache
from core.config import settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FinBERTAnalyzer:
    """
    Financial sentiment analyzer using Hugging Face Inference API.
    This serverless approach requires no model hosting.
    """
    
    _instance = None  # Singleton instance
    
    def __new__(cls):
        """Implement singleton pattern"""
        if cls._instance is None:
            cls._instance = super(FinBERTAnalyzer, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        """Initialize the FinBERT API client"""
        if self._initialized:
            return
            
        self._initialized = True
        
        # Get settings from config
        self.model_name = settings.FINBERT_MODEL
        self.hf_token = settings.HUGGING_FACE_TOKEN
        
        # API endpoint for FinBERT
        self.api_url = f"https://api-inference.huggingface.co/models/{self.model_name}"
        
        if not self.hf_token:
            logger.warning("No Hugging Face token found. API calls will be limited.")
        
        # Headers for API requests
        self.headers = {"Authorization": f"Bearer {self.hf_token}"} if self.hf_token else {}
        
        logger.info("FinBERT API client initialized")
    
    @lru_cache(maxsize=100)
    def _cached_analyze(self, text_hash: int, text: str) -> Dict[str, Any]:
        """Cached analysis to avoid repeated API calls"""
        return self._call_api(text)
    
    def _call_api(self, text: str) -> Dict[str, Any]:
        """Make API call to Hugging Face Inference API"""
        try:
            # Truncate text if too long
            if len(text) > 2048:
                text = text[:2048]
                logger.warning("Text truncated for API call")
            
            response = requests.post(
                self.api_url,
                headers=self.headers,
                json={"inputs": text},
                timeout=30
            )
            
            if response.status_code == 503:
                # Model is loading, retry after a delay
                logger.info("Model is loading, retrying in 20 seconds...")
                import time
                time.sleep(20)
                response = requests.post(
                    self.api_url,
                    headers=self.headers,
                    json={"inputs": text},
                    timeout=30
                )
            
            response.raise_for_status()
            result = response.json()
            
            # Parse the API response
            if isinstance(result, list) and len(result) > 0:
                # FinBERT returns: [{'label': 'positive', 'score': 0.9}, ...]
                scores_dict = {item['label'].lower(): item['score'] for item in result[0] if 'label' in item and 'score' in item}
                
                # Map to our format
                results = {
                    "bullish": scores_dict.get('positive', 0.0),
                    "bearish": scores_dict.get('negative', 0.0),
                    "neutral": scores_dict.get('neutral', 0.0)
                }
                
                # Get the most likely sentiment
                max_sentiment = max(results, key=results.get)
                sentiment_map = {
                    "bullish": "BULLISH",
                    "bearish": "BEARISH",
                    "neutral": "NEUTRAL"
                }
                
                results["sentiment"] = sentiment_map[max_sentiment]
                results["confidence"] = results[max_sentiment]
                
                return results
            else:
                logger.error(f"Unexpected API response format: {result}")
                raise ValueError("Invalid API response")
                
        except requests.exceptions.Timeout:
            logger.error("API request timed out")
            raise
        except requests.exceptions.RequestException as e:
            logger.error(f"API request failed: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Error in API call: {str(e)}")
            raise
    
    def analyze(self, text: str) -> Dict[str, Any]:
        """
        Analyze the sentiment of a financial text using HF Inference API.
        
        Args:
            text (str): The financial text to analyze
            
        Returns:
            Dict containing sentiment analysis results with confidence scores
        """
        if not text or not text.strip():
            return {
                "error": "Empty text",
                "bullish": 0.33,
                "bearish": 0.33,
                "neutral": 0.34,
                "sentiment": "NEUTRAL",
                "confidence": 0.34
            }
        
        try:
            # Use hash for caching (to avoid repeated API calls for same text)
            text_hash = hash(text[:500])  # Hash first 500 chars
            
            # Call the cached analysis function
            return self._cached_analyze(text_hash, text)
            
        except Exception as e:
            logger.error(f"Error analyzing text: {str(e)}")
            # Return neutral sentiment as fallback
            return {
                "error": str(e),
                "bullish": 0.33,
                "bearish": 0.33,
                "neutral": 0.34,
                "sentiment": "NEUTRAL",
                "confidence": 0.34
            }

# Create singleton instance
finbert_analyzer = FinBERTAnalyzer()

def analyze_financial_text(text: str) -> Dict[str, Any]:
    """
    Analyze financial text sentiment using FinBERT.
    
    Args:
        text (str): The financial text to analyze
        
    Returns:
        Dict containing sentiment analysis results
    """
    return finbert_analyzer.analyze(text)
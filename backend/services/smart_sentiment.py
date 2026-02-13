"""
Smart Sentiment Analysis using Preprocessing + VADER + Machine Learning
This replaces FinBERT with a more tailored approach for commodity markets
"""
import os
import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from functools import lru_cache
import pickle

# NLTK imports
try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
    VADER_AVAILABLE = True
except ImportError:
    VADER_AVAILABLE = False
    logging.warning("VADER not available")

# Import our preprocessing
from services.news_preprocessing import preprocess_news, create_pipeline_ready_output

logger = logging.getLogger(__name__)

class SmartSentimentAnalyzer:
    """
    Combines commodity-specific preprocessing with VADER sentiment
    and learns from user feedback to improve predictions
    """
    
    def __init__(self):
        self.vader = SentimentIntensityAnalyzer() if VADER_AVAILABLE else None
        
        # Feature weights (can be adjusted based on feedback)
        self.default_weights = {
            'vader_compound': 0.3,
            'event_type_impact': 0.25,
            'commodity_relevance': 0.2,
            'keyword_sentiment': 0.15,
            'severity_factor': 0.1
        }
        
        # Path for storing learning data
        self.data_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'data')
        os.makedirs(self.data_dir, exist_ok=True)
        
        self.feedback_file = os.path.join(self.data_dir, 'sentiment_feedback.json')
        self.weights_file = os.path.join(self.data_dir, 'sentiment_weights.pkl')
        
        # Load learned weights
        self.weights = self._load_weights()
        
        # Event type sentiment mappings
        self.event_sentiment_map = {
            'supply_shock': {'bullish': 0.8, 'bearish': 0.1, 'neutral': 0.1},
            'geopolitical_tension': {'bullish': 0.7, 'bearish': 0.2, 'neutral': 0.1},
            'weather_event': {'bullish': 0.6, 'bearish': 0.2, 'neutral': 0.2},
            'production_change': {'bullish': 0.3, 'bearish': 0.3, 'neutral': 0.4},
            'demand_shift': {'bullish': 0.4, 'bearish': 0.4, 'neutral': 0.2},
            'policy_change': {'bullish': 0.3, 'bearish': 0.3, 'neutral': 0.4},
            'infrastructure_disruption': {'bullish': 0.7, 'bearish': 0.2, 'neutral': 0.1},
            'market_movement': {'bullish': 0.33, 'bearish': 0.33, 'neutral': 0.34}
        }
        
        logger.info("Smart Sentiment Analyzer initialized")
    
    def analyze(self, text: str, commodity: Optional[str] = None) -> Dict[str, Any]:
        """
        Analyze sentiment using preprocessing + VADER + learned patterns
        """
        if not text or not text.strip():
            return self._neutral_response()
        
        # Step 1: Preprocess the text
        preprocessing = preprocess_news(text)
        
        # Step 2: Get VADER sentiment
        vader_scores = self._get_vader_scores(text) if self.vader else {}
        
        # Step 3: Calculate feature scores
        features = self._extract_features(text, preprocessing, vader_scores)
        
        # Step 4: Combine scores using weights
        sentiment_scores = self._calculate_sentiment_scores(features, preprocessing)
        
        # Step 5: Determine final sentiment
        result = self._determine_sentiment(sentiment_scores, preprocessing)
        
        # Add metadata
        result.update({
            'preprocessing': preprocessing,
            'features': features,
            'method': 'smart_sentiment',
            'commodity': preprocessing.get('commodity', commodity),
            'event_type': preprocessing.get('event_type'),
            'market_impact': preprocessing.get('market_impact'),
            'severity': preprocessing.get('severity'),
            'keywords': preprocessing.get('trigger_keywords', [])
        })
        
        return result
    
    def _get_vader_scores(self, text: str) -> Dict[str, float]:
        """Get VADER sentiment scores"""
        if not self.vader:
            return {'compound': 0, 'pos': 0, 'neg': 0, 'neu': 1}
        
        return self.vader.polarity_scores(text)
    
    def _extract_features(self, text: str, preprocessing: Dict, vader: Dict) -> Dict[str, float]:
        """Extract features for sentiment analysis"""
        features = {}
        
        # VADER compound score
        features['vader_compound'] = vader.get('compound', 0)
        
        # Event type impact
        event_type = preprocessing.get('event_type', 'market_movement')
        event_sentiment = self.event_sentiment_map.get(event_type, {})
        features['event_bullish'] = event_sentiment.get('bullish', 0.33)
        features['event_bearish'] = event_sentiment.get('bearish', 0.33)
        
        # Commodity relevance (confidence score from preprocessing)
        features['commodity_confidence'] = preprocessing.get('confidence_score', 0.5)
        
        # Severity factor
        severity_map = {'high': 0.9, 'medium': 0.6, 'low': 0.3}
        features['severity'] = severity_map.get(preprocessing.get('severity', 'low'), 0.3)
        
        # Keyword sentiment (from preprocessing market_impact)
        impact_map = {'bullish': 1.0, 'bearish': -1.0, 'neutral': 0.0}
        features['keyword_impact'] = impact_map.get(preprocessing.get('market_impact', 'neutral'), 0)
        
        # Additional features from text
        text_lower = text.lower()
        
        # Price movement indicators
        bullish_price_words = ['surge', 'soar', 'rally', 'jump', 'rise', 'gain', 'high']
        bearish_price_words = ['crash', 'plunge', 'fall', 'drop', 'low', 'decline', 'slump']
        
        features['bullish_price_count'] = sum(1 for word in bullish_price_words if word in text_lower)
        features['bearish_price_count'] = sum(1 for word in bearish_price_words if word in text_lower)
        
        return features
    
    def _calculate_sentiment_scores(self, features: Dict, preprocessing: Dict) -> Dict[str, float]:
        """Calculate sentiment scores using features and weights"""
        
        # Get current weights (either learned or default)
        weights = self.weights if self.weights else self.default_weights
        
        # Base scores from event type
        event_type = preprocessing.get('event_type', 'market_movement')
        base_scores = self.event_sentiment_map.get(event_type, {
            'bullish': 0.33,
            'bearish': 0.33,
            'neutral': 0.34
        })
        
        bullish_score = base_scores['bullish']
        bearish_score = base_scores['bearish']
        neutral_score = base_scores['neutral']
        
        # Adjust based on VADER
        vader_compound = features.get('vader_compound', 0)
        vader_weight = weights.get('vader_compound', 0.3)
        
        if vader_compound > 0.1:
            bullish_score += vader_compound * vader_weight
            bearish_score -= vader_compound * vader_weight * 0.5
        elif vader_compound < -0.1:
            bearish_score += abs(vader_compound) * vader_weight
            bullish_score -= abs(vader_compound) * vader_weight * 0.5
        else:
            neutral_score += (1 - abs(vader_compound)) * vader_weight * 0.5
        
        # Adjust based on severity
        severity_weight = weights.get('severity_factor', 0.1)
        severity = features.get('severity', 0.3)
        
        if preprocessing.get('market_impact') == 'bullish':
            bullish_score += severity * severity_weight
        elif preprocessing.get('market_impact') == 'bearish':
            bearish_score += severity * severity_weight
        
        # Adjust based on keyword counts
        keyword_weight = weights.get('keyword_sentiment', 0.15)
        bullish_keywords = features.get('bullish_price_count', 0)
        bearish_keywords = features.get('bearish_price_count', 0)
        
        if bullish_keywords > bearish_keywords:
            bullish_score += 0.1 * keyword_weight * bullish_keywords
        elif bearish_keywords > bullish_keywords:
            bearish_score += 0.1 * keyword_weight * bearish_keywords
        
        # Normalize scores
        total = bullish_score + bearish_score + neutral_score
        if total > 0:
            bullish_score /= total
            bearish_score /= total
            neutral_score /= total
        
        return {
            'bullish': round(bullish_score, 3),
            'bearish': round(bearish_score, 3),
            'neutral': round(neutral_score, 3)
        }
    
    def _determine_sentiment(self, scores: Dict[str, float], preprocessing: Dict) -> Dict[str, Any]:
        """Determine final sentiment from scores"""
        
        # Find dominant sentiment
        max_score = max(scores.values())
        
        if scores['bullish'] == max_score:
            sentiment = 'BULLISH'
            confidence = scores['bullish']
        elif scores['bearish'] == max_score:
            sentiment = 'BEARISH'
            confidence = scores['bearish']
        else:
            sentiment = 'NEUTRAL'
            confidence = scores['neutral']
        
        # Boost confidence if preprocessing agrees
        if preprocessing.get('market_impact', '').upper() == sentiment:
            confidence = min(0.95, confidence * 1.2)
        
        return {
            'bullish': scores['bullish'],
            'bearish': scores['bearish'],
            'neutral': scores['neutral'],
            'sentiment': sentiment,
            'confidence': round(confidence, 3)
        }
    
    def _neutral_response(self) -> Dict[str, Any]:
        """Return neutral sentiment as fallback"""
        return {
            'bullish': 0.33,
            'bearish': 0.33,
            'neutral': 0.34,
            'sentiment': 'NEUTRAL',
            'confidence': 0.34,
            'method': 'fallback'
        }
    
    def record_feedback(self, text: str, predicted_sentiment: str, actual_outcome: str, price_change: float):
        """
        Record user feedback to improve future predictions
        
        Args:
            text: The analyzed text
            predicted_sentiment: What we predicted (BULLISH/BEARISH/NEUTRAL)
            actual_outcome: What actually happened (UP/DOWN/FLAT)
            price_change: Percentage price change
        """
        feedback = {
            'timestamp': datetime.now().isoformat(),
            'text': text[:500],  # Store first 500 chars
            'predicted': predicted_sentiment,
            'actual': actual_outcome,
            'price_change': price_change,
            'preprocessing': preprocess_news(text)
        }
        
        # Load existing feedback
        feedback_data = []
        if os.path.exists(self.feedback_file):
            try:
                with open(self.feedback_file, 'r') as f:
                    feedback_data = json.load(f)
            except:
                pass
        
        # Add new feedback
        feedback_data.append(feedback)
        
        # Keep only last 1000 entries
        feedback_data = feedback_data[-1000:]
        
        # Save feedback
        with open(self.feedback_file, 'w') as f:
            json.dump(feedback_data, f, indent=2)
        
        # Update weights based on feedback
        self._update_weights(feedback_data)
    
    def _update_weights(self, feedback_data: List[Dict]):
        """Update feature weights based on feedback"""
        # This is a simple implementation
        # In production, you'd use more sophisticated ML here
        
        if len(feedback_data) < 10:
            return  # Not enough data
        
        # Calculate accuracy for different features
        # This is simplified - real implementation would use gradient descent or similar
        
        correct_predictions = 0
        total_predictions = 0
        
        for feedback in feedback_data[-100:]:  # Last 100 entries
            predicted = feedback['predicted']
            actual = feedback['actual']
            
            # Map actual outcome to sentiment
            if actual == 'UP' and predicted == 'BULLISH':
                correct_predictions += 1
            elif actual == 'DOWN' and predicted == 'BEARISH':
                correct_predictions += 1
            elif actual == 'FLAT' and predicted == 'NEUTRAL':
                correct_predictions += 1
            
            total_predictions += 1
        
        # Simple weight adjustment based on accuracy
        accuracy = correct_predictions / total_predictions if total_predictions > 0 else 0.5
        
        # If accuracy is low, adjust weights
        if accuracy < 0.6:
            # Reduce VADER weight, increase preprocessing weight
            self.weights['vader_compound'] = max(0.1, self.default_weights['vader_compound'] * 0.9)
            self.weights['event_type_impact'] = min(0.4, self.default_weights['event_type_impact'] * 1.1)
        
        # Save weights
        self._save_weights()
    
    def _load_weights(self) -> Dict[str, float]:
        """Load learned weights from file"""
        if os.path.exists(self.weights_file):
            try:
                with open(self.weights_file, 'rb') as f:
                    return pickle.load(f)
            except:
                pass
        return self.default_weights.copy()
    
    def _save_weights(self):
        """Save learned weights to file"""
        try:
            with open(self.weights_file, 'wb') as f:
                pickle.dump(self.weights, f)
        except Exception as e:
            logger.error(f"Error saving weights: {e}")

# Create singleton instance
smart_analyzer = SmartSentimentAnalyzer()

def analyze_financial_text(text: str) -> Dict[str, Any]:
    """
    Main entry point for sentiment analysis
    """
    return smart_analyzer.analyze(text)

def record_user_feedback(text: str, predicted: str, actual: str, price_change: float):
    """
    Record user feedback to improve the model
    """
    smart_analyzer.record_feedback(text, predicted, actual, price_change)

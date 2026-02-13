"""
Weather Alpha Sentiment Engine for Integra Markets
Combines VADER, NLTK, Hugging Face, and LangChain for comprehensive sentiment analysis
and summarization of market news and data related to commodities and weather impacts.
"""

import os
import logging
import asyncio
from typing import Dict, List, Any, Optional, Union
from datetime import datetime

import nltk
from nltk.sentiment.vader import SentimentIntensityAnalyzer
from nltk.tokenize import sent_tokenize
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer

try:
    from transformers import pipeline, AutoModelForSequenceClassification, AutoTokenizer
    import torch
    HUGGINGFACE_AVAILABLE = True
except ImportError:
    HUGGINGFACE_AVAILABLE = False

try:
    from langchain.llms import HuggingFaceHub
    from langchain.chains import LLMChain
    from langchain.prompts import PromptTemplate
    from langchain.text_splitter import RecursiveCharacterTextSplitter
    from langchain.chains.summarize import load_summarize_chain
    from langchain.docstore.document import Document
    from dotenv import load_dotenv
    LANGCHAIN_AVAILABLE = True
except ImportError:
    LANGCHAIN_AVAILABLE = False

# Configure logging
logger = logging.getLogger(__name__)

class WeatherAlphaSentimentEngine:
    """
    Integrated sentiment analysis engine combining VADER, NLTK, 
    Hugging Face and LangChain for weather-impacted market analysis
    """
    
    def __init__(self, huggingface_api_key=None):
        # Load environment variables
        load_dotenv()
        self.hf_api_key = huggingface_api_key or os.getenv("HUGGINGFACE_API_KEY")
        
        # Initialize NLTK components
        self._initialize_nltk()
        
        # Initialize Hugging Face models if available
        self.financial_sentiment_model = None
        self.summarizer = None
        if HUGGINGFACE_AVAILABLE:
            self._initialize_huggingface()
            
        # Initialize LangChain components if available
        self.llm = None
        self.text_splitter = None
        self.summary_chain = None
        if LANGCHAIN_AVAILABLE and self.hf_api_key:
            self._initialize_langchain()
            
        logger.info("Weather Alpha Sentiment Engine initialized")
    
    def _initialize_nltk(self):
        """Initialize NLTK components"""
        try:
            # Download necessary NLTK data if not already downloaded
            nltk.download('vader_lexicon', quiet=True)
            nltk.download('punkt', quiet=True)
            nltk.download('stopwords', quiet=True)
            nltk.download('wordnet', quiet=True)
            
            self.stop_words = set(stopwords.words('english'))
            self.lemmatizer = WordNetLemmatizer()
            self.vader = SentimentIntensityAnalyzer()
            
            # Add commodity-specific terms to VADER lexicon
            self._update_vader_lexicon()
            logger.info("NLTK components initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing NLTK components: {e}")
            self.vader = None
            self.stop_words = set()
            self.lemmatizer = None
    
    def _initialize_huggingface(self):
        """Initialize Hugging Face models"""
        try:
            # Initialize FinBERT model for financial sentiment analysis
            self.financial_sentiment_model = pipeline(
                "text-classification",
                model="ProsusAI/finbert",
                return_all_scores=True
            )
            
            # Initialize summarization model
            self.summarizer = pipeline(
                "summarization",
                model="facebook/bart-large-cnn"
            )
            logger.info("Hugging Face models initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing Hugging Face models: {e}")
            self.financial_sentiment_model = None
            self.summarizer = None
    
    def _initialize_langchain(self):
        """Initialize LangChain components"""
        try:
            # Initialize HuggingFaceHub LLM
            self.llm = HuggingFaceHub(
                repo_id="google/flan-t5-large",
                huggingface_api_token=self.hf_api_key
            )
            
            # Initialize text splitter for handling long documents
            self.text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1000,
                chunk_overlap=200
            )
            
            # Initialize summarization chain
            self.summary_template = """
            Summarize the following text about {commodity} markets and weather conditions:
            
            {text}
            
            Summary:
            """
            
            self.summary_prompt = PromptTemplate(
                input_variables=["text", "commodity"],
                template=self.summary_template
            )
            
            self.summary_chain = LLMChain(
                llm=self.llm,
                prompt=self.summary_prompt
            )
            logger.info("LangChain components initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing LangChain components: {e}")
            self.llm = None
            self.text_splitter = None
            self.summary_chain = None
    
    def _update_vader_lexicon(self):
        """Update VADER lexicon with commodity-specific and weather-related terms"""
        if not hasattr(self, 'vader') or self.vader is None:
            return
            
        # Natural gas and energy terms
        self.vader.lexicon.update({
            "freeze": 0.6,
            "cold snap": 0.7,
            "pipeline": 0.0,  # Neutral by default
            "storage draw": 0.5,
            "heating demand": 0.6,
            "production increase": -0.5,
            "oversupply": -0.7,
            "mild": -0.4,
            "lng export": 0.5,
            "rig count": 0.0,
            "power generation": 0.3,
        })
        
        # Agricultural terms
        self.vader.lexicon.update({
            "drought": 0.7,
            "rainfall": 0.0,  # Context-dependent
            "harvest": 0.0,
            "crop damage": 0.8,
            "bumper crop": -0.7,
            "yield": 0.0,
            "planting": 0.0,
            "frost": 0.6,
            "irrigation": -0.2,
            "fertilizer": 0.0,
        })
        
        # Weather terms
        self.vader.lexicon.update({
            "storm": 0.0,
            "hurricane": 0.5,
            "flood": 0.6,
            "normal conditions": -0.3,
            "favorable weather": -0.5,
            "heat wave": 0.7,
            "el niño": 0.0,
            "la niña": 0.0,
            "precipitation": 0.0,
            "severe weather": 0.6,
        })
        
        # Precious metals terms
        self.vader.lexicon.update({
            "inflation": 0.6,
            "rate hike": -0.5,
            "rate cut": 0.6,
            "safe haven": 0.5,
            "geopolitical tensions": 0.6,
            "central bank buying": 0.7,
            "etf outflow": -0.6,
            "physical demand": 0.5,
        })
        
        logger.info("VADER lexicon updated with commodity and weather terms")
    
    def preprocess_text(self, text: str) -> tuple:
        """
        Preprocess text using NLTK
        Returns tuple of (processed_sentences, processed_text)
        """
        if not text:
            return [], ""
            
        try:
            # Tokenize into sentences
            sentences = sent_tokenize(text)
            
            # Process each sentence
            processed_sentences = []
            
            for sentence in sentences:
                # Tokenize words
                tokens = nltk.word_tokenize(sentence)
                
                # Remove stopwords and lemmatize
                processed_tokens = [
                    self.lemmatizer.lemmatize(token.lower()) 
                    for token in tokens 
                    if token.lower() not in self.stop_words and token.isalnum()
                ]
                
                if processed_tokens:
                    processed_sentences.append(" ".join(processed_tokens))
            
            return processed_sentences, " ".join(processed_sentences)
        except Exception as e:
            logger.error(f"Error preprocessing text: {e}")
            return [], text
    
    async def analyze_basic_sentiment(self, text: str) -> Dict[str, Any]:
        """Analyze text sentiment using VADER"""
        if not text or not hasattr(self, 'vader') or self.vader is None:
            return {
                "sentiment": "NEUTRAL",
                "compound_score": 0.0,
                "scores": {"compound": 0.0, "pos": 0.0, "neg": 0.0, "neu": 1.0},
                "source": "fallback"
            }
        
        try:
            # Get VADER sentiment scores
            sentiment_scores = self.vader.polarity_scores(text)
            
            # Determine sentiment category
            compound_score = sentiment_scores['compound']
            
            if compound_score >= 0.3:
                sentiment = "BULLISH"
            elif compound_score <= -0.3:
                sentiment = "BEARISH"
            else:
                sentiment = "NEUTRAL"
            
            return {
                "sentiment": sentiment,
                "compound_score": compound_score,
                "scores": sentiment_scores,
                "source": "vader"
            }
        except Exception as e:
            logger.error(f"Error analyzing sentiment with VADER: {e}")
            return {
                "sentiment": "NEUTRAL",
                "compound_score": 0.0,
                "scores": {"compound": 0.0, "pos": 0.0, "neg": 0.0, "neu": 1.0},
                "source": "fallback"
            }
    
    async def analyze_financial_sentiment(self, text: str) -> Dict[str, Any]:
        """Analyze financial sentiment using Hugging Face FinBERT"""
        if not text or not self.financial_sentiment_model:
            return {
                "sentiment": "NEUTRAL",
                "confidence": 0.5,
                "scores": {"positive": 0.33, "neutral": 0.34, "negative": 0.33},
                "source": "fallback"
            }
        
        try:
            # Get FinBERT sentiment
            results = self.financial_sentiment_model(text)
            
            # Process results
            sentiment_scores = {item['label']: item['score'] for item in results[0]}
            
            # Determine overall sentiment
            if sentiment_scores['positive'] > sentiment_scores['negative'] and sentiment_scores['positive'] > sentiment_scores['neutral']:
                sentiment = "BULLISH"
                confidence = sentiment_scores['positive']
            elif sentiment_scores['negative'] > sentiment_scores['positive'] and sentiment_scores['negative'] > sentiment_scores['neutral']:
                sentiment = "BEARISH"
                confidence = sentiment_scores['negative']
            else:
                sentiment = "NEUTRAL"
                confidence = sentiment_scores['neutral']
            
            return {
                "sentiment": sentiment,
                "confidence": confidence,
                "scores": sentiment_scores,
                "source": "finbert"
            }
        except Exception as e:
            logger.error(f"Error analyzing sentiment with FinBERT: {e}")
            return {
                "sentiment": "NEUTRAL",
                "confidence": 0.5,
                "scores": {"positive": 0.33, "neutral": 0.34, "negative": 0.33},
                "source": "fallback"
            }
    
    async def generate_summary(self, text: str, commodity: str) -> Optional[str]:
        """Generate summary using LangChain and Hugging Face"""
        if not text:
            return None
            
        # For shorter texts, use Hugging Face directly
        if len(text) < 1000 and self.summarizer:
            try:
                summary = self.summarizer(text, max_length=150, min_length=30, do_sample=False)
                return summary[0]['summary_text']
            except Exception as e:
                logger.error(f"Error with HF summarizer: {e}")
                # Fall back to LangChain
        
        # For longer texts, use LangChain with text splitting
        if self.llm and self.text_splitter:
            try:
                # Split text into chunks
                chunks = self.text_splitter.split_text(text)
                
                if len(chunks) == 1:
                    # Single chunk - direct summarization
                    return await self.summary_chain.arun(text=text, commodity=commodity)
                else:
                    # Multiple chunks - map-reduce summarization
                    map_template = f"Summarize this section about {commodity}:\n\n" + "{text}"
                    map_prompt = PromptTemplate(template=map_template, input_variables=["text"])
                    
                    reduce_template = f"Combine these summaries about {commodity} into a cohesive summary:\n\n" + "{text}"
                    reduce_prompt = PromptTemplate(template=reduce_template, input_variables=["text"])
                    
                    summary_chain = load_summarize_chain(
                        self.llm,
                        chain_type="map_reduce",
                        map_prompt=map_prompt,
                        combine_prompt=reduce_prompt
                    )
                    
                    docs = [Document(page_content=chunk) for chunk in chunks]
                    return await summary_chain.arun(docs)
                    
            except Exception as e:
                logger.error(f"Error in LangChain summarization: {e}")
                # Fallback to simple extraction summarization
        
        # Final fallback - extract first few sentences
        try:
            sentences = sent_tokenize(text)
            return " ".join(sentences[:3])
        except:
            return text[:200] + "..."
    
    async def comprehensive_analysis(self, 
                                     text: str, 
                                     commodity: str, 
                                     premium_tier: bool = False) -> Dict[str, Any]:
        """
        Perform comprehensive sentiment analysis and summarization
        
        Args:
            text: Text to analyze
            commodity: Commodity name or category
            premium_tier: Whether to include premium features
            
        Returns:
            Dictionary with analysis results
        """
        if not text:
            return {
                "text_length": 0,
                "commodity": commodity,
                "vader_sentiment": {
                    "sentiment": "NEUTRAL", 
                    "compound_score": 0.0, 
                    "source": "fallback"
                },
                "timestamp": datetime.now().isoformat()
            }
        
        # Preprocess text
        processed_sentences, processed_text = self.preprocess_text(text)
        
        # Get basic VADER sentiment
        vader_sentiment = await self.analyze_basic_sentiment(text)
        
        result = {
            "text_length": len(text),
            "commodity": commodity,
            "vader_sentiment": vader_sentiment,
            "processed_text_length": len(processed_text),
            "timestamp": datetime.now().isoformat()
        }
        
        # For premium tier or shorter texts, add FinBERT analysis
        if premium_tier or len(text) < 3000:
            finbert_sentiment = await self.analyze_financial_sentiment(text)
            result["finbert_sentiment"] = finbert_sentiment
            
            # Combined sentiment (weighted average)
            vader_weight = 0.4
            finbert_weight = 0.6
            
            # Convert sentiment to numeric score for combination
            vader_score = vader_sentiment["compound_score"]
            
            # Convert FinBERT scores to -1 to 1 scale
            finbert_numeric = finbert_sentiment["scores"].get("positive", 0.33) - finbert_sentiment["scores"].get("negative", 0.33)
            
            # Calculate weighted score
            combined_score = (vader_score * vader_weight) + (finbert_numeric * finbert_weight)
            
            # Determine sentiment category
            if combined_score >= 0.3:
                combined_sentiment = "BULLISH"
            elif combined_score <= -0.3:
                combined_sentiment = "BEARISH"
            else:
                combined_sentiment = "NEUTRAL"
            
            # Calculate confidence based on agreement
            if combined_sentiment == vader_sentiment["sentiment"] and combined_sentiment == finbert_sentiment["sentiment"]:
                confidence = 0.8 + (abs(combined_score) * 0.2)  # High confidence if all agree
            else:
                confidence = 0.5 + (abs(combined_score) * 0.3)  # Moderate confidence
            
            result["combined"] = {
                "sentiment": combined_sentiment,
                "score": combined_score,
                "confidence": min(confidence, 0.95)  # Cap at 0.95
            }
        
        # Generate summary for premium tier
        if premium_tier:
            summary = await self.generate_summary(text, commodity)
            if summary:
                result["summary"] = summary
        
        return result

    async def analyze_weather_impact(self, 
                                    weather_data: Dict[str, Any], 
                                    commodity: str) -> Dict[str, Any]:
        """
        Analyze weather data for potential impact on commodity
        
        Args:
            weather_data: Dictionary of weather data
            commodity: Commodity to analyze
            
        Returns:
            Dictionary with analysis results
        """
        # Construct text for analysis from weather data
        weather_text = f"Weather data for {commodity}: "
        for key, value in weather_data.items():
            weather_text += f"{key}: {value}. "
        
        # Get sentiment
        sentiment = await self.analyze_basic_sentiment(weather_text)
        
        # Construct result
        result = {
            "commodity": commodity,
            "sentiment": sentiment["sentiment"],
            "score": sentiment["compound_score"],
            "details": weather_data,
            "timestamp": datetime.now().isoformat()
        }
        
        return result

# Initialize singleton instance
sentiment_engine = WeatherAlphaSentimentEngine()
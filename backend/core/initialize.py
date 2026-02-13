"""
Initialization module to set up NLTK and other dependencies for the application.
Run this during app startup to ensure all required data is available.
"""
import os
import logging
import nltk
from core.config import settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def setup_nltk():
    """
    Set up NLTK data required for sentiment analysis.
    Downloads necessary NLTK datasets if they don't exist.
    """
    # Create NLTK data directory if it doesn't exist
    os.makedirs(settings.NLTK_DATA_PATH, exist_ok=True)
    
    # Set NLTK data path
    nltk.data.path.append(settings.NLTK_DATA_PATH)
    
    # Required NLTK datasets for VADER sentiment analysis
    required_nltk_data = [
        'vader_lexicon',
        'punkt',
        'stopwords',
        'wordnet'
    ]
    
    # Download required NLTK data if not already available
    for dataset in required_nltk_data:
        try:
            nltk.data.find(f'tokenizers/{dataset}')
            logger.info(f"NLTK dataset '{dataset}' already exists")
        except LookupError:
            logger.info(f"Downloading NLTK dataset '{dataset}'")
            nltk.download(dataset, download_dir=settings.NLTK_DATA_PATH)
    
    logger.info("NLTK setup completed successfully")

def initialize_app():
    """
    Initialize all required data and dependencies for the application.
    """
    logger.info("Initializing Integra Markets application...")
    
    # Set up NLTK
    setup_nltk()
    
    # Check for required API keys
    if not settings.ALPHA_VANTAGE_API_KEY:
        logger.warning("Alpha Vantage API key not found. Market data features will be limited.")
    
    if not settings.HUGGING_FACE_TOKEN:
        logger.warning("Hugging Face token not found. FinBERT model may have download limitations.")
    
    logger.info("Application initialization completed")

# Export initialization function
__all__ = ['initialize_app']
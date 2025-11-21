"""
Database connection module for Integra Markets.
Provides a Supabase client connection and database utilities.
"""
import os
import logging
from typing import Dict, Any, Optional, List, Generator
from dotenv import load_dotenv
from supabase import create_client, Client
from sqlalchemy import create_engine, MetaData, Column, Integer, String, Boolean, DateTime, Text, Float, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from sqlalchemy.pool import StaticPool
from core.config import settings

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# SQLAlchemy base model
Base = declarative_base()

# Create SQLAlchemy engine for SQLite
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create the tables
def create_db_and_tables():
    """Create database tables"""
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Failed to create database tables: {str(e)}")
        raise

class Database:
    """
    Database connection manager for Supabase.
    Implements a singleton pattern to ensure a single connection is reused.
    """
    _instance = None
    
    def __new__(cls):
        """
        Create a new instance if one doesn't exist, otherwise return the existing instance.
        Implements the singleton pattern.
        """
        if cls._instance is None:
            cls._instance = super(Database, cls).__new__(cls)
            cls._instance._initialize()
        return cls._instance
    
    def _initialize(self):
        """Initialize the Supabase client connection."""
        try:
            # Get connection details from environment variables or settings
            self.url = settings.SUPABASE_URL
            self.key = settings.SUPABASE_KEY
            
            # Validate configuration
            if not self.url or not self.key:
                logger.warning("Missing Supabase configuration. Some features will be disabled.")
                self.client = None
                return
            
            # Create client
            self.client = create_client(self.url, self.key)
            logger.info("Supabase client initialized successfully")
            
            # Test connection (only if we have credentials)
            if self.client:
                self._test_connection()
            
        except Exception as e:
            logger.error(f"Failed to initialize Supabase client: {str(e)}")
            self.client = None
    
    def _test_connection(self):
        """Test the database connection."""
        try:
            # Simple query to test connection
            result = self.client.table('health_check').select('*').limit(1).execute()
            logger.info("Database connection test successful")
        except Exception as e:
            logger.warning(f"Database connection test failed: {str(e)}")
            # Don't raise the exception, just log the warning
    
    def get_client(self) -> Optional[Client]:
        """
        Get the Supabase client instance.
        
        Returns:
            Optional[Client]: The Supabase client or None if initialization failed
        """
        return self.client
    
    # User management methods
    async def create_user(self, user_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new user in the database.
        
        Args:
            user_data: Dictionary containing user information
            
        Returns:
            Dict containing the created user information
        """
        if not self.client:
            logger.warning("Supabase client not available. User creation skipped.")
            return user_data

        try:
            # Insert user data
            result = self.client.table('users').insert(user_data).execute()
            
            # Check for errors
            if 'error' in result:
                logger.error(f"Error creating user: {result['error']}")
                raise ValueError(result['error'])
            
            # Return the created user
            return result['data'][0] if result.get('data') else {}
            
        except Exception as e:
            logger.error(f"Failed to create user: {str(e)}")
            raise
    
    async def get_user_by_id(self, user_id: int) -> Optional[Dict[str, Any]]:
        """
        Get user by ID.
        
        Args:
            user_id: The user ID
            
        Returns:
            Dict containing the user information or None if not found
        """
        if not self.client:
            logger.warning("Supabase client not available. User lookup skipped.")
            return None

        try:
            result = self.client.table('users').select('*').eq('id', user_id).execute()
            
            # Check for errors
            if 'error' in result:
                logger.error(f"Error fetching user: {result['error']}")
                return None
            
            # Return the user or None
            return result['data'][0] if result.get('data') and len(result['data']) > 0 else None
            
        except Exception as e:
            logger.error(f"Failed to get user: {str(e)}")
            return None
    
    # Alert preferences methods
    async def get_alert_preferences(self, user_id: int) -> Dict[str, Any]:
        """
        Get alert preferences for a user.
        
        Args:
            user_id: The user ID
            
        Returns:
            Dict containing the user's alert preferences
        """
        if not self.client:
            logger.warning("Supabase client not available. Alert preferences lookup skipped.")
            return {}

        try:
            # Get alert preferences
            result = self.client.table('alert_preferences').select('*').eq('user_id', user_id).execute()
            
            # If no preferences exist yet, return empty dict
            if not result.get('data') or len(result['data']) == 0:
                return {}
            
            # Get the preferences record
            preferences = result['data'][0]
            
            # Get keywords for this user
            keywords_result = self.client.table('keyword_alerts').select('*').eq('user_id', user_id).execute()
            keywords = keywords_result.get('data', [])
            
            # Get sources for this user
            sources_result = self.client.table('source_alerts').select('*').eq('user_id', user_id).execute()
            sources = sources_result.get('data', [])
            
            # Combine everything into a single preferences object
            return {
                **preferences,
                'keywords': keywords,
                'sources': sources
            }
            
        except Exception as e:
            logger.error(f"Failed to get alert preferences: {str(e)}")
            return {}
    
    async def update_alert_preferences(self, user_id: int, preferences: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update alert preferences for a user.
        
        Args:
            user_id: The user ID
            preferences: Dictionary containing preferences to update
            
        Returns:
            Dict containing the updated preferences
        """
        if not self.client:
            logger.warning("Supabase client not available. Alert preferences update skipped.")
            return preferences

        try:
            # Extract keywords and sources from preferences
            keywords = preferences.pop('keywords', None)
            sources = preferences.pop('sources', None)
            
            # Update or insert preferences
            result = self.client.table('alert_preferences').upsert({
                'user_id': user_id,
                **preferences,
                'updated_at': 'now()'  # Use PostgreSQL now() function
            }).execute()
            
            # Update keywords if provided
            if keywords is not None:
                # Delete existing keywords
                self.client.table('keyword_alerts').delete().eq('user_id', user_id).execute()
                
                # Add new keywords
                if keywords:
                    keyword_records = [{'user_id': user_id, 'keyword': k['keyword'], 'active': k.get('active', True)} 
                                      for k in keywords]
                    self.client.table('keyword_alerts').insert(keyword_records).execute()
            
            # Update sources if provided
            if sources is not None:
                # Delete existing sources
                self.client.table('source_alerts').delete().eq('user_id', user_id).execute()
                
                # Add new sources
                if sources:
                    source_records = [{'user_id': user_id, 'url': s['url'], 'active': s.get('active', True)} 
                                     for s in sources]
                    self.client.table('source_alerts').insert(source_records).execute()
            
            # Return updated preferences
            return await self.get_alert_preferences(user_id)
            
        except Exception as e:
            logger.error(f"Failed to update alert preferences: {str(e)}")
            raise

# Create a singleton instance
db = Database()

# Export the client getter function
def get_db_client() -> Optional[Client]:
    """
    Get the Supabase client instance.
    
    Returns:
        Optional[Client]: The Supabase client or None if initialization failed
    """
    return db.get_client()

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Helper function to get a database session
def get_db_session() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

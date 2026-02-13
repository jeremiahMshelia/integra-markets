import logging
from core.database import create_db_and_tables

logger = logging.getLogger(__name__)

async def init_db():
    """Initialize database tables using SQLAlchemy"""
    try:
        # Create tables (synchronous operation)
        create_db_and_tables()
        logger.info("Database initialized successfully via SQLAlchemy")
    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        # Don't raise, allowing app to start even if DB init fails (e.g. if tables exist)

async def close_db():
    """Close database connections (No-op for SQLAlchemy with connection pooling)"""
    pass


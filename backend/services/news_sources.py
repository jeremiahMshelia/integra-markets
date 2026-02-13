"""
News source management service for user submissions and system sources.
"""
import re
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from models.news import NewsSource, UserSourceSubmission
from models.users import User
from core.config import settings

# Configure logging
logger = logging.getLogger(__name__)

class NewsSourceService:
    """Service for managing news sources and user submissions"""
    
    @staticmethod
    def validate_url(url: str) -> bool:
        """
        Validate if a string is a valid URL.
        
        Args:
            url: String to validate as URL
            
        Returns:
            bool: True if valid URL, False otherwise
        """
        # Basic URL validation pattern
        pattern = re.compile(
            r'^(https?://)?(www\.)?'  # http:// or https:// or www.
            r'([a-zA-Z0-9-]+\.)*'     # domain parts
            r'[a-zA-Z0-9-]+'          # final domain part
            r'\.[a-zA-Z]{2,}'         # TLD
            r'(/.*)?$'                # optional path
        )
        return bool(pattern.match(url))
    
    @staticmethod
    def normalize_url(url: str) -> str:
        """
        Normalize a URL for consistency.
        
        Args:
            url: URL to normalize
            
        Returns:
            str: Normalized URL
        """
        # Add https:// if missing
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        
        # Remove trailing slash
        if url.endswith('/'):
            url = url[:-1]
            
        return url
    
    @staticmethod
    def extract_source_name(url: str) -> str:
        """
        Extract a human-readable source name from a URL.
        
        Args:
            url: URL to extract name from
            
        Returns:
            str: Extracted source name
        """
        # Remove protocol
        clean_url = re.sub(r'^https?://', '', url)
        
        # Remove www.
        clean_url = re.sub(r'^www\.', '', clean_url)
        
        # Get domain without path
        domain = clean_url.split('/')[0]
        
        # Get the main part of the domain (without TLD)
        parts = domain.split('.')
        if len(parts) > 1:
            return parts[-2].capitalize()
        
        return domain.capitalize()
    
    @staticmethod
    def get_sources(db: Session, skip: int = 0, limit: int = 100, 
                    active_only: bool = True, verified_only: bool = False) -> List[NewsSource]:
        """
        Get a list of news sources.
        
        Args:
            db: Database session
            skip: Number of records to skip
            limit: Maximum number of records to return
            active_only: Only return active sources
            verified_only: Only return verified sources
            
        Returns:
            List[NewsSource]: List of news sources
        """
        query = db.query(NewsSource)
        
        if active_only:
            query = query.filter(NewsSource.is_active == True)
            
        if verified_only:
            query = query.filter(NewsSource.is_verified == True)
            
        return query.offset(skip).limit(limit).all()
    
    @staticmethod
    def get_source_by_url(db: Session, url: str) -> Optional[NewsSource]:
        """
        Get a news source by URL.
        
        Args:
            db: Database session
            url: URL to search for
            
        Returns:
            Optional[NewsSource]: NewsSource if found, None otherwise
        """
        # Normalize the URL first
        normalized_url = NewsSourceService.normalize_url(url)
        return db.query(NewsSource).filter(NewsSource.url == normalized_url).first()
    
    @staticmethod
    def create_source(db: Session, name: str, url: str, description: Optional[str] = None,
                      user_id: Optional[int] = None, is_verified: bool = False) -> NewsSource:
        """
        Create a new news source.
        
        Args:
            db: Database session
            name: Name of the source
            url: URL of the source
            description: Optional description
            user_id: Optional ID of the user who submitted the source
            is_verified: Whether the source is verified
            
        Returns:
            NewsSource: The created news source
        """
        # Validate the URL
        if not NewsSourceService.validate_url(url):
            raise ValueError(f"Invalid URL: {url}")
        
        # Normalize the URL
        normalized_url = NewsSourceService.normalize_url(url)
        
        # Check if source already exists
        existing_source = NewsSourceService.get_source_by_url(db, normalized_url)
        if existing_source:
            return existing_source
        
        # Create the new source
        source = NewsSource(
            name=name,
            url=normalized_url,
            description=description,
            is_active=True,
            is_verified=is_verified,
            is_user_submitted=user_id is not None,
            added_by_user_id=user_id
        )
        
        db.add(source)
        db.commit()
        db.refresh(source)
        
        return source
    
    @staticmethod
    def submit_source(db: Session, user_id: int, url: str, name: Optional[str] = None, 
                      description: Optional[str] = None) -> Dict[str, Any]:
        """
        Submit a new news source for approval.
        
        Args:
            db: Database session
            user_id: ID of the user submitting the source
            url: URL of the source
            name: Optional name of the source
            description: Optional description
            
        Returns:
            Dict[str, Any]: Response with status and submission details
        """
        # Get the user
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {"status": "error", "message": "User not found"}
        
        # Check if user has reached their limit
        if user.max_custom_sources is not None:
            submitted_count = db.query(NewsSource).filter(
                NewsSource.added_by_user_id == user_id
            ).count()
            
            if submitted_count >= user.max_custom_sources:
                return {
                    "status": "error", 
                    "message": f"You have reached your limit of {user.max_custom_sources} custom sources"
                }
        
        # Validate the URL
        if not NewsSourceService.validate_url(url):
            return {"status": "error", "message": f"Invalid URL: {url}"}
        
        # Normalize the URL
        normalized_url = NewsSourceService.normalize_url(url)
        
        # Check if source already exists
        existing_source = NewsSourceService.get_source_by_url(db, normalized_url)
        if existing_source:
            # Check if the user has already submitted this source
            existing_submission = db.query(UserSourceSubmission).filter(
                UserSourceSubmission.user_id == user_id,
                UserSourceSubmission.source_id == existing_source.id
            ).first()
            
            if existing_submission:
                return {
                    "status": "info", 
                    "message": "You have already submitted this source",
                    "source": existing_source
                }
            
            # Create a new submission record for an existing source
            submission = UserSourceSubmission(
                user_id=user_id,
                source_id=existing_source.id,
                status="approved" if existing_source.is_verified else "pending"
            )
            
            db.add(submission)
            db.commit()
            db.refresh(submission)
            
            # Subscribe the user to this source
            if existing_source not in user.subscribed_sources:
                user.subscribed_sources.append(existing_source)
                db.commit()
            
            return {
                "status": "success", 
                "message": "Source already exists and has been added to your subscriptions",
                "source": existing_source,
                "submission": submission
            }
        
        # Determine the source name if not provided
        if not name:
            name = NewsSourceService.extract_source_name(normalized_url)
        
        # Create the new source (unverified)
        source = NewsSource(
            name=name,
            url=normalized_url,
            description=description,
            is_active=True,
            is_verified=False,
            is_user_submitted=True,
            added_by_user_id=user_id
        )
        
        db.add(source)
        db.commit()
        db.refresh(source)
        
        # Create a submission record
        submission = UserSourceSubmission(
            user_id=user_id,
            source_id=source.id,
            status="pending"
        )
        
        db.add(submission)
        db.commit()
        db.refresh(submission)
        
        # Subscribe the user to this source
        user.subscribed_sources.append(source)
        db.commit()
        
        return {
            "status": "success", 
            "message": "Source submitted successfully and is pending approval",
            "source": source,
            "submission": submission
        }
    
    @staticmethod
    def process_submission(db: Session, submission_id: int, approve: bool, 
                          notes: Optional[str] = None) -> Dict[str, Any]:
        """
        Process a user's source submission (approve or reject).
        
        Args:
            db: Database session
            submission_id: ID of the submission to process
            approve: Whether to approve or reject the submission
            notes: Optional notes for the decision
            
        Returns:
            Dict[str, Any]: Response with status and details
        """
        # Get the submission
        submission = db.query(UserSourceSubmission).filter(
            UserSourceSubmission.id == submission_id
        ).first()
        
        if not submission:
            return {"status": "error", "message": "Submission not found"}
        
        # Don't process if already processed
        if submission.status != "pending":
            return {
                "status": "error", 
                "message": f"Submission has already been {submission.status}"
            }
        
        # Get the source
        source = db.query(NewsSource).filter(NewsSource.id == submission.source_id).first()
        if not source:
            return {"status": "error", "message": "Source not found"}
        
        # Update the submission
        submission.status = "approved" if approve else "rejected"
        submission.notes = notes
        submission.processed_at = datetime.utcnow()
        
        # Update the source if approved
        if approve:
            source.is_verified = True
        else:
            # For rejected sources, we keep them but mark as inactive if no other approved submissions
            other_approved = db.query(UserSourceSubmission).filter(
                UserSourceSubmission.source_id == source.id,
                UserSourceSubmission.status == "approved"
            ).first()
            
            if not other_approved:
                source.is_active = False
        
        db.commit()
        db.refresh(submission)
        db.refresh(source)
        
        return {
            "status": "success",
            "message": f"Submission has been {submission.status}",
            "submission": submission,
            "source": source
        }
    
    @staticmethod
    def get_user_sources(db: Session, user_id: int) -> Dict[str, List]:
        """
        Get all sources related to a user (submitted, subscribed, pending).
        
        Args:
            db: Database session
            user_id: ID of the user
            
        Returns:
            Dict[str, List]: Dictionary of user-related sources
        """
        # Get the user
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {
                "submitted": [],
                "subscribed": [],
                "pending": []
            }
        
        # Get submitted sources
        submitted = db.query(NewsSource).filter(
            NewsSource.added_by_user_id == user_id
        ).all()
        
        # Get subscribed sources
        subscribed = user.subscribed_sources
        
        # Get pending submissions
        pending_submissions = db.query(UserSourceSubmission).filter(
            UserSourceSubmission.user_id == user_id,
            UserSourceSubmission.status == "pending"
        ).all()
        
        # Get the sources for pending submissions
        pending_source_ids = [sub.source_id for sub in pending_submissions]
        pending = db.query(NewsSource).filter(NewsSource.id.in_(pending_source_ids)).all()
        
        return {
            "submitted": submitted,
            "subscribed": subscribed,
            "pending": pending
        }

# Export the service
news_source_service = NewsSourceService()
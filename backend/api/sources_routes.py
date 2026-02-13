"""
API endpoints for news sources management.
"""
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from core.database import get_db_session
from models.news import NewsSource, UserSourceSubmission
from services.news_sources import news_source_service
from services.auth import get_current_user
from schemas.news import (
    NewsSourceCreate,
    NewsSourceResponse,
    NewsSourceSubmitRequest,
    NewsSourceSubmitResponse,
    NewsSourcesUserResponse
)

# Create router
router = APIRouter(
    prefix="/sources",
    tags=["news_sources"],
    responses={404: {"description": "Not found"}},
)

@router.get("/", response_model=List[NewsSourceResponse])
async def get_news_sources(
    skip: int = 0, 
    limit: int = 100,
    active_only: bool = True,
    verified_only: bool = False,
    db: Session = Depends(get_db_session)
):
    """
    Get a list of news sources.
    
    Args:
        skip: Number of records to skip
        limit: Maximum number of records to return
        active_only: Only return active sources
        verified_only: Only return verified sources
        db: Database session
        
    Returns:
        List[NewsSourceResponse]: List of news sources
    """
    sources = news_source_service.get_sources(
        db=db,
        skip=skip,
        limit=limit,
        active_only=active_only,
        verified_only=verified_only
    )
    return sources

@router.post("/", response_model=NewsSourceResponse, status_code=status.HTTP_201_CREATED)
async def create_news_source(
    source: NewsSourceCreate,
    db: Session = Depends(get_db_session),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Create a new news source (admin only).
    
    Args:
        source: News source data
        db: Database session
        current_user: Current user
        
    Returns:
        NewsSourceResponse: Created news source
    """
    # Check if user is admin
    if not current_user.get("is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to create news sources"
        )
    
    try:
        created_source = news_source_service.create_source(
            db=db,
            name=source.name,
            url=source.url,
            description=source.description,
            is_verified=True
        )
        return created_source
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/submit", response_model=NewsSourceSubmitResponse)
async def submit_news_source(
    source: NewsSourceSubmitRequest,
    db: Session = Depends(get_db_session),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Submit a new news source for approval.
    
    Args:
        source: News source data
        db: Database session
        current_user: Current user
        
    Returns:
        NewsSourceSubmitResponse: Submission result
    """
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    
    result = news_source_service.submit_source(
        db=db,
        user_id=user_id,
        url=source.url,
        name=source.name,
        description=source.description
    )
    
    if result["status"] == "error":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result["message"]
        )
    
    return result

@router.get("/user", response_model=NewsSourcesUserResponse)
async def get_user_sources(
    db: Session = Depends(get_db_session),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get all sources related to the current user.
    
    Args:
        db: Database session
        current_user: Current user
        
    Returns:
        NewsSourcesUserResponse: User's sources
    """
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    
    user_sources = news_source_service.get_user_sources(db=db, user_id=user_id)
    return user_sources

@router.post("/admin/process/{submission_id}", response_model=Dict[str, Any])
async def process_submission(
    submission_id: int,
    approve: bool = True,
    notes: Optional[str] = None,
    db: Session = Depends(get_db_session),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Process a user's source submission (approve or reject).
    
    Args:
        submission_id: ID of the submission to process
        approve: Whether to approve or reject the submission
        notes: Optional notes for the decision
        db: Database session
        current_user: Current user
        
    Returns:
        Dict[str, Any]: Result of the processing
    """
    # Check if user is admin
    if not current_user.get("is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to process submissions"
        )
    
    result = news_source_service.process_submission(
        db=db,
        submission_id=submission_id,
        approve=approve,
        notes=notes
    )
    
    if result["status"] == "error":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result["message"]
        )
    
    return result
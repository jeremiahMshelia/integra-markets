"""Public read endpoints for the divergence feature.

Three endpoints:

  GET /v1/topics
       Topic taxonomy + categories (powers the mobile alert
       preferences UI and any third-party agent that wants to know
       what topics Integra tracks).

  GET /v1/markets/divergence/{topic}
       Current divergence reading for one topic: news sentiment vs.
       Polymarket vs. Kalshi. Used by the API tier and by the mobile
       AIAnalysisOverlay "Prediction Market View" section.

  GET /v1/markets/divergence
       Batch version: query string ?topics=a,b,c returns readings for
       up to 10 topics at once. Used by the TodayDashboard divergence
       filter pill.

Auth: every endpoint requires a valid Authorization: Bearer <api_key>.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from services.api_key_auth import verify_api_key
from services.divergence import compute, compute_many
from services.topic_taxonomy import TOPICS, list_categories_for_api, list_topics_for_api

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["divergence"])


def _supabase():
    from services._supabase import get_supabase_client

    sb = get_supabase_client()
    if sb is None:
        raise HTTPException(status_code=503, detail="archive backend unavailable")
    return sb


@router.get("/topics")
async def list_topics(_auth: Dict[str, Any] = Depends(verify_api_key)) -> Dict[str, Any]:
    """All topics + categories Integra tracks for divergence."""
    return {
        "topics": list_topics_for_api(),
        "categories": list_categories_for_api(),
    }


@router.get("/markets/divergence/{topic}")
async def divergence_for_topic(
    topic: str,
    threshold: float = Query(default=0.20, ge=0.05, le=0.50),
    lookback_hours: int = Query(default=24, ge=1, le=168),
    _auth: Dict[str, Any] = Depends(verify_api_key),
) -> Dict[str, Any]:
    """News sentiment vs. prediction-market consensus for one topic."""
    if topic not in TOPICS:
        raise HTTPException(
            status_code=404,
            detail=f"unknown topic '{topic}'. See /v1/topics for the full list.",
        )
    reading = compute(
        _supabase(),
        topic_key=topic,
        threshold=threshold,
        lookback_hours=lookback_hours,
    )
    if reading is None:
        # Should not happen — guarded above — but fail closed.
        raise HTTPException(status_code=500, detail="divergence computation failed")
    return reading.to_dict()


@router.get("/markets/divergence")
async def divergence_batch(
    topics: str = Query(..., description="Comma-separated topic keys (max 10)"),
    threshold: float = Query(default=0.20, ge=0.05, le=0.50),
    lookback_hours: int = Query(default=24, ge=1, le=168),
    _auth: Dict[str, Any] = Depends(verify_api_key),
) -> Dict[str, Any]:
    """Batch divergence — useful for the dashboard / scanner views."""
    topic_keys = [t.strip() for t in topics.split(",") if t.strip()]
    if not topic_keys:
        raise HTTPException(status_code=400, detail="at least one topic required")
    if len(topic_keys) > 10:
        raise HTTPException(status_code=400, detail="max 10 topics per call")
    unknown = [t for t in topic_keys if t not in TOPICS]
    if unknown:
        raise HTTPException(
            status_code=404,
            detail=f"unknown topics: {unknown}. See /v1/topics for the full list.",
        )
    readings = compute_many(
        _supabase(),
        topic_keys=topic_keys,
        threshold=threshold,
        lookback_hours=lookback_hours,
    )
    return {
        "count": len(readings),
        "threshold": threshold,
        "lookback_hours": lookback_hours,
        "items": [r.to_dict() for r in readings],
    }

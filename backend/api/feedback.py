"""User feedback capture endpoint.

Writes one row to ``public.user_feedback`` per call. If the feedback maps to
a known prediction and includes a sentiment_vote, the learning loop also
gets a supervised experience injected immediately (without waiting for a
24h market outcome).
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/feedback", tags=["feedback"])

ALLOWED_ACTIONS = {"like", "dislike", "save", "dismiss", "share", "agree", "disagree"}
EXPLICIT_VOTE_ACTIONS = {"agree", "disagree", "like", "dislike"}


class FeedbackRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    article_id: str = Field(..., min_length=1)
    action: str
    prediction_id: Optional[str] = None
    sentiment_vote: Optional[str] = Field(
        None, description="If user explicitly tagged the article's tone"
    )
    note: Optional[str] = None


def _action_reward(action: str, predicted_sentiment: Optional[str], vote: Optional[str]) -> float:
    """Convert a feedback action into a scalar reward in [-1, 1]."""
    if vote and predicted_sentiment:
        return 1.0 if vote == predicted_sentiment else -1.0
    return {
        "like": 0.6,
        "agree": 0.8,
        "save": 0.4,
        "share": 0.3,
        "dismiss": -0.2,
        "dislike": -0.6,
        "disagree": -0.8,
    }.get(action, 0.0)


@router.post("")
async def submit_feedback(payload: FeedbackRequest) -> dict:
    if payload.action not in ALLOWED_ACTIONS:
        raise HTTPException(status_code=400, detail=f"unknown action: {payload.action}")

    from services.learning_loop import get_learning_loop  # local import to avoid cycle
    from services._supabase import get_supabase_client

    supabase = get_supabase_client()

    inserted_row = None
    if supabase is not None:
        try:
            inserted_row = (
                supabase.table("user_feedback")
                .insert(
                    {
                        "user_id": payload.user_id,
                        "article_id": payload.article_id,
                        "prediction_id": payload.prediction_id,
                        "action": payload.action,
                        "sentiment_vote": payload.sentiment_vote,
                        "note": payload.note,
                    }
                )
                .execute()
                .data
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("supabase user_feedback insert failed: %s", exc)

    # Inject as a supervised experience when the user tagged a sentiment.
    training_result = None
    if payload.sentiment_vote and payload.action in EXPLICIT_VOTE_ACTIONS:
        loop = get_learning_loop()
        prediction_record = _lookup_prediction(supabase, payload.prediction_id) if supabase else None
        predicted_sentiment = (
            prediction_record.get("predicted_sentiment") if prediction_record else None
        )
        reward = _action_reward(payload.action, predicted_sentiment, payload.sentiment_vote)
        text = (
            prediction_record.get("article_title", "")
            if prediction_record
            else payload.article_id  # fallback: hash the article_id as features
        )
        commodity = prediction_record.get("commodity") if prediction_record else None
        source = prediction_record.get("source") if prediction_record else None
        keywords = [
            k.get("text") if isinstance(k, dict) else k
            for k in (prediction_record.get("keywords") or [])
        ] if prediction_record else []
        try:
            training_result = await loop.capture_experience(
                text=text,
                label=payload.sentiment_vote,
                reward=reward,
                commodity=commodity,
                source=source,
                keywords=keywords,
                weight=1.0,
                correct=(reward > 0),
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("learning loop capture failed: %s", exc)

    return {
        "status": "ok",
        "stored": bool(inserted_row),
        "trained": training_result is not None,
        "loss": training_result.loss if training_result else None,
    }


def _lookup_prediction(supabase: object, prediction_id: Optional[str]) -> Optional[dict]:
    if not prediction_id or not supabase:
        return None
    try:
        rows = (
            supabase.table("predictions")
            .select("*")
            .eq("id", prediction_id)
            .limit(1)
            .execute()
            .data
        )
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("supabase lookup failed: %s", exc)
        return None

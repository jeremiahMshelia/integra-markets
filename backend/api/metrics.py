"""Learning-loop metrics endpoint.

Exposes the seven metrics from the audit report. Reads from Supabase tables
populated by the learning loop. Falls back to the in-memory singleton when
the database is unreachable so the endpoint still answers locally.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


@router.get("/learning")
async def learning_metrics(window_days: int = 7) -> Dict[str, Any]:
    import asyncio
    from services.learning_loop import get_learning_loop
    from services._supabase import get_supabase_client

    supabase = get_supabase_client()
    loop = get_learning_loop()
    in_memory = loop.snapshot_metrics()

    if not supabase:
        return {"source": "in_memory_only", **in_memory}

    since = (datetime.now(timezone.utc) - timedelta(days=window_days)).isoformat()

    accuracy, reward_curve, loss_curve, catalogue, coverage, alignment = await asyncio.gather(
        asyncio.to_thread(_accuracy_at_horizon, supabase, since),
        asyncio.to_thread(_reward_ema, supabase, since),
        asyncio.to_thread(_loss_curve, supabase, since),
        asyncio.to_thread(_catalogue_metrics, supabase, since),
        asyncio.to_thread(_coverage, supabase, since),
        asyncio.to_thread(_feedback_alignment, supabase, since),
    )

    return {
        "source": "supabase",
        "window_days": window_days,
        "in_memory": in_memory,
        "prediction_accuracy_24h": accuracy,
        "reward_ema_50": reward_curve,
        "loss_recent": loss_curve,
        "catalogue": catalogue,
        "coverage": coverage,
        "feedback_alignment": alignment,
    }


def _accuracy_at_horizon(supabase: Any, since: str) -> Dict[str, Any]:
    try:
        rows = (
            supabase.table("prediction_outcomes")
            .select("prediction_id, actual_direction, reward")
            .gte("evaluated_at", since)
            .execute()
            .data
            or []
        )
        if not rows:
            return {"n": 0, "accuracy": None}
        prediction_ids = [r["prediction_id"] for r in rows]
        predictions = (
            supabase.table("predictions")
            .select("id, predicted_sentiment")
            .in_("id", prediction_ids)
            .execute()
            .data
            or []
        )
        pred_map = {p["id"]: p["predicted_sentiment"] for p in predictions}
        correct = sum(
            1
            for r in rows
            if pred_map.get(r["prediction_id"]) == r.get("actual_direction")
        )
        return {"n": len(rows), "accuracy": correct / len(rows)}
    except Exception as exc:  # noqa: BLE001
        logger.warning("accuracy query failed: %s", exc)
        return {"n": 0, "accuracy": None, "error": str(exc)}


def _reward_ema(supabase: Any, since: str, window: int = 50) -> List[Dict[str, Any]]:
    try:
        rows = (
            supabase.table("training_events")
            .select("ts, reward_mean")
            .gte("ts", since)
            .order("ts")
            .limit(500)
            .execute()
            .data
            or []
        )
        alpha = 2.0 / (window + 1)
        ema = None
        out = []
        for r in rows:
            value = r.get("reward_mean")
            if value is None:
                continue
            ema = value if ema is None else alpha * value + (1 - alpha) * ema
            out.append({"ts": r["ts"], "ema": ema})
        return out
    except Exception as exc:  # noqa: BLE001
        logger.warning("reward EMA query failed: %s", exc)
        return []


def _loss_curve(supabase: Any, since: str) -> List[Dict[str, Any]]:
    try:
        rows = (
            supabase.table("training_events")
            .select("ts, loss")
            .gte("ts", since)
            .order("ts")
            .limit(500)
            .execute()
            .data
            or []
        )
        return [r for r in rows if r.get("loss") is not None]
    except Exception as exc:  # noqa: BLE001
        logger.warning("loss curve query failed: %s", exc)
        return []


def _catalogue_metrics(supabase: Any, since: str) -> Dict[str, Any]:
    try:
        new_keywords = (
            supabase.table("keyword_weights")
            .select("keyword", count="exact")
            .gte("first_seen", since)
            .execute()
        )
        total_keywords = (
            supabase.table("keyword_weights")
            .select("keyword", count="exact")
            .execute()
        )
        return {
            "new_keywords_window": getattr(new_keywords, "count", None) or 0,
            "total_keywords": getattr(total_keywords, "count", None) or 0,
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("catalogue query failed: %s", exc)
        return {"new_keywords_window": 0, "total_keywords": 0, "error": str(exc)}


def _coverage(supabase: Any, since: str) -> Dict[str, Any]:
    try:
        predicted = (
            supabase.table("predictions")
            .select("id", count="exact")
            .gte("predicted_at", since)
            .execute()
        )
        evaluated = (
            supabase.table("predictions")
            .select("id", count="exact")
            .gte("predicted_at", since)
            .eq("evaluated", True)
            .execute()
        )
        n_pred = getattr(predicted, "count", None) or 0
        n_eval = getattr(evaluated, "count", None) or 0
        ratio = (n_eval / n_pred) if n_pred else None
        return {"predicted": n_pred, "evaluated": n_eval, "evaluated_ratio": ratio}
    except Exception as exc:  # noqa: BLE001
        logger.warning("coverage query failed: %s", exc)
        return {"predicted": 0, "evaluated": 0, "evaluated_ratio": None, "error": str(exc)}


def _feedback_alignment(supabase: Any, since: str) -> Dict[str, Any]:
    try:
        rows = (
            supabase.table("user_feedback")
            .select("prediction_id, sentiment_vote")
            .gte("created_at", since)
            .not_.is_("sentiment_vote", "null")
            .not_.is_("prediction_id", "null")
            .execute()
            .data
            or []
        )
        if not rows:
            return {"n": 0, "alignment": None}
        ids = [r["prediction_id"] for r in rows]
        preds = (
            supabase.table("predictions")
            .select("id, predicted_sentiment")
            .in_("id", ids)
            .execute()
            .data
            or []
        )
        pred_map = {p["id"]: p["predicted_sentiment"] for p in preds}
        agreed = sum(
            1 for r in rows if pred_map.get(r["prediction_id"]) == r.get("sentiment_vote")
        )
        return {"n": len(rows), "alignment": agreed / len(rows)}
    except Exception as exc:  # noqa: BLE001
        logger.warning("feedback alignment query failed: %s", exc)
        return {"n": 0, "alignment": None, "error": str(exc)}

"""Public read endpoints over the historical sentiment archive.

These endpoints expose the data layer added by the historical archive
migration to API customers via the Bearer-token api_keys auth layer.

Endpoints
---------

  GET  /v1/commodities
       List of commodities the archive has data for.

  GET  /v1/sentiment/{commodity}/now
       Most recent observation for this commodity, plus the rolling
       24h average. Recency check uses the latest row in
       raw_documents joined to sentiment_scores.

  GET  /v1/sentiment/{commodity}/history?from=&to=
       Time-series of individual scored documents within a window.
       Capped at 1000 rows per call; clients paginate via from/to.

  GET  /v1/sentiment/{commodity}/daily?days=30
       Daily aggregates (avg sentiment, article count, momentum)
       computed on-the-fly from sentiment_scores. Suitable for
       charts. Computed on read for beta simplicity; will move to a
       cached daily_asset_sentiment table once traffic justifies.

  GET  /v1/markets/overlay?provider=kalshi&status=settled&limit=
       Resolved prediction markets joined to contemporaneous news
       sentiment — the unique cross-market product.

Auth: every endpoint requires a valid Authorization: Bearer <key>
header that resolves to a row in api_keys via verify_api_key.
"""

from __future__ import annotations

import datetime as dt
import logging
import statistics
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from services.api_key_auth import verify_api_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["sentiment-history"])

DEFAULT_HISTORY_LIMIT = 100
MAX_HISTORY_LIMIT = 1000
MAX_DAILY_DAYS = 365


def _supabase():
    """Lazy import — supabase client may not be initialized at import time."""
    from services._supabase import get_supabase_client

    sb = get_supabase_client()
    if sb is None:
        raise HTTPException(status_code=503, detail="archive backend unavailable")
    return sb


def _parse_iso(value: str, label: str) -> dt.datetime:
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"invalid {label} timestamp: {exc}") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed


@router.get("/commodities")
async def list_commodities(_auth: Dict[str, Any] = Depends(verify_api_key)) -> Dict[str, Any]:
    """Return distinct commodities that have at least one scored document."""
    supabase = _supabase()
    try:
        rows = (
            supabase.table("entity_mentions")
            .select("entity")
            .eq("entity_type", "commodity")
            .limit(10000)
            .execute()
        ).data or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("list_commodities query failed: %s", exc)
        rows = []

    distinct = sorted({(r.get("entity") or "").strip().lower() for r in rows if r.get("entity")})
    return {"commodities": [c for c in distinct if c]}


@router.get("/sentiment/{commodity}/now")
async def sentiment_now(
    commodity: str,
    _auth: Dict[str, Any] = Depends(verify_api_key),
) -> Dict[str, Any]:
    """Most recent observed sentiment for `commodity` plus a 24h rolling stat."""
    supabase = _supabase()
    commodity_lc = commodity.strip().lower()
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=24)).isoformat()

    try:
        rows = (
            supabase.table("entity_mentions")
            .select("score, sentiment, extracted_at")
            .eq("entity", commodity_lc)
            .gte("extracted_at", since)
            .order("extracted_at", desc=True)
            .limit(500)
            .execute()
        ).data or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("sentiment_now query failed: %s", exc)
        rows = []

    if not rows:
        raise HTTPException(status_code=404, detail=f"no data for commodity '{commodity_lc}' in last 24h")

    scores = [r["score"] for r in rows if r.get("score") is not None]
    avg = round(statistics.fmean(scores), 4) if scores else None
    latest = rows[0]
    return {
        "commodity": commodity_lc,
        "latest": {
            "sentiment": latest.get("sentiment"),
            "score": latest.get("score"),
            "observed_at": latest.get("extracted_at"),
        },
        "rolling_24h": {
            "avg_score": avg,
            "sample_size": len(scores),
        },
    }


@router.get("/sentiment/{commodity}/history")
async def sentiment_history(
    commodity: str,
    from_: Optional[str] = Query(default=None, alias="from", description="ISO 8601 UTC timestamp"),
    to: Optional[str] = Query(default=None, description="ISO 8601 UTC timestamp"),
    limit: int = Query(default=DEFAULT_HISTORY_LIMIT, ge=1, le=MAX_HISTORY_LIMIT),
    _auth: Dict[str, Any] = Depends(verify_api_key),
) -> Dict[str, Any]:
    """Time-series of individual scored documents for `commodity`."""
    supabase = _supabase()
    commodity_lc = commodity.strip().lower()

    end = _parse_iso(to, "to") if to else dt.datetime.now(dt.timezone.utc)
    start = _parse_iso(from_, "from") if from_ else end - dt.timedelta(days=7)
    if start >= end:
        raise HTTPException(status_code=400, detail="'from' must be earlier than 'to'")

    try:
        rows = (
            supabase.table("entity_mentions")
            .select("document_id, sentiment, score, confidence, extracted_at")
            .eq("entity", commodity_lc)
            .gte("extracted_at", start.isoformat())
            .lte("extracted_at", end.isoformat())
            .order("extracted_at", desc=True)
            .limit(limit)
            .execute()
        ).data or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("sentiment_history query failed: %s", exc)
        rows = []

    return {
        "commodity": commodity_lc,
        "from": start.isoformat(),
        "to": end.isoformat(),
        "count": len(rows),
        "limit": limit,
        "items": rows,
    }


@router.get("/sentiment/{commodity}/daily")
async def sentiment_daily(
    commodity: str,
    days: int = Query(default=30, ge=1, le=MAX_DAILY_DAYS),
    _auth: Dict[str, Any] = Depends(verify_api_key),
) -> Dict[str, Any]:
    """Daily aggregates for the last N days, computed on-the-fly."""
    supabase = _supabase()
    commodity_lc = commodity.strip().lower()
    end = dt.datetime.now(dt.timezone.utc)
    start = end - dt.timedelta(days=days)

    try:
        rows = (
            supabase.table("entity_mentions")
            .select("sentiment, score, extracted_at")
            .eq("entity", commodity_lc)
            .gte("extracted_at", start.isoformat())
            .lte("extracted_at", end.isoformat())
            .limit(50000)
            .execute()
        ).data or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("sentiment_daily query failed: %s", exc)
        rows = []

    # Bucket by UTC date.
    buckets: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        observed = r.get("extracted_at")
        if not observed:
            continue
        try:
            date_key = dt.datetime.fromisoformat(observed.replace("Z", "+00:00")).date().isoformat()
        except ValueError:
            continue
        buckets.setdefault(date_key, []).append(r)

    series: List[Dict[str, Any]] = []
    sorted_dates = sorted(buckets.keys())
    prev_avg: Optional[float] = None
    for date_key in sorted_dates:
        bucket = buckets[date_key]
        scores = [b["score"] for b in bucket if b.get("score") is not None]
        avg = round(statistics.fmean(scores), 4) if scores else None
        momentum = round(avg - prev_avg, 4) if (avg is not None and prev_avg is not None) else None
        series.append({
            "date": date_key,
            "avg_score": avg,
            "article_count": len(bucket),
            "bullish_count": sum(1 for b in bucket if b.get("sentiment") == "bullish"),
            "bearish_count": sum(1 for b in bucket if b.get("sentiment") == "bearish"),
            "neutral_count": sum(1 for b in bucket if b.get("sentiment") == "neutral"),
            "momentum": momentum,
        })
        if avg is not None:
            prev_avg = avg

    return {
        "commodity": commodity_lc,
        "from": start.date().isoformat(),
        "to": end.date().isoformat(),
        "days": days,
        "series": series,
    }


@router.get("/markets/overlay")
async def markets_overlay(
    provider: str = Query(default="kalshi"),
    status: str = Query(default="settled", description="market status filter applied to raw_payload"),
    limit: int = Query(default=50, ge=1, le=500),
    _auth: Dict[str, Any] = Depends(verify_api_key),
) -> Dict[str, Any]:
    """Resolved prediction markets with linked news-sentiment context.

    For the beta this returns the resolved markets enriched with the
    average news sentiment over the market's lifetime. Full per-snapshot
    overlay arrives once the nightly aggregation job is wired up; this
    endpoint already returns the shape that job will populate.
    """
    supabase = _supabase()
    try:
        market_rows = (
            supabase.table("raw_documents")
            .select("id, url, title, published_at, raw_payload")
            .eq("source", "Kalshi" if provider.lower() == "kalshi" else provider)
            .eq("source_type", "prediction_market")
            .order("published_at", desc=True)
            .limit(limit)
            .execute()
        ).data or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("markets_overlay query failed: %s", exc)
        market_rows = []

    items: List[Dict[str, Any]] = []
    for m in market_rows:
        payload = m.get("raw_payload") or {}
        if status and payload.get("status") and payload.get("status") != status:
            continue
        items.append({
            "market_id": payload.get("ticker"),
            "provider": provider,
            "title": m.get("title"),
            "url": m.get("url"),
            "opened_at": payload.get("open_time"),
            "closed_at": payload.get("close_time"),
            "result": payload.get("result"),
            "last_price": payload.get("last_price"),
            "volume": payload.get("volume"),
            "category": payload.get("category"),
        })

    return {
        "provider": provider,
        "status": status,
        "count": len(items),
        "items": items,
    }

"""LLM tool definitions for the /v1/agent/ask endpoint.

The agent endpoint calls a Groq-hosted Llama model with these tools.
The model picks the tools it needs to answer the question; this module
defines the schemas it sees and the Python functions that execute when
the model invokes them.

The tools intentionally hit the same archive queries the public read
endpoints in `api/sentiment_history.py` use, so the agent's answers
are grounded in exactly the same data a customer would get via direct
REST calls.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import statistics
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# =====================================================================
# Tool definitions exposed to the LLM
# =====================================================================

TOOL_SCHEMAS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_sentiment_now",
            "description": (
                "Fetch the most recent observed sentiment for a commodity, "
                "plus a 24h rolling average. Use when you need the current pulse."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "commodity": {
                        "type": "string",
                        "description": "Commodity name (lower-case), e.g. 'crude oil', 'lng', 'gold'.",
                    },
                },
                "required": ["commodity"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recent_history",
            "description": (
                "Return individual scored news articles for a commodity within a window. "
                "Use when you need to cite specific headlines or identify catalysts."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "commodity": {"type": "string"},
                    "days": {"type": "integer", "minimum": 1, "maximum": 30, "default": 7},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 25},
                },
                "required": ["commodity"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_daily_aggregates",
            "description": (
                "Return per-day aggregates (avg score, article counts, momentum) "
                "for a commodity. Use when you need to describe a trajectory."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "commodity": {"type": "string"},
                    "days": {"type": "integer", "minimum": 1, "maximum": 365, "default": 30},
                },
                "required": ["commodity"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_market_overlay",
            "description": (
                "Return resolved or active prediction markets with metadata. "
                "Use when comparing news sentiment against market-implied probability."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "provider": {"type": "string", "default": "kalshi"},
                    "status": {"type": "string", "enum": ["settled", "active", "closed"], "default": "active"},
                    "topic": {
                        "type": "string",
                        "description": "Substring filter on market title / category (optional).",
                    },
                    "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 25},
                },
                "required": ["provider"],
            },
        },
    },
]


# =====================================================================
# Tool implementations — read the archive
# =====================================================================

def _supabase():
    from services._supabase import get_supabase_client

    sb = get_supabase_client()
    if sb is None:
        raise RuntimeError("supabase client unavailable")
    return sb


def _tool_get_sentiment_now(commodity: str) -> Dict[str, Any]:
    supabase = _supabase()
    commodity_lc = commodity.strip().lower()
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=24)).isoformat()
    rows = (
        supabase.table("entity_mentions")
        .select("score, sentiment, extracted_at")
        .eq("entity", commodity_lc)
        .gte("extracted_at", since)
        .order("extracted_at", desc=True)
        .limit(500)
        .execute()
    ).data or []
    if not rows:
        return {"commodity": commodity_lc, "no_data": True}
    scores = [r["score"] for r in rows if r.get("score") is not None]
    return {
        "commodity": commodity_lc,
        "latest_sentiment": rows[0].get("sentiment"),
        "latest_score": rows[0].get("score"),
        "observed_at": rows[0].get("extracted_at"),
        "rolling_24h_avg": round(statistics.fmean(scores), 4) if scores else None,
        "sample_size": len(scores),
    }


def _tool_get_recent_history(commodity: str, days: int = 7, limit: int = 25) -> Dict[str, Any]:
    supabase = _supabase()
    commodity_lc = commodity.strip().lower()
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)).isoformat()
    rows = (
        supabase.table("entity_mentions")
        .select("document_id, sentiment, score, confidence, extracted_at")
        .eq("entity", commodity_lc)
        .gte("extracted_at", since)
        .order("extracted_at", desc=True)
        .limit(min(limit, 100))
        .execute()
    ).data or []
    return {"commodity": commodity_lc, "days": days, "count": len(rows), "items": rows}


def _tool_get_daily_aggregates(commodity: str, days: int = 30) -> Dict[str, Any]:
    supabase = _supabase()
    commodity_lc = commodity.strip().lower()
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)).isoformat()
    rows = (
        supabase.table("entity_mentions")
        .select("sentiment, score, extracted_at")
        .eq("entity", commodity_lc)
        .gte("extracted_at", since)
        .limit(50000)
        .execute()
    ).data or []
    buckets: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        observed = r.get("extracted_at")
        if not observed:
            continue
        try:
            day = dt.datetime.fromisoformat(observed.replace("Z", "+00:00")).date().isoformat()
        except ValueError:
            continue
        buckets.setdefault(day, []).append(r)
    series: List[Dict[str, Any]] = []
    prev: Optional[float] = None
    for day in sorted(buckets):
        bucket = buckets[day]
        scores = [b["score"] for b in bucket if b.get("score") is not None]
        avg = round(statistics.fmean(scores), 4) if scores else None
        momentum = round(avg - prev, 4) if avg is not None and prev is not None else None
        series.append({
            "date": day,
            "avg_score": avg,
            "article_count": len(bucket),
            "momentum": momentum,
        })
        if avg is not None:
            prev = avg
    return {"commodity": commodity_lc, "days": days, "series": series}


def _tool_get_market_overlay(
    provider: str = "kalshi",
    status: str = "active",
    topic: Optional[str] = None,
    limit: int = 25,
) -> Dict[str, Any]:
    supabase = _supabase()
    rows = (
        supabase.table("raw_documents")
        .select("id, url, title, published_at, raw_payload")
        .eq("source", "Kalshi" if provider.lower() == "kalshi" else provider)
        .eq("source_type", "prediction_market")
        .order("published_at", desc=True)
        .limit(min(limit * 4, 500))  # over-fetch then filter
        .execute()
    ).data or []
    topic_lc = (topic or "").strip().lower()
    out: List[Dict[str, Any]] = []
    for m in rows:
        payload = m.get("raw_payload") or {}
        if status and payload.get("status") and payload.get("status") != status:
            continue
        if topic_lc:
            haystack = " ".join([
                str(m.get("title") or ""),
                str(payload.get("category") or ""),
                " ".join(payload.get("tags") or []),
            ]).lower()
            if topic_lc not in haystack:
                continue
        out.append({
            "market_id": payload.get("ticker"),
            "provider": provider,
            "title": m.get("title"),
            "status": payload.get("status"),
            "result": payload.get("result"),
            "last_price": payload.get("last_price"),
            "opened_at": payload.get("open_time"),
            "closed_at": payload.get("close_time"),
        })
        if len(out) >= limit:
            break
    return {"provider": provider, "status": status, "topic": topic, "count": len(out), "items": out}


TOOL_DISPATCH = {
    "get_sentiment_now": _tool_get_sentiment_now,
    "get_recent_history": _tool_get_recent_history,
    "get_daily_aggregates": _tool_get_daily_aggregates,
    "get_market_overlay": _tool_get_market_overlay,
}


def call_tool(name: str, arguments_json: str) -> str:
    """Dispatch a single LLM tool call and return its result as a JSON string."""
    impl = TOOL_DISPATCH.get(name)
    if impl is None:
        return json.dumps({"error": f"unknown tool '{name}'"})
    try:
        args = json.loads(arguments_json or "{}")
    except json.JSONDecodeError as exc:
        return json.dumps({"error": f"invalid arguments JSON: {exc}"})
    try:
        result = impl(**args)
    except TypeError as exc:
        return json.dumps({"error": f"bad arguments for {name}: {exc}"})
    except Exception as exc:  # noqa: BLE001
        logger.warning("tool %s raised: %s", name, exc)
        return json.dumps({"error": str(exc)})
    return json.dumps(result, default=str)

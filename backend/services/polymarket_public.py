"""Polymarket public-read client (no auth required).

Calls `https://gamma-api.polymarket.com/markets` directly using the
public, unauthenticated read endpoints. Used by the divergence service
and the /v1/markets endpoints to fetch live market prices without
requiring per-user BYO credentials.

This intentionally does NOT implement order placement, position
management, or any write operations. Those still require the BYOK
connector path in main_simple_nlp.py — kept separate so retail users
get the free divergence feature and power users get full programmatic
control through the API tier.

Rate-limit note: Polymarket's gamma-api allows ~100 req/min from a
single IP without auth. Combined with the 10-minute TTL cache below
and per-topic filtering, this can serve thousands of consumer users
from a single backend connection.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


GAMMA_BASE = "https://gamma-api.polymarket.com"
DEFAULT_TIMEOUT_S = 12
DEFAULT_LIMIT = 100
DEFAULT_CACHE_TTL_S = 600  # 10 min — markets change slowly enough for this


class _Cache:
    """In-process TTL cache for market fetches.

    Sufficient for a single-process backend; swap for Redis when we
    horizontally scale.
    """

    def __init__(self) -> None:
        self._store: Dict[str, tuple] = {}

    def get(self, key: str) -> Optional[Any]:
        entry = self._store.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if expires_at < time.time():
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: str, value: Any, ttl_s: int) -> None:
        self._store[key] = (time.time() + ttl_s, value)


_cache = _Cache()


def _normalize_market(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Reduce the gamma-api market payload to the fields we actually use.

    Keeps the response stable even if Polymarket adds/removes fields.
    """
    # gamma-api returns prices as strings; coerce.
    def _f(v: Any) -> Optional[float]:
        try:
            return float(v) if v is not None and v != "" else None
        except (ValueError, TypeError):
            return None

    return {
        "provider": "polymarket",
        "id": raw.get("id"),
        "condition_id": raw.get("conditionId"),
        "question": raw.get("question") or raw.get("title"),
        "title": raw.get("question") or raw.get("title"),
        "slug": raw.get("slug"),
        "url": f"https://polymarket.com/event/{raw.get('slug')}" if raw.get("slug") else None,
        "category": raw.get("category"),
        "tags": raw.get("tags") or [],
        "active": raw.get("active"),
        "closed": raw.get("closed"),
        "end_date": raw.get("endDate"),
        "yes_price": _f(raw.get("bestBid") or raw.get("lastTradePrice")),
        "no_price": (1.0 - _f(raw.get("bestBid"))) if _f(raw.get("bestBid")) is not None else None,
        "volume_24h": _f(raw.get("volume24hr")),
        "liquidity": _f(raw.get("liquidity")),
        "outcome": raw.get("umaResolutionStatus"),
    }


def fetch_active_markets(
    *,
    limit: int = DEFAULT_LIMIT,
    cache_ttl_s: int = DEFAULT_CACHE_TTL_S,
) -> List[Dict[str, Any]]:
    """Return active (open) markets, normalized."""
    cache_key = f"active:{limit}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    params = {
        "limit": limit,
        "active": "true",
        "closed": "false",
        "order": "volume24hr",
        "ascending": "false",
    }
    try:
        with httpx.Client(timeout=DEFAULT_TIMEOUT_S) as client:
            response = client.get(f"{GAMMA_BASE}/markets", params=params)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as exc:
        logger.warning("polymarket fetch_active_markets failed: %s", exc)
        return []

    markets = [_normalize_market(m) for m in (data or [])]
    _cache.set(cache_key, markets, cache_ttl_s)
    return markets


def fetch_settled_markets(
    *,
    limit: int = DEFAULT_LIMIT,
    cache_ttl_s: int = DEFAULT_CACHE_TTL_S,
) -> List[Dict[str, Any]]:
    """Return recently-settled (resolved) markets."""
    cache_key = f"settled:{limit}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    params = {
        "limit": limit,
        "active": "false",
        "closed": "true",
        "order": "endDate",
        "ascending": "false",
    }
    try:
        with httpx.Client(timeout=DEFAULT_TIMEOUT_S) as client:
            response = client.get(f"{GAMMA_BASE}/markets", params=params)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as exc:
        logger.warning("polymarket fetch_settled_markets failed: %s", exc)
        return []

    markets = [_normalize_market(m) for m in (data or [])]
    _cache.set(cache_key, markets, cache_ttl_s)
    return markets

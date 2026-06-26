"""Kalshi public-read client (no auth required).

Calls `https://api.elections.kalshi.com/trade-api/v2/markets` directly.
Confirmed working without API key for the read-only endpoints we need
(market list, prices, settlement outcomes).

Same architecture as polymarket_public — single backend connection,
in-process TTL cache, normalized response shape. The existing
archive_scraper/kalshi.py also uses this endpoint for one-shot
historical backfills; this module is for the live-request path.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


BASE = "https://api.elections.kalshi.com/trade-api/v2/markets"
DEFAULT_TIMEOUT_S = 12
DEFAULT_LIMIT = 200
DEFAULT_CACHE_TTL_S = 600  # 10 min


class _Cache:
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
    """Normalize Kalshi market to the same shape as polymarket_public.

    Kalshi prices come in cents (0-100), we convert to 0-1 probabilities
    so downstream divergence math is provider-agnostic.
    """
    def _f(v: Any) -> Optional[float]:
        try:
            return float(v) if v is not None else None
        except (ValueError, TypeError):
            return None

    yes_bid = _f(raw.get("yes_bid"))
    last_price = _f(raw.get("last_price"))
    # Pick best available price signal, prefer last_price.
    raw_price = last_price if last_price is not None else yes_bid
    yes_price_prob = (raw_price / 100.0) if raw_price is not None else None

    ticker = raw.get("ticker") or ""
    series = raw.get("series_ticker") or ""
    return {
        "provider": "kalshi",
        "id": ticker,
        "ticker": ticker,
        "series_ticker": series,
        "title": raw.get("title") or raw.get("subtitle") or ticker,
        "question": raw.get("yes_sub_title") or raw.get("title"),
        "url": f"https://kalshi.com/markets/{series.lower()}" if series else None,
        "category": raw.get("category"),
        "tags": raw.get("tags") or [],
        "status": raw.get("status"),
        "result": raw.get("result"),
        "open_time": raw.get("open_time"),
        "close_time": raw.get("close_time"),
        "yes_price": yes_price_prob,
        "no_price": (1.0 - yes_price_prob) if yes_price_prob is not None else None,
        "volume_24h": _f(raw.get("volume_24h")),
        "liquidity": _f(raw.get("liquidity")),
    }


def _fetch_status(
    status: str,
    *,
    limit: int = DEFAULT_LIMIT,
    cache_ttl_s: int = DEFAULT_CACHE_TTL_S,
) -> List[Dict[str, Any]]:
    cache_key = f"{status}:{limit}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        with httpx.Client(timeout=DEFAULT_TIMEOUT_S) as client:
            response = client.get(BASE, params={"status": status, "limit": str(limit)})
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as exc:
        logger.warning("kalshi fetch (status=%s) failed: %s", status, exc)
        return []

    markets = [_normalize_market(m) for m in (data.get("markets") or [])]
    _cache.set(cache_key, markets, cache_ttl_s)
    return markets


def fetch_active_markets(*, limit: int = DEFAULT_LIMIT) -> List[Dict[str, Any]]:
    return _fetch_status("active", limit=limit)


def fetch_settled_markets(*, limit: int = DEFAULT_LIMIT) -> List[Dict[str, Any]]:
    return _fetch_status("settled", limit=limit)

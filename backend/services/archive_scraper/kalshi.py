"""Kalshi resolved-markets puller — no API key required.

Kalshi exposes a public read endpoint at
`https://api.elections.kalshi.com/trade-api/v2/markets` that returns
paginated market data including settled (resolved) markets, without
any authentication. This script paginates through all settled markets
and persists each as a `raw_documents` row of type
`prediction_market`. The settled outcome plus closing price land in
the raw_payload JSON for later overlay against contemporaneous news
sentiment.

Run (one-shot, operator-only):

    python -m backend.services.archive_scraper.kalshi --status settled
    python -m backend.services.archive_scraper.kalshi --status settled --max-pages 10 --dry-run
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from typing import List, Optional

logger = logging.getLogger("archive_scraper.kalshi")

BASE = "https://api.elections.kalshi.com/trade-api/v2/markets"
DEFAULT_PAGE_LIMIT = 1000


def fetch_page(client, *, status: str, cursor: Optional[str], limit: int):
    params = {"status": status, "limit": str(limit)}
    if cursor:
        params["cursor"] = cursor
    r = client.get(BASE, params=params, timeout=20)
    r.raise_for_status()
    return r.json()


def market_to_row(market: dict) -> dict:
    """Convert a Kalshi market dict into a raw_documents row.

    `published_at` is the market open time (when the question began
    trading); `raw_payload` holds the structured snapshot including
    the settlement outcome.
    """
    from services.archive_writer import _url_hash

    ticker = market.get("ticker") or ""
    market_url = f"https://kalshi.com/markets/{ticker.split('-')[0]}"
    open_time = market.get("open_time") or datetime.now(timezone.utc).isoformat()
    return {
        "source": "Kalshi",
        "source_type": "prediction_market",
        "url": market_url,
        "url_hash": _url_hash(f"kalshi:{ticker}"),
        "title": market.get("title") or market.get("subtitle") or ticker,
        "content": market.get("yes_sub_title") or market.get("rules_primary"),
        "raw_payload": {
            "ticker": ticker,
            "event_ticker": market.get("event_ticker"),
            "series_ticker": market.get("series_ticker"),
            "status": market.get("status"),
            "result": market.get("result"),
            "open_time": market.get("open_time"),
            "close_time": market.get("close_time"),
            "expiration_time": market.get("expiration_time"),
            "yes_bid": market.get("yes_bid"),
            "yes_ask": market.get("yes_ask"),
            "last_price": market.get("last_price"),
            "previous_yes_bid": market.get("previous_yes_bid"),
            "previous_yes_ask": market.get("previous_yes_ask"),
            "volume": market.get("volume"),
            "volume_24h": market.get("volume_24h"),
            "open_interest": market.get("open_interest"),
            "liquidity": market.get("liquidity"),
            "category": market.get("category"),
            "tags": market.get("tags"),
        },
        "published_at": open_time,
    }


def backfill(
    *,
    status: str,
    max_pages: Optional[int],
    rps: float,
    dry_run: bool,
) -> None:
    try:
        import httpx  # type: ignore
    except ImportError:
        sys.exit("This script requires httpx. Install with: pip install httpx")

    supabase = None
    if not dry_run:
        from supabase import create_client  # type: ignore

        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get(
            "SUPABASE_KEY"
        )
        if not url or not key:
            sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required (or use --dry-run)")
        supabase = create_client(url, key)

    cursor: Optional[str] = None
    page = 0
    total = 0
    sleep_s = 1.0 / max(rps, 0.1)

    with httpx.Client() as client:
        while True:
            page += 1
            if max_pages and page > max_pages:
                logger.info("hit --max-pages %s, stopping", max_pages)
                break

            try:
                data = fetch_page(client, status=status, cursor=cursor, limit=DEFAULT_PAGE_LIMIT)
            except Exception as exc:  # noqa: BLE001
                logger.error("fetch failed page %s: %s", page, exc)
                break

            markets = data.get("markets") or []
            logger.info("page %s: %s markets", page, len(markets))
            if not markets:
                break

            rows = [market_to_row(m) for m in markets]
            if dry_run:
                logger.info("[dry-run] sample first row:")
                logger.info(json.dumps(rows[0], indent=2, default=str)[:800])
                total += len(rows)
            else:
                try:
                    supabase.table("raw_documents").upsert(
                        rows, on_conflict="source,url_hash"
                    ).execute()
                    total += len(rows)
                except Exception as exc:  # noqa: BLE001
                    logger.error("upsert failed page %s: %s", page, exc)

            cursor = data.get("cursor")
            if not cursor:
                logger.info("no more cursors, done")
                break

            time.sleep(sleep_s)

    logger.info("done. total %s rows: %s", "dry-run" if dry_run else "persisted", total)


def main(argv: Optional[List[str]] = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Pull Kalshi markets into raw_documents.")
    parser.add_argument("--status", default="settled",
                        choices=("settled", "active", "closed"),
                        help="market status (default: settled — i.e. resolved)")
    parser.add_argument("--max-pages", type=int, default=None,
                        help="cap on pagination (default: unlimited; full history)")
    parser.add_argument("--rps", type=float, default=2.0,
                        help="requests per second (default 2; Kalshi has no published rate limit on public endpoints)")
    parser.add_argument("--dry-run", action="store_true",
                        help="parse but do not write to Supabase")
    args = parser.parse_args(argv)

    backfill(
        status=args.status,
        max_pages=args.max_pages,
        rps=args.rps,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()

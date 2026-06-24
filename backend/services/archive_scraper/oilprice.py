"""OilPrice.com archive backfill.

OilPrice publishes a paginated news index under
`/Latest-Energy-News/{Category}/Page-N.html`. Each page lists ~20
headlines with timestamps. Pagination depth observed empirically goes
back to the mid-2010s for the World News category and several years
for the Crude Oil Prices and Geopolitics categories.

This script is the operator's tool for one-shot backfills. It does not
run as part of the live request path. Run with:

    python -m backend.services.archive_scraper.oilprice \
        --category World-News --pages 1-50

Adjust pages range to push further back. Be polite — 1 request/sec by
default, override with `--rps`.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import re
import sys
import time
from datetime import datetime, timezone
from typing import Iterable, List, Optional
from urllib.parse import urljoin

logger = logging.getLogger("archive_scraper.oilprice")

CATEGORIES = (
    "World-News",
    "Crude-Oil-Prices",
    "Geopolitics",
    "Natural-Gas",
    "Energy-General",
)

BASE = "https://oilprice.com/Latest-Energy-News"

# Selectors below are minimal and intentionally conservative — OilPrice
# occasionally rearranges its DOM. If scraping starts returning zero
# items, inspect the page source manually before changing these.
_ARTICLE_BLOCK_RE = re.compile(
    r'<div class="categoryArticle[^"]*">(.*?)</div>\s*</div>',
    re.DOTALL,
)
_HREF_TITLE_RE = re.compile(
    r'<a href="(https?://oilprice\.com/[^"]+)"[^>]*>\s*<h2[^>]*>(.*?)</h2>',
    re.DOTALL,
)
_SUMMARY_RE = re.compile(
    r'<p class="categoryArticle__excerpt"[^>]*>(.*?)</p>',
    re.DOTALL,
)
_DATE_RE = re.compile(
    r'<p class="categoryArticle__meta"[^>]*>([^<]+)',
)

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
)


async def _fetch(client, url: str) -> Optional[str]:
    try:
        r = await client.get(url, timeout=15, headers={"User-Agent": USER_AGENT})
        if r.status_code != 200:
            logger.warning("non-200 %s for %s", r.status_code, url)
            return None
        return r.text
    except Exception as exc:  # noqa: BLE001
        logger.warning("fetch failed for %s: %s", url, exc)
        return None


def _strip_html(s: str) -> str:
    return re.sub(r"<[^>]+>", "", s).strip()


def _parse_date(raw: str) -> datetime:
    raw = raw.strip()
    # OilPrice formats: "Jun 23, 2026 at 14:30 | ..."
    m = re.match(r"([A-Z][a-z]+ \d{1,2}, \d{4} at \d{1,2}:\d{2})", raw)
    if m:
        try:
            return datetime.strptime(m.group(1), "%b %d, %Y at %H:%M").replace(
                tzinfo=timezone.utc
            )
        except Exception:  # noqa: BLE001
            pass
    return datetime.now(timezone.utc)


def parse_listing_page(html: str) -> List[dict]:
    """Return a list of {url, title, summary, published_at}."""
    results: List[dict] = []
    for block in _ARTICLE_BLOCK_RE.findall(html):
        m = _HREF_TITLE_RE.search(block)
        if not m:
            continue
        url, title = m.group(1), _strip_html(m.group(2))
        summary_match = _SUMMARY_RE.search(block)
        summary = _strip_html(summary_match.group(1)) if summary_match else ""
        date_match = _DATE_RE.search(block)
        published_at = _parse_date(date_match.group(1)) if date_match else datetime.now(timezone.utc)
        results.append({
            "url": url,
            "title": title,
            "summary": summary,
            "published_at": published_at,
        })
    return results


def _parse_page_range(spec: str) -> Iterable[int]:
    if "-" in spec:
        a, b = spec.split("-", 1)
        return range(int(a), int(b) + 1)
    return [int(spec)]


async def backfill(
    *, category: str, pages: Iterable[int], rps: float, dry_run: bool
) -> None:
    try:
        import httpx  # type: ignore
    except ImportError:
        sys.exit("This script requires httpx. Install with: pip install httpx")

    # Import lazily so this module loads even without supabase configured.
    from supabase import create_client  # type: ignore
    from services.archive_writer import (
        ACTIVE_MODEL_NAME,
        ACTIVE_MODEL_VERSION,
        _url_hash,
    )

    supabase = None
    if not dry_run:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get(
            "SUPABASE_KEY"
        )
        if not url or not key:
            sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required (or use --dry-run)")
        supabase = create_client(url, key)

    sleep_s = 1.0 / max(rps, 0.1)
    total = 0
    async with httpx.AsyncClient() as client:
        for page in pages:
            page_url = f"{BASE}/{category}/Page-{page}.html"
            logger.info("fetching %s", page_url)
            html = await _fetch(client, page_url)
            if not html:
                continue
            items = parse_listing_page(html)
            if not items:
                logger.info("no items on page %s; stopping early", page)
                break

            if dry_run:
                logger.info("[dry-run] would persist %s items from page %s", len(items), page)
                for it in items[:3]:
                    logger.info("  - %s | %s", it["published_at"].isoformat(), it["title"][:80])
                total += len(items)
            else:
                rows = [{
                    "source": "OilPrice.com",
                    "source_type": "news",
                    "url": it["url"],
                    "url_hash": _url_hash(it["url"]),
                    "title": it["title"],
                    "content": it["summary"],
                    "raw_payload": {"category": category, "backfill": True},
                    "published_at": it["published_at"].isoformat(),
                } for it in items]
                try:
                    supabase.table("raw_documents").upsert(
                        rows, on_conflict="source,url_hash"
                    ).execute()
                    total += len(rows)
                    logger.info("persisted %s items from page %s (running total %s)", len(rows), page, total)
                except Exception as exc:  # noqa: BLE001
                    logger.error("upsert failed on page %s: %s", page, exc)

            time.sleep(sleep_s)

    logger.info("done. total items %s: %s", "dry-run" if dry_run else "persisted", total)


def main(argv: Optional[List[str]] = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Backfill OilPrice.com headlines into raw_documents.")
    parser.add_argument("--category", default="World-News", choices=CATEGORIES)
    parser.add_argument("--pages", default="1-10", help="e.g. 1-50 or just 7")
    parser.add_argument("--rps", type=float, default=1.0, help="requests per second (default 1)")
    parser.add_argument("--dry-run", action="store_true", help="parse but do not write to Supabase")
    args = parser.parse_args(argv)

    asyncio.run(backfill(
        category=args.category,
        pages=_parse_page_range(args.pages),
        rps=args.rps,
        dry_run=args.dry_run,
    ))


if __name__ == "__main__":
    main()

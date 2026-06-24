"""Historical archive backfill scrapers.

These are one-shot, operator-run jobs (not part of the live request
path) that pull years of historical news from publicly archived
sources and write into `raw_documents` via `archive_writer`. Each
adapter is idempotent on the document `url_hash` so re-runs are safe.

Run from the repo root, e.g.:

    python -m backend.services.archive_scraper.oilprice --pages 1-50
    python -m backend.services.archive_scraper.kalshi    --status settled
"""

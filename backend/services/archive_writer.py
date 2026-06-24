"""Write-through layer for the historical sentiment archive.

Every news article observed by the live pipeline lands in
`raw_documents`; every sentiment score lands in `sentiment_scores`
tagged with the model version that produced it. Re-runs are
idempotent (unique constraints on `(source, url_hash)` and
`(document_id, model_name, model_version)`).

The fine-tuned commodity model can re-score the entire archive later
by passing a new `model_version` — old scores stay in place for
comparison.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)

# Bump this whenever the scoring pipeline changes (constants, lexicon,
# threshold, model swap). PRs touching `analyze_market_sentiment`,
# `SENTIMENT_RULE_COEF`, or the lexicon loaders must update this.
ACTIVE_MODEL_NAME = "vader_v2_commodity"
ACTIVE_MODEL_VERSION = "2026-06-23"  # date of PR #9 landing


def _url_hash(url: str) -> str:
    return hashlib.sha256(url.strip().lower().encode("utf-8")).hexdigest()


def _to_iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    return None


def _normalize_sentiment(label: Any) -> Optional[str]:
    if not label:
        return None
    s = str(label).lower()
    if s in ("bullish", "bearish", "neutral"):
        return s
    return None


def persist_articles(
    supabase,
    articles: Iterable[Dict[str, Any]],
    *,
    model_name: str = ACTIVE_MODEL_NAME,
    model_version: str = ACTIVE_MODEL_VERSION,
) -> Dict[str, int]:
    """Persist articles and their sentiment scores in two batched upserts.

    Returns counts of rows the write-through *attempted* to land. Actual
    inserts may be lower due to dedup on `(source, url_hash)`.

    Failure here must never break the API response — callers should
    invoke this inside try/except and log on error.
    """
    if supabase is None:
        return {"documents": 0, "scores": 0, "skipped": "no_supabase_client"}

    docs_to_insert: List[Dict[str, Any]] = []
    url_to_score: Dict[str, Dict[str, Any]] = {}

    for article in articles:
        url = (article.get("source_url") or article.get("url") or "").strip()
        if not url:
            continue

        url_hash = _url_hash(url)
        published = _to_iso(article.get("time_published") or article.get("published"))
        if not published:
            published = datetime.now(timezone.utc).isoformat()

        docs_to_insert.append({
            "source": article.get("source") or "unknown",
            "source_type": "news",
            "url": url,
            "url_hash": url_hash,
            "title": article.get("title"),
            "content": article.get("summary"),
            "raw_payload": {
                "categories": article.get("categories"),
                "tickers": article.get("tickers"),
                "keywords": article.get("keywords"),
                "commodity": article.get("commodity"),
                "enhanced": article.get("enhanced", False),
                "word_count": article.get("word_count"),
                "enhancement_method": article.get("enhancement_method"),
            },
            "published_at": published,
        })

        sentiment = _normalize_sentiment(article.get("sentiment"))
        if sentiment is None:
            continue

        score_value = article.get("sentiment_score")
        if score_value is None:
            continue

        url_to_score[(article.get("source") or "unknown", url_hash)] = {
            "sentiment": sentiment,
            "score": float(score_value),
            "confidence": float(score_value),
            "distribution": None,
        }

    if not docs_to_insert:
        return {"documents": 0, "scores": 0}

    # Step 1: upsert documents, returning their ids.
    try:
        doc_response = (
            supabase.table("raw_documents")
            .upsert(docs_to_insert, on_conflict="source,url_hash")
            .execute()
        )
        doc_rows = doc_response.data or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("archive_writer: raw_documents upsert failed: %s", exc)
        return {"documents": 0, "scores": 0, "error": str(exc)}

    # Step 2: build sentiment rows keyed by the document ids returned above.
    score_rows: List[Dict[str, Any]] = []
    for row in doc_rows:
        key = (row.get("source"), row.get("url_hash"))
        score = url_to_score.get(key)
        if not score:
            continue
        score_rows.append({
            "document_id": row["id"],
            "model_name": model_name,
            "model_version": model_version,
            "sentiment": score["sentiment"],
            "score": score["score"],
            "confidence": score["confidence"],
            "distribution": score["distribution"],
        })

    if not score_rows:
        return {"documents": len(doc_rows), "scores": 0}

    try:
        (
            supabase.table("sentiment_scores")
            .upsert(score_rows, on_conflict="document_id,model_name,model_version")
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("archive_writer: sentiment_scores upsert failed: %s", exc)
        return {"documents": len(doc_rows), "scores": 0, "error": str(exc)}

    # Step 3: also populate entity_mentions for whichever rows had a
    # commodity in raw_payload, so the public read API has commodity-keyed
    # data without a separate NER pass. This is intentionally simple — one
    # row per (document, commodity). Richer entity extraction can land in
    # a later PR without breaking this path.
    entity_rows: List[Dict[str, Any]] = []
    score_by_doc = {row["document_id"]: row for row in score_rows}
    for doc_row in doc_rows:
        doc_id = doc_row.get("id")
        payload = doc_row.get("raw_payload") or {}
        commodity = (payload.get("commodity") or "").strip().lower()
        if not commodity or not doc_id:
            continue
        score = score_by_doc.get(doc_id)
        entity_rows.append({
            "document_id": doc_id,
            "entity": commodity,
            "entity_type": "commodity",
            "sentiment": (score or {}).get("sentiment"),
            "score": (score or {}).get("score"),
            "confidence": (score or {}).get("confidence"),
            "model_version": model_version,
        })

    if entity_rows:
        try:
            supabase.table("entity_mentions").insert(entity_rows).execute()
        except Exception as exc:  # noqa: BLE001
            # Non-fatal: scores already persisted. Likely a duplicate-insert
            # race; entity_mentions has no unique constraint by design (one
            # doc can be re-extracted under multiple model versions).
            logger.debug("archive_writer: entity_mentions insert skipped: %s", exc)

    return {
        "documents": len(doc_rows),
        "scores": len(score_rows),
        "entities": len(entity_rows),
    }


def persist_prediction_market_snapshot(
    supabase,
    *,
    market_id: str,
    market_provider: str,
    snapshot_at: datetime,
    market_yes_price: Optional[float],
    related_sentiment: Optional[float],
    article_count: int = 0,
    model_version: str = ACTIVE_MODEL_VERSION,
) -> bool:
    """Record a point-in-time market price alongside contemporaneous sentiment.

    This is what powers the prediction-market overlay product. Idempotent
    on (market_id, snapshot_at, sentiment_model_version).
    """
    if supabase is None:
        return False
    try:
        (
            supabase.table("market_sentiment_overlay")
            .upsert(
                {
                    "market_id": market_id,
                    "market_provider": market_provider,
                    "snapshot_at": _to_iso(snapshot_at),
                    "market_yes_price": market_yes_price,
                    "related_sentiment": related_sentiment,
                    "sentiment_model_version": model_version,
                    "article_count": article_count,
                },
                on_conflict="market_id,snapshot_at,sentiment_model_version",
            )
            .execute()
        )
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("archive_writer: market overlay upsert failed: %s", exc)
        return False

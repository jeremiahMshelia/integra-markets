"""Divergence detector: news sentiment vs. prediction-market consensus.

For a given topic (e.g. "iran_middle_east", "fed_rates"), compares the
recent average news sentiment score (-1 to +1 on Integra's tuned engine)
against the prediction-market implied probability (0 to 1, normalized
to -1 to +1 as `2*p - 1`).

Returns the signed delta and labelled status:
    ALIGNED       small absolute delta
    DIVERGENCE    large absolute delta — sentiment and market disagree

The signal that "news sentiment is more bullish than the market
implies" or vice versa is the v1 product. Direction and magnitude
both surface in the response so callers can render it.

Used by:
    /v1/markets/divergence/{topic}      live API endpoint
    backend/jobs/divergence_monitor.py  background poller for push alerts
    Mobile NewsCard footer              per-article relevant-market badge
    Mobile AIAnalysisOverlay            "Prediction Market View" section
"""

from __future__ import annotations

import datetime as dt
import logging
import statistics
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional

from services import kalshi_public, polymarket_public
from services.topic_taxonomy import TOPICS, matching_markets

logger = logging.getLogger(__name__)


DEFAULT_THRESHOLD = 0.20         # 20-point divergence
DEFAULT_LOOKBACK_HOURS = 24      # window for averaging news sentiment
MAX_MARKETS_PER_PROVIDER = 5     # cap returned related markets


@dataclass
class DivergenceReading:
    topic: str
    topic_label: str
    sentiment_score: Optional[float]            # average news sentiment in window, -1..+1
    sentiment_sample_size: int
    polymarket_implied: Optional[float]          # converted to -1..+1
    polymarket_market_count: int
    kalshi_implied: Optional[float]              # converted to -1..+1
    kalshi_market_count: int
    delta_polymarket: Optional[float]            # sentiment - polymarket_implied
    delta_kalshi: Optional[float]                # sentiment - kalshi_implied
    status_polymarket: str                       # ALIGNED | DIVERGENCE | NO_DATA
    status_kalshi: str
    threshold: float
    related_markets: List[Dict[str, Any]]
    computed_at: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _classify(delta: Optional[float], threshold: float) -> str:
    if delta is None:
        return "NO_DATA"
    return "DIVERGENCE" if abs(delta) >= threshold else "ALIGNED"


def _to_signed(prob: Optional[float]) -> Optional[float]:
    """Convert a 0..1 implied probability to a -1..+1 signed scale."""
    if prob is None:
        return None
    return round(2.0 * prob - 1.0, 4)


def _aggregate_market_prob(markets: List[Dict[str, Any]]) -> Optional[float]:
    """Volume-weighted average yes_price across the matched markets.

    Falls back to simple mean if no volume data. Returns None if no
    markets have a usable price.
    """
    weighted: List[tuple] = []
    for m in markets:
        price = m.get("yes_price")
        if price is None:
            continue
        weight = m.get("volume_24h") or m.get("liquidity") or 1.0
        weighted.append((float(price), float(weight)))
    if not weighted:
        return None
    total_w = sum(w for _, w in weighted)
    if total_w <= 0:
        # All zeros — fall back to simple mean.
        return statistics.fmean([p for p, _ in weighted])
    return sum(p * w for p, w in weighted) / total_w


def _aggregate_sentiment(supabase, topic_key: str, lookback_hours: int) -> tuple:
    """Average news sentiment for `topic_key` over the last N hours.

    Reads from the `entity_mentions` table (populated by archive_writer)
    where the topic_key is recorded under entity_type="topic".
    Returns (avg_score, sample_size).
    """
    if supabase is None:
        return None, 0
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=lookback_hours)).isoformat()
    try:
        rows = (
            supabase.table("entity_mentions")
            .select("score")
            .eq("entity", topic_key)
            .eq("entity_type", "topic")
            .gte("extracted_at", since)
            .limit(2000)
            .execute()
        ).data or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("divergence: sentiment fetch failed for %s: %s", topic_key, exc)
        return None, 0

    scores = [r["score"] for r in rows if r.get("score") is not None]
    if not scores:
        return None, 0
    return round(statistics.fmean(scores), 4), len(scores)


def compute(
    supabase,
    *,
    topic_key: str,
    threshold: float = DEFAULT_THRESHOLD,
    lookback_hours: int = DEFAULT_LOOKBACK_HOURS,
) -> Optional[DivergenceReading]:
    """Compute a divergence reading for one topic.

    Returns None if the topic is unknown. Returns a DivergenceReading
    with NO_DATA statuses if either side has insufficient data — the
    caller can still display "we're watching this but nothing yet".
    """
    topic = TOPICS.get(topic_key)
    if not topic:
        return None

    # 1. News sentiment side.
    sentiment_avg, sample_size = _aggregate_sentiment(supabase, topic_key, lookback_hours)

    # 2. Polymarket side — fetch active markets, filter to topic.
    poly_markets_all = polymarket_public.fetch_active_markets(limit=100)
    poly_matched = matching_markets(topic_key, poly_markets_all, provider="polymarket")
    poly_prob = _aggregate_market_prob(poly_matched)
    poly_signed = _to_signed(poly_prob)

    # 3. Kalshi side — same.
    kalshi_markets_all = kalshi_public.fetch_active_markets(limit=200)
    kalshi_matched = matching_markets(topic_key, kalshi_markets_all, provider="kalshi")
    kalshi_prob = _aggregate_market_prob(kalshi_matched)
    kalshi_signed = _to_signed(kalshi_prob)

    # 4. Deltas.
    delta_poly = (
        round(sentiment_avg - poly_signed, 4)
        if sentiment_avg is not None and poly_signed is not None
        else None
    )
    delta_kalshi = (
        round(sentiment_avg - kalshi_signed, 4)
        if sentiment_avg is not None and kalshi_signed is not None
        else None
    )

    # 5. Build the surfaced related-markets list (capped).
    related = (
        [m for m in poly_matched[:MAX_MARKETS_PER_PROVIDER]]
        + [m for m in kalshi_matched[:MAX_MARKETS_PER_PROVIDER]]
    )

    return DivergenceReading(
        topic=topic_key,
        topic_label=topic["label"],
        sentiment_score=sentiment_avg,
        sentiment_sample_size=sample_size,
        polymarket_implied=poly_signed,
        polymarket_market_count=len(poly_matched),
        kalshi_implied=kalshi_signed,
        kalshi_market_count=len(kalshi_matched),
        delta_polymarket=delta_poly,
        delta_kalshi=delta_kalshi,
        status_polymarket=_classify(delta_poly, threshold),
        status_kalshi=_classify(delta_kalshi, threshold),
        threshold=threshold,
        related_markets=related,
        computed_at=dt.datetime.now(dt.timezone.utc).isoformat(),
    )


def compute_many(
    supabase,
    *,
    topic_keys: List[str],
    threshold: float = DEFAULT_THRESHOLD,
    lookback_hours: int = DEFAULT_LOOKBACK_HOURS,
) -> List[DivergenceReading]:
    """Batch version — used by the background poller and dashboards."""
    out: List[DivergenceReading] = []
    for key in topic_keys:
        reading = compute(
            supabase,
            topic_key=key,
            threshold=threshold,
            lookback_hours=lookback_hours,
        )
        if reading is not None:
            out.append(reading)
    return out

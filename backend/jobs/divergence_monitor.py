"""Divergence monitor — fires push notifications when news sentiment
diverges from prediction-market consensus past each user's threshold.

Runs on a 10-minute interval. For each user with
`divergence_alerts_enabled=true`:

  1. Compute divergence for each of their selected topics
  2. For each topic x selected provider crossing the threshold:
     a. Check anti-spam window (no duplicate alert in last 4h)
     b. Fire push notification
     c. Append to divergence_alerts_log

Anti-spam is enforced by querying the recent log.
"""

from __future__ import annotations

import datetime as dt
import logging
import threading
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


_running_lock = threading.Lock()

ANTI_SPAM_HOURS = 4
DEFAULT_THRESHOLD_PCT = 20.0


def run() -> Dict[str, Any]:
    if not _running_lock.acquire(blocking=False):
        return {"skipped": "still_running"}
    try:
        return _tick()
    finally:
        _running_lock.release()


def _tick() -> Dict[str, Any]:
    try:
        from services._supabase import get_supabase_client
        from services.divergence import compute_many

        supabase = get_supabase_client()
        if supabase is None:
            return {"error": "supabase unavailable"}
    except ImportError as exc:
        return {"error": str(exc)}

    users = _load_users_with_divergence_alerts(supabase)
    logger.info("divergence_monitor: %s users with alerts enabled", len(users))

    notifications_fired = 0
    for user in users:
        try:
            fired = _process_user(supabase, user, compute_many)
            notifications_fired += fired
        except Exception as exc:  # noqa: BLE001
            logger.warning("divergence_monitor: user %s failed: %s",
                           user.get("user_id"), exc)

    return {"users_checked": len(users), "notifications_fired": notifications_fired}


def _load_users_with_divergence_alerts(supabase) -> List[Dict[str, Any]]:
    try:
        rows = (
            supabase.table("alert_preferences")
            .select("user_id, divergence_threshold, divergence_topics, divergence_providers")
            .eq("divergence_alerts_enabled", True)
            .limit(10000)
            .execute()
        ).data or []
        return rows
    except Exception as exc:  # noqa: BLE001
        logger.warning("divergence_monitor: load users failed: %s", exc)
        return []


def _process_user(supabase, user: Dict[str, Any], compute_many) -> int:
    user_id = user.get("user_id")
    threshold_pct = user.get("divergence_threshold") or DEFAULT_THRESHOLD_PCT
    threshold = threshold_pct / 100.0
    topics = user.get("divergence_topics") or []
    providers = user.get("divergence_providers") or ["polymarket", "kalshi"]

    if not topics:
        return 0

    readings = compute_many(supabase, topic_keys=topics, threshold=threshold)
    fired = 0
    for r in readings:
        for provider in providers:
            delta = r.delta_polymarket if provider == "polymarket" else r.delta_kalshi
            status = r.status_polymarket if provider == "polymarket" else r.status_kalshi
            implied = r.polymarket_implied if provider == "polymarket" else r.kalshi_implied
            if status != "DIVERGENCE" or delta is None:
                continue
            if _recently_fired(supabase, user_id, r.topic, provider):
                continue
            _send_push(user_id, r.topic_label, provider, delta)
            _log_fire(supabase, user_id, r, provider, delta, implied, threshold)
            fired += 1
    return fired


def _recently_fired(supabase, user_id: str, topic: str, provider: str) -> bool:
    cutoff = (
        dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=ANTI_SPAM_HOURS)
    ).isoformat()
    try:
        rows = (
            supabase.table("divergence_alerts_log")
            .select("id")
            .eq("user_id", user_id)
            .eq("topic", topic)
            .eq("provider", provider)
            .gte("fired_at", cutoff)
            .limit(1)
            .execute()
        ).data or []
        return bool(rows)
    except Exception:  # noqa: BLE001
        return False


def _send_push(user_id: str, topic_label: str, provider: str, delta: float) -> None:
    """Send a divergence push via the existing notification service.

    Falls back to a logged-only message if the notification service is
    not importable or push fails; the log entry still records that
    divergence was detected.
    """
    try:
        from services.notification_service import notify_user
    except ImportError:
        notify_user = None

    direction = "more bullish than" if delta > 0 else "more bearish than"
    pct = int(abs(delta) * 100)
    title = f"{topic_label} | {pct}pt divergence"
    body = (
        f"News sentiment is {direction} {provider.title()} by {pct} pts. "
        f"Tap to see the article + markets."
    )
    data = {
        "type": "divergence_alert",
        "topic": topic_label,
        "provider": provider,
        "delta": delta,
    }

    if notify_user is None:
        logger.info("divergence push (no notify_user): user=%s %s", user_id, title)
        return

    try:
        notify_user(user_id=user_id, title=title, body=body, data=data)
    except Exception as exc:  # noqa: BLE001
        logger.warning("divergence_monitor: push send failed for %s: %s", user_id, exc)


def _log_fire(supabase, user_id: str, reading, provider: str, delta: float,
              implied: Any, threshold: float) -> None:
    try:
        related_market_id = None
        if reading.related_markets:
            for m in reading.related_markets:
                if m.get("provider") == provider:
                    related_market_id = m.get("id") or m.get("ticker")
                    break
        supabase.table("divergence_alerts_log").insert({
            "user_id": user_id,
            "topic": reading.topic,
            "provider": provider,
            "sentiment_score": reading.sentiment_score,
            "market_implied": implied,
            "delta": delta,
            "threshold": threshold,
            "related_market_id": related_market_id,
        }).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("divergence_monitor: log insert failed: %s", exc)

"""
Notification Engine for Integra Markets
========================================
Two-pronged approach for instant push notifications:

1. EVENT-DRIVEN (instant): Called every time news is fetched via the API.
   `notify_for_articles(articles)` is called from the news pipeline.
   Users get notified within seconds of new articles appearing.

2. BACKSTOP SCHEDULER: Runs every 5 minutes to catch anything the
   event-driven path missed (e.g. if no one opened the app for a while).

Both paths share the same matching + dedup + rate-limiting logic.
"""

import asyncio
import hashlib
import logging
import os
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Set

import httpx

logger = logging.getLogger(__name__)

# Expo Push Notification Service URL
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# Backstop scheduler interval (seconds) — 5 minutes
BACKSTOP_INTERVAL = int(os.getenv("NOTIFICATION_CHECK_INTERVAL", "300"))

# Max notifications per user per hour to avoid spam
MAX_PER_USER_PER_HOUR = 5

# Max notifications per user per scheduler cycle
MAX_PER_USER_PER_CYCLE = 3

# Don't notify on articles older than this (hours)
MAX_ARTICLE_AGE_HOURS = 4

# Commodity alias map for matching
COMMODITY_ALIASES = {
    "CRUDE OIL": ["crude oil", "oil price", "wti", "brent", "petroleum"],
    "WTI": ["wti", "west texas", "crude oil"],
    "BRENT": ["brent", "brent crude", "north sea"],
    "NATURAL GAS": ["natural gas", "nat gas", "lng", "gas price"],
    "NAT GAS": ["natural gas", "nat gas", "lng"],
    "GOLD": ["gold", "xau", "gold price", "bullion"],
    "SILVER": ["silver", "xag", "silver price"],
    "COPPER": ["copper", "copper price"],
    "CORN": ["corn", "corn price", "corn futures"],
    "SOYBEANS": ["soybeans", "soybean", "soy"],
    "WHEAT": ["wheat", "wheat price", "wheat futures"],
    "TIN": ["tin", "tin price"],
    "ZINC": ["zinc", "zinc price"],
}

REGION_ALIASES = {
    "AMERICAS": ["us", "usa", "united states", "america", "brazil", "canada"],
    "EUROPE": ["europe", "eu", "uk", "britain", "germany", "france"],
    "ASIA": ["asia", "china", "japan", "india", "asia pacific"],
    "AFRICA": ["africa", "nigeria", "south africa", "kenya"],
    "MIDDLE EAST": ["middle east", "opec", "saudi", "uae", "iran", "iraq"],
}

CURRENCY_ALIASES = {
    "USD": ["dollar", "usd", "greenback"],
    "EUR": ["euro", "eur", "eurozone"],
    "GBP": ["pound", "gbp", "sterling"],
    "JPY": ["yen", "jpy"],
    "NGN": ["naira", "ngn", "nigeria"],
}


class NotificationEngine:
    """Handles matching articles to users and sending push notifications."""

    def __init__(self):
        self._backstop_task: Optional[asyncio.Task] = None
        self._running = False

        # Dedup: set of "user_id:article_hash" we've already notified
        self._sent: Set[str] = set()
        self._sent_expiry: Dict[str, datetime] = {}

        # Rate limit: per-user timestamps of sent notifications
        self._user_timestamps: Dict[str, List[datetime]] = {}

        # Supabase client (lazy init)
        self._supabase = None
        
        # Lock to prevent concurrent notification runs
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # Supabase
    # ------------------------------------------------------------------
    def _get_supabase(self):
        if self._supabase is None:
            try:
                from supabase import create_client
                url = os.getenv("SUPABASE_URL")
                key = os.getenv("SUPABASE_KEY")
                if url and key:
                    self._supabase = create_client(url, key)
                    logger.info("[Notif] Supabase client ready")
                else:
                    logger.warning("[Notif] SUPABASE_URL/KEY missing — notifications disabled")
            except Exception:
                logger.exception("[Notif] Failed to init Supabase")
        return self._supabase

    # ------------------------------------------------------------------
    # Lifecycle (backstop scheduler)
    # ------------------------------------------------------------------
    def start(self):
        """Start the backstop scheduler."""
        if self._running:
            return
        self._running = True
        self._backstop_task = asyncio.create_task(self._backstop_loop())
        logger.info("[Notif] Engine started (backstop every %ds)", BACKSTOP_INTERVAL)

    def stop(self):
        self._running = False
        if self._backstop_task:
            self._backstop_task.cancel()
            self._backstop_task = None
        logger.info("[Notif] Engine stopped")

    async def _backstop_loop(self):
        """Periodically fetch news and send notifications as a backstop."""
        await asyncio.sleep(60)  # Let server finish starting

        while self._running:
            try:
                articles = await self._fetch_articles_for_backstop()
                if articles:
                    await self.notify_for_articles(articles)
            except Exception:
                logger.exception("[Notif] Backstop loop error")

            self._cleanup_expired()
            await asyncio.sleep(BACKSTOP_INTERVAL)

    async def _fetch_articles_for_backstop(self) -> List[Dict]:
        """Fetch latest articles for the backstop scheduler."""
        try:
            from services.news import news_service, NewsService
            ns = news_service if news_service else NewsService()
            result = await ns.get_latest_news(limit=30, include_sentiment=False)
            if isinstance(result, dict):
                return result.get("articles", [])
            return result if isinstance(result, list) else []
        except Exception:
            logger.exception("[Notif] Error fetching articles for backstop")
            return []

    # ------------------------------------------------------------------
    # PUBLIC API: called from the news pipeline
    # ------------------------------------------------------------------
    async def notify_for_articles(self, articles: List[Dict[str, Any]]):
        """
        Match articles against all users' preferences and send push notifications.
        Called INSTANTLY when news is fetched — no delay.
        
        This is safe to call multiple times with the same articles (dedup handles it).
        """
        if not articles:
            return

        # Use lock to prevent concurrent runs
        if self._lock.locked():
            logger.debug("[Notif] Skipping — another notification run in progress")
            return

        async with self._lock:
            await self._do_notify(articles)

    async def _do_notify(self, articles: List[Dict[str, Any]]):
        sb = self._get_supabase()
        if not sb:
            return

        # Filter to recent articles only
        cutoff = datetime.utcnow() - timedelta(hours=MAX_ARTICLE_AGE_HOURS)
        recent = []
        for a in articles:
            pub = a.get("published", "")
            if pub:
                try:
                    pub_dt = datetime.fromisoformat(
                        str(pub).replace("Z", "+00:00")
                    ).replace(tzinfo=None)
                    if pub_dt >= cutoff:
                        recent.append(a)
                except (ValueError, TypeError):
                    recent.append(a)
            else:
                recent.append(a)

        if not recent:
            return

        # Get all users with active push tokens
        users = self._get_push_token_users(sb)
        if not users:
            return

        # Get all user preferences at once
        user_ids = list(set(u["user_id"] for u in users))
        prefs_map = self._get_all_preferences(sb, user_ids)

        # Match and send for each user
        total_sent = 0
        for user in users:
            uid = user["user_id"]
            token = user.get("expo_push_token", "")
            if not token:
                continue

            prefs = prefs_map.get(uid, {})
            if prefs.get("push_enabled") is False:
                continue

            matched = self._match_articles(recent, prefs)
            if matched:
                sent = await self._send_for_user(uid, token, matched)
                total_sent += sent

        if total_sent > 0:
            logger.info("[Notif] ✅ Sent %d notifications to users", total_sent)

    # ------------------------------------------------------------------
    # Data fetching (Supabase)
    # ------------------------------------------------------------------
    def _get_push_token_users(self, sb) -> List[Dict]:
        try:
            result = sb.table("push_tokens")\
                .select("user_id, expo_push_token, device_type")\
                .eq("is_active", True)\
                .execute()
            data = result.data if hasattr(result, "data") else []
            return [u for u in data if u.get("expo_push_token")]
        except Exception:
            logger.exception("[Notif] Error fetching push tokens")
            return []

    def _get_all_preferences(self, sb, user_ids: List[str]) -> Dict[str, Dict]:
        try:
            result = sb.table("alert_preferences")\
                .select("*")\
                .in_("user_id", user_ids)\
                .execute()
            data = result.data if hasattr(result, "data") else []
            return {row["user_id"]: row for row in data}
        except Exception:
            logger.exception("[Notif] Error fetching preferences")
            return {}

    # ------------------------------------------------------------------
    # Article matching
    # ------------------------------------------------------------------
    def _match_articles(
        self, articles: List[Dict], prefs: Dict
    ) -> List[Dict]:
        commodities = [c.upper() for c in (prefs.get("commodities") or [])]
        keywords = [k.lower() for k in (prefs.get("keywords") or [])]
        regions = [r.upper() for r in (prefs.get("regions") or [])]
        currencies = [c.upper() for c in (prefs.get("currencies") or [])]

        if not commodities and not keywords and not regions and not currencies:
            return []

        matched = []
        for article in articles:
            title = (article.get("title") or "").lower()
            summary = (article.get("summary") or "").lower()
            commodity_tag = (article.get("commodity") or "").upper()
            text = f"{title} {summary}"

            reasons = []

            for c in commodities:
                terms = COMMODITY_ALIASES.get(c, [c.lower()])
                if commodity_tag == c or any(t in text for t in terms):
                    reasons.append(c)
                    break

            for kw in keywords:
                if kw in text:
                    reasons.append(f"Keyword: {kw}")
                    break

            for r in regions:
                terms = REGION_ALIASES.get(r, [r.lower()])
                if any(t in text for t in terms):
                    reasons.append(f"Region: {r}")
                    break

            for curr in currencies:
                terms = CURRENCY_ALIASES.get(curr, [curr.lower()])
                if any(t in text for t in terms):
                    reasons.append(f"Currency: {curr}")
                    break

            if reasons:
                matched.append({"article": article, "reasons": reasons})

        return matched

    # ------------------------------------------------------------------
    # Sending
    # ------------------------------------------------------------------
    async def _send_for_user(
        self, user_id: str, token: str, matched: List[Dict]
    ) -> int:
        sent = 0

        for item in matched:
            article = item["article"]
            reasons = item["reasons"]

            # Dedup check
            ahash = hashlib.md5(
                (article.get("title", "") + article.get("url", "")).encode()
            ).hexdigest()[:12]
            dedup_key = f"{user_id}:{ahash}"
            if dedup_key in self._sent:
                continue

            # Rate limit check
            if not self._rate_ok(user_id):
                break

            # Build notification
            commodity = article.get("commodity", "")
            source = article.get("source", "")
            title = article.get("title", "Market Update")

            if commodity:
                notif_title = f"📊 {commodity} Alert"
            else:
                notif_title = f"📰 Market Alert"

            summary = article.get("summary", "")
            if summary and len(summary) > 20:
                notif_body = summary[:180] + ("…" if len(summary) > 180 else "")
            else:
                notif_body = title[:180]

            if source:
                notif_body += f" — {source}"

            ok = await self._send_expo(
                token=token,
                title=notif_title,
                body=notif_body,
                data={
                    "type": "market_alert",
                    "article_url": article.get("url", ""),
                    "commodity": commodity,
                    "source": source,
                },
            )

            if ok:
                self._sent.add(dedup_key)
                self._sent_expiry[dedup_key] = datetime.utcnow() + timedelta(hours=12)
                self._record_rate(user_id)
                sent += 1

            if sent >= MAX_PER_USER_PER_CYCLE:
                break

        return sent

    async def _send_expo(
        self, token: str, title: str, body: str, data: Optional[Dict] = None
    ) -> bool:
        message = {
            "to": token,
            "title": title,
            "body": body,
            "sound": "default",
            "priority": "high",
            "data": data or {},
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    EXPO_PUSH_URL,
                    json=[message],
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                    },
                )
                if resp.status_code == 200:
                    result = resp.json()
                    tickets = result.get("data", [])
                    if tickets and tickets[0].get("status") == "ok":
                        logger.info("[Notif] ✅ Pushed: %s", title[:50])
                        return True
                    elif tickets and tickets[0].get("status") == "error":
                        detail = tickets[0].get("details", {})
                        err = detail.get("error", "")
                        logger.warning("[Notif] Expo error: %s", err)
                        if err == "DeviceNotRegistered":
                            self._deactivate_token(token)
                        return False
                    return True  # no ticket info but 200 OK
                else:
                    logger.error("[Notif] Expo HTTP %d: %s", resp.status_code, resp.text[:200])
                    return False
        except Exception:
            logger.exception("[Notif] Send failed")
            return False

    def _deactivate_token(self, token: str):
        sb = self._get_supabase()
        if sb:
            try:
                sb.table("push_tokens").update({"is_active": False})\
                    .eq("expo_push_token", token).execute()
                logger.info("[Notif] Deactivated token: %s…", token[:20])
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Rate limiting
    # ------------------------------------------------------------------
    def _rate_ok(self, user_id: str) -> bool:
        cutoff = datetime.utcnow() - timedelta(hours=1)
        if user_id in self._user_timestamps:
            self._user_timestamps[user_id] = [
                ts for ts in self._user_timestamps[user_id] if ts > cutoff
            ]
            return len(self._user_timestamps[user_id]) < MAX_PER_USER_PER_HOUR
        return True

    def _record_rate(self, user_id: str):
        self._user_timestamps.setdefault(user_id, []).append(datetime.utcnow())

    def _cleanup_expired(self):
        now = datetime.utcnow()
        expired = [k for k, exp in self._sent_expiry.items() if exp < now]
        for k in expired:
            self._sent.discard(k)
            del self._sent_expiry[k]


# Singleton
notification_engine = NotificationEngine()

"""Outcome evaluator — closes the learning loop.

Runs as a background task inside the FastAPI process. Every
``EVALUATION_INTERVAL`` seconds it:

1. Reads ``predictions`` rows where ``evaluated = false`` and
   ``predicted_at < now() - horizon_hours``.
2. Fetches the commodity's price change over the horizon via Alpha Vantage.
3. Determines the actual direction (bullish/bearish/neutral) using a small
   dead-zone around 0.
4. Computes a reward, writes a ``prediction_outcomes`` row, marks the
   prediction evaluated, and injects a supervised experience into the
   learning loop.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional

from services.learning_loop import TrainingResult

logger = logging.getLogger(__name__)

EVALUATION_INTERVAL_SECONDS = int(__import__("os").environ.get(
    "LEARNING_LOOP_EVAL_INTERVAL_SECONDS", "3600"
))
DEFAULT_HORIZON_HOURS = 24
DEAD_ZONE_PCT = 0.25  # |change| < 0.25% considered neutral


class OutcomeEvaluator:
    """Background coroutine; instantiated and scheduled by main.py."""

    def __init__(
        self,
        supabase: Any,
        learning_loop: Any,
        alpha_vantage_client: Any,
        interval_seconds: int = EVALUATION_INTERVAL_SECONDS,
        horizon_hours: int = DEFAULT_HORIZON_HOURS,
    ) -> None:
        self.supabase = supabase
        self.loop = learning_loop
        self.av = alpha_vantage_client
        self.interval = interval_seconds
        self.horizon = horizon_hours
        self._task: Optional[asyncio.Task] = None
        self._stop = asyncio.Event()

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop.clear()
            self._task = asyncio.create_task(self._run_forever(), name="outcome_evaluator")
            logger.info("outcome evaluator started; interval=%ss", self.interval)

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            await self._task

    async def _run_forever(self) -> None:
        while not self._stop.is_set():
            try:
                await self.evaluate_pending()
            except Exception:  # noqa: BLE001
                logger.exception("outcome evaluator iteration failed")
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self.interval)
            except asyncio.TimeoutError:
                continue

    async def evaluate_pending(self) -> Dict[str, int]:
        """Evaluate all predictions whose horizon has elapsed."""
        if not self.supabase:
            return {"evaluated": 0, "skipped": 0, "reason": "no_supabase"}

        rows = self._fetch_pending_rows()
        if rows is None:
            return {"evaluated": 0, "skipped": 0, "error": "fetch_failed"}

        change_pct_by_commodity = await self._prefetch_changes(rows)
        evaluated = sum(
            1 for row in rows
            if await self._evaluate_row(row, change_pct_by_commodity) is not None
        )
        await self._log_snapshot(evaluated)
        return {"evaluated": evaluated, "skipped": len(rows) - evaluated}

    def _fetch_pending_rows(self) -> Optional[List[Dict[str, Any]]]:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=self.horizon)).isoformat()
        try:
            return (
                self.supabase.table("predictions")
                .select("*")
                .eq("evaluated", False)
                .lte("predicted_at", cutoff)
                .limit(200)
                .execute()
                .data
                or []
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("predictions fetch failed: %s", exc)
            return None

    async def _prefetch_changes(self, rows: Iterable[Dict[str, Any]]) -> Dict[str, Optional[float]]:
        """Fetch price change once per unique commodity (avoids N+1)."""
        commodities = {row["commodity"] for row in rows if row.get("commodity")}
        results = await asyncio.gather(
            *(self._fetch_change_pct(c, self.horizon) for c in commodities),
            return_exceptions=True,
        )
        out: Dict[str, Optional[float]] = {}
        for commodity, value in zip(commodities, results):
            out[commodity] = value if not isinstance(value, Exception) else None
        return out

    async def _evaluate_row(
        self,
        row: Dict[str, Any],
        change_cache: Dict[str, Optional[float]],
    ) -> Optional[Dict[str, Any]]:
        commodity = row.get("commodity")
        if not commodity:
            self._mark_evaluated(row["id"], reason="no_commodity")
            return None
        change_pct = change_cache.get(commodity)
        if change_pct is None:
            return None

        actual = _direction_from_change(change_pct)
        predicted = row.get("predicted_sentiment")
        reward = _compute_reward(predicted, actual, change_pct)

        if not self._persist_outcome(row["id"], actual, change_pct, reward):
            return None
        await self._feed_learning_loop(row, actual, predicted, reward)
        return {"prediction_id": row["id"], "reward": reward}

    def _persist_outcome(
        self, prediction_id: str, actual: str, change_pct: float, reward: float
    ) -> bool:
        try:
            self.supabase.table("prediction_outcomes").upsert({
                "prediction_id": prediction_id,
                "actual_direction": actual,
                "price_change_pct": change_pct,
                "reward": reward,
                "horizon_hours": self.horizon,
            }).execute()
            self._mark_evaluated(prediction_id)
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("outcome upsert failed: %s", exc)
            return False

    async def _feed_learning_loop(
        self,
        row: Dict[str, Any],
        actual: str,
        predicted: Optional[str],
        reward: float,
    ) -> None:
        text = row.get("article_title") or ""
        keywords = [
            k.get("text") if isinstance(k, dict) else k
            for k in (row.get("keywords") or [])
        ]
        try:
            await self.loop.capture_experience(
                text=text,
                label=actual,
                reward=reward,
                commodity=row.get("commodity"),
                source=row.get("source"),
                keywords=keywords,
                weight=1.0,
                correct=(predicted == actual),
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("learning loop capture failed: %s", exc)

    async def _log_snapshot(self, n_evaluated: int) -> None:
        await self.loop._log_training_event(  # noqa: SLF001
            "snapshot",
            TrainingResult(loss=0.0, reward_mean=0.0, n_experiences=n_evaluated, batch_size=0),
        )

    def _mark_evaluated(self, prediction_id: str, reason: Optional[str] = None) -> None:
        try:
            self.supabase.table("predictions").update({"evaluated": True}).eq(
                "id", prediction_id
            ).execute()
        except Exception as exc:  # noqa: BLE001
            logger.warning("mark evaluated failed (%s): %s", reason, exc)

    async def _fetch_change_pct(self, commodity: str, horizon_hours: int) -> Optional[float]:
        if not self.av:
            return None
        try:
            series = await self.av.commodity_series(commodity)
            if not series or len(series) < 2:
                return None
            latest = float(series[-1]["close"])
            steps_back = max(1, horizon_hours // 24)
            baseline = float(series[max(0, -1 - steps_back)]["close"])
            if baseline == 0:
                return None
            return (latest - baseline) / baseline * 100.0
        except Exception as exc:  # noqa: BLE001
            logger.warning("alpha_vantage commodity_series failed: %s", exc)
            return None


def _direction_from_change(change_pct: float) -> str:
    if change_pct > DEAD_ZONE_PCT:
        return "bullish"
    if change_pct < -DEAD_ZONE_PCT:
        return "bearish"
    return "neutral"


def _compute_reward(predicted: Optional[str], actual: str, change_pct: float) -> float:
    """Reward in [-1, 1]. Magnitude scales with realized move."""
    base = 1.0 if predicted == actual else -0.5
    magnitude = min(abs(change_pct) / 5.0, 1.0)  # cap at ±5%
    return base * (0.5 + 0.5 * magnitude)

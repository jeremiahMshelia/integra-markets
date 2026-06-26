"""APScheduler-style cron orchestrator using stdlib threading.

Avoids adding apscheduler as a dependency for v1. Each job is a
plain `run()` callable; the scheduler runs them on independent
intervals in daemon threads and logs failures without crashing the
process.

Attached at FastAPI app startup in main.py.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Callable, Dict, Optional

logger = logging.getLogger(__name__)


class _SchedulerThread(threading.Thread):
    def __init__(self, name: str, fn: Callable[[], None], interval_s: int):
        super().__init__(daemon=True, name=f"scheduler-{name}")
        self._fn = fn
        self._interval_s = interval_s
        self._stop_event = threading.Event()
        self._job_name = name

    def stop(self) -> None:
        self._stop_event.set()

    def run(self) -> None:  # noqa: D401
        logger.info("scheduler: %s starting, interval=%ss", self._job_name, self._interval_s)
        while not self._stop_event.is_set():
            try:
                result = self._fn()
                if result is not None:
                    logger.info("scheduler: %s tick ok: %s", self._job_name, result)
            except Exception as exc:  # noqa: BLE001
                logger.exception("scheduler: %s tick raised: %s", self._job_name, exc)
            # Sleep in 1-second slices so stop() is responsive.
            for _ in range(self._interval_s):
                if self._stop_event.is_set():
                    return
                time.sleep(1)


_threads: Dict[str, _SchedulerThread] = {}


def start_all() -> None:
    """Spawn all jobs. Idempotent — safe to call once from app startup."""
    if _threads:
        return
    try:
        from jobs import divergence_monitor, news_fetcher
    except ImportError as exc:
        logger.warning("scheduler: jobs not importable: %s", exc)
        return

    # News fetcher every 10 min — keeps the archive populated and the
    # divergence detector fed with fresh sentiment data.
    t1 = _SchedulerThread("news_fetcher", news_fetcher.run, interval_s=600)
    t1.start()
    _threads["news_fetcher"] = t1

    # Divergence monitor every 10 min — slight offset would be nicer
    # but stagger isn't critical at this cadence.
    t2 = _SchedulerThread("divergence_monitor", divergence_monitor.run, interval_s=600)
    t2.start()
    _threads["divergence_monitor"] = t2


def stop_all() -> None:
    for t in _threads.values():
        t.stop()
    _threads.clear()

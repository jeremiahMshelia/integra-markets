"""Online learning loop for sentiment classification + keyword bandit.

This module replaces the stubbed DQN classes in `enhanced_sentiment.py` with
something that actually trains. The framing here is **online supervised
learning with reward-weighted loss** for sentiment classification, plus a
**UCB1 contextual bandit** for keyword lexicon expansion. That matches the
problem structure (independent articles, delayed reward at 24h, no sequential
decisions) far better than DQN or PPO would.

Components
----------
- ``ArticleFeaturizer``: deterministic hashing-trick bag-of-words plus
  commodity / source one-hot. No fitted vocabulary, so cold-start works and
  features stay stable across restarts.
- ``SentimentMLP``: 3-class softmax over ``{bullish, bearish, neutral}``.
- ``ReplayBuffer``: keeps the last N (features, label, reward) tuples for
  stable mini-batch training.
- ``KeywordBandit``: UCB1 scoring of each keyword as a predictor; the top-K
  rising keywords get promoted into the commodity lexicon.
- ``LearningLoop``: singleton orchestrating predict + capture + train +
  persist.

Persistence is dual-write: model weights to disk (``.pth`` snapshot) and
training events / keyword stats to Supabase tables defined in
``supabase/migrations/20260527_learning_loop.sql``.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import math
import os
import random
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim

logger = logging.getLogger(__name__)

SENTIMENTS: Tuple[str, ...] = ("bullish", "bearish", "neutral")
SENTIMENT_INDEX: Dict[str, int] = {s: i for i, s in enumerate(SENTIMENTS)}

DEFAULT_VOCAB_BUCKETS = 4096
DEFAULT_COMMODITY_DIM = 16
DEFAULT_SOURCE_DIM = 32
DEFAULT_HIDDEN_DIM = 128
DEFAULT_REPLAY_CAPACITY = 4096
DEFAULT_BATCH_SIZE = 64
DEFAULT_LEARNING_RATE = 1e-3
DEFAULT_MIN_BATCH_TO_TRAIN = 32
DEFAULT_MODEL_DIR = Path(os.getenv("LEARNING_LOOP_MODEL_DIR", "/app/models/learning_loop"))


@dataclass
class TrainingResult:
    loss: float
    reward_mean: float
    n_experiences: int
    batch_size: int


class ArticleFeaturizer:
    """Deterministic feature extractor — no fitted vocabulary required."""

    def __init__(
        self,
        vocab_buckets: int = DEFAULT_VOCAB_BUCKETS,
        commodity_dim: int = DEFAULT_COMMODITY_DIM,
        source_dim: int = DEFAULT_SOURCE_DIM,
    ) -> None:
        self.vocab_buckets = vocab_buckets
        self.commodity_dim = commodity_dim
        self.source_dim = source_dim

    @property
    def dim(self) -> int:
        return self.vocab_buckets + self.commodity_dim + self.source_dim

    @staticmethod
    def tokenize(text: str) -> List[str]:
        if not text:
            return []
        return [tok for tok in (
            "".join(ch.lower() if ch.isalnum() else " " for ch in text)
        ).split() if len(tok) > 2]

    def _hash_bucket(self, token: str, buckets: int) -> int:
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=4).digest()
        return int.from_bytes(digest, "big") % buckets

    def featurize(
        self,
        text: str,
        commodity: Optional[str] = None,
        source: Optional[str] = None,
    ) -> torch.Tensor:
        vec = torch.zeros(self.dim, dtype=torch.float32)
        tokens = self.tokenize(text)
        if tokens:
            for token in tokens:
                vec[self._hash_bucket(token, self.vocab_buckets)] += 1.0
            vec[: self.vocab_buckets] = F.normalize(
                vec[: self.vocab_buckets], p=2, dim=0
            )
        if commodity:
            bucket = self._hash_bucket(commodity.lower(), self.commodity_dim)
            vec[self.vocab_buckets + bucket] = 1.0
        if source:
            bucket = self._hash_bucket(source.lower(), self.source_dim)
            vec[self.vocab_buckets + self.commodity_dim + bucket] = 1.0
        return vec


class SentimentMLP(nn.Module):
    """3-class sentiment classifier with two hidden layers."""

    def __init__(self, input_dim: int, hidden_dim: int = DEFAULT_HIDDEN_DIM) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, len(SENTIMENTS)),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class ReplayBuffer:
    """Bounded buffer of (features, label_index, reward, weight) tuples."""

    def __init__(self, capacity: int = DEFAULT_REPLAY_CAPACITY) -> None:
        self.buffer: deque = deque(maxlen=capacity)

    def __len__(self) -> int:
        return len(self.buffer)

    def push(
        self,
        features: torch.Tensor,
        label_idx: int,
        reward: float,
        weight: float = 1.0,
    ) -> None:
        self.buffer.append((features.detach().cpu(), label_idx, float(reward), float(weight)))

    def sample(self, batch_size: int) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        batch = random.sample(self.buffer, batch_size)
        features = torch.stack([b[0] for b in batch])
        labels = torch.tensor([b[1] for b in batch], dtype=torch.long)
        weights = torch.tensor([b[2] * b[3] for b in batch], dtype=torch.float32)
        return features, labels, weights


DEFAULT_BANDIT_MAX_KEYWORDS = 10_000


class KeywordBandit:
    """UCB1 bandit over keywords. Tracks (n, n_correct, reward_sum) in memory.

    Upper confidence bound:
        ucb(k) = mean_reward(k) + sqrt(2 * ln(N_total) / n(k))

    where ``N_total`` is the total number of evaluated predictions and ``n(k)``
    is the count for keyword ``k``. Cold keywords get an exploration bonus.

    Capped at ``max_keywords`` entries; lowest-score keywords are evicted when
    the cap is reached so memory stays bounded.
    """

    def __init__(self, max_keywords: int = DEFAULT_BANDIT_MAX_KEYWORDS) -> None:
        self.stats: Dict[str, Dict[str, float]] = {}
        self.total_evaluations: int = 0
        self.max_keywords = max_keywords

    def observe(self, keyword: str, reward: float, correct: bool) -> None:
        if keyword not in self.stats and len(self.stats) >= self.max_keywords:
            self._evict_lowest()
        stat = self.stats.setdefault(
            keyword,
            {"n": 0, "n_correct": 0, "sum_reward": 0.0, "first_seen": time.time()},
        )
        stat["n"] += 1
        stat["n_correct"] += int(bool(correct))
        stat["sum_reward"] += reward
        self.total_evaluations += 1

    def _evict_lowest(self) -> None:
        """Drop the keyword with the lowest mean reward (ties broken by fewest pulls)."""
        if not self.stats:
            return
        victim = min(
            self.stats.items(),
            key=lambda item: (
                item[1]["sum_reward"] / max(item[1]["n"], 1),
                -item[1]["n"],
            ),
        )[0]
        self.stats.pop(victim, None)

    def score(self, keyword: str) -> float:
        stat = self.stats.get(keyword)
        if not stat or stat["n"] == 0:
            return float("inf")  # explore unseen keywords first
        mean_reward = stat["sum_reward"] / stat["n"]
        exploration = math.sqrt(
            2.0 * math.log(max(self.total_evaluations, 1)) / stat["n"]
        )
        return mean_reward + exploration

    def top_k(self, k: int = 25, min_observations: int = 5) -> List[Tuple[str, float]]:
        scored = [
            (kw, self.score(kw))
            for kw, stat in self.stats.items()
            if stat["n"] >= min_observations
        ]
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:k]


class LearningLoop:
    """Singleton orchestrator. Use ``get_learning_loop()`` to access it."""

    def __init__(
        self,
        featurizer: Optional[ArticleFeaturizer] = None,
        model: Optional[SentimentMLP] = None,
        learning_rate: float = DEFAULT_LEARNING_RATE,
        replay_capacity: int = DEFAULT_REPLAY_CAPACITY,
        batch_size: int = DEFAULT_BATCH_SIZE,
        min_batch_to_train: int = DEFAULT_MIN_BATCH_TO_TRAIN,
        model_dir: Path = DEFAULT_MODEL_DIR,
        supabase_writer: Optional[Any] = None,
    ) -> None:
        self.featurizer = featurizer or ArticleFeaturizer()
        self.model = model or SentimentMLP(self.featurizer.dim)
        self.optimizer = optim.Adam(self.model.parameters(), lr=learning_rate)
        self.replay = ReplayBuffer(capacity=replay_capacity)
        self.bandit = KeywordBandit()
        self.batch_size = batch_size
        self.min_batch_to_train = min_batch_to_train
        self.learning_rate = learning_rate
        self.model_dir = Path(model_dir)
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.model_version = "v1"
        self.supabase = supabase_writer  # injected by main.py to avoid circular import
        self._lock = asyncio.Lock()
        self._load_snapshot_if_exists()

    @property
    def snapshot_path(self) -> Path:
        return self.model_dir / "sentiment_mlp.pth"

    def predict(
        self,
        text: str,
        commodity: Optional[str] = None,
        source: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Return predicted sentiment distribution + best label."""
        self.model.eval()
        features = self.featurizer.featurize(text, commodity, source)
        with torch.no_grad():
            logits = self.model(features.unsqueeze(0))
            probs = F.softmax(logits, dim=-1).squeeze(0)
        best_idx = int(probs.argmax().item())
        return {
            "sentiment": SENTIMENTS[best_idx],
            "confidence": float(probs[best_idx].item()),
            "distribution": {SENTIMENTS[i]: float(probs[i].item()) for i in range(3)},
            "feature_dim": self.featurizer.dim,
            "model_version": self.model_version,
        }

    async def capture_experience(
        self,
        text: str,
        label: str,
        reward: float,
        commodity: Optional[str] = None,
        source: Optional[str] = None,
        keywords: Optional[Iterable[str]] = None,
        weight: float = 1.0,
        correct: Optional[bool] = None,
    ) -> Optional[TrainingResult]:
        """Add one (features, label, reward) experience and maybe train.

        ``correct`` is used purely for bandit accounting; if ``None`` it is
        inferred from ``reward > 0``.
        """
        if label not in SENTIMENT_INDEX:
            raise ValueError(f"unknown sentiment label: {label}")
        features = self.featurizer.featurize(text, commodity, source)
        self.replay.push(features, SENTIMENT_INDEX[label], reward, weight)
        is_correct = correct if correct is not None else reward > 0
        for kw in keywords or []:
            self.bandit.observe(kw, reward, is_correct)
        if len(self.replay) >= self.min_batch_to_train:
            return await self.train_step()
        return None

    async def train_step(self) -> TrainingResult:
        """Single gradient step on a sampled mini-batch."""
        async with self._lock:
            self.model.train()
            n = min(self.batch_size, len(self.replay))
            features, labels, weights = self.replay.sample(n)
            self.optimizer.zero_grad()
            logits = self.model(features)
            per_example = F.cross_entropy(logits, labels, reduction="none")
            loss = (per_example * weights).mean()
            loss.backward()
            self.optimizer.step()
            result = TrainingResult(
                loss=float(loss.item()),
                reward_mean=float(weights.mean().item()),
                n_experiences=len(self.replay),
                batch_size=n,
            )
        await self._log_training_event("gradient_step", result)
        return result

    def save_snapshot(self) -> None:
        torch.save(
            {
                "model_state": self.model.state_dict(),
                "optimizer_state": self.optimizer.state_dict(),
                "model_version": self.model_version,
                "feature_dim": self.featurizer.dim,
            },
            self.snapshot_path,
        )

    def _load_snapshot_if_exists(self) -> None:
        if not self.snapshot_path.exists():
            return
        try:
            payload = torch.load(self.snapshot_path, map_location="cpu")
            if payload.get("feature_dim") != self.featurizer.dim:
                logger.warning("snapshot feature_dim mismatch; ignoring snapshot")
                return
            self.model.load_state_dict(payload["model_state"])
            self.optimizer.load_state_dict(payload["optimizer_state"])
            self.model_version = payload.get("model_version", self.model_version)
            logger.info("loaded learning-loop snapshot from %s", self.snapshot_path)
        except Exception as exc:  # noqa: BLE001 — best-effort recovery
            logger.warning("failed to load snapshot: %s", exc)

    async def _log_training_event(self, kind: str, result: TrainingResult) -> None:
        if not self.supabase:
            return
        try:
            await asyncio.to_thread(
                self.supabase.table("training_events").insert,
                {
                    "kind": kind,
                    "n_experiences": result.n_experiences,
                    "batch_size": result.batch_size,
                    "reward_mean": result.reward_mean,
                    "loss": result.loss,
                    "learning_rate": self.learning_rate,
                    "model_version": self.model_version,
                },
            )
        except Exception as exc:  # noqa: BLE001 — telemetry shouldn't crash training
            logger.warning("failed to log training event: %s", exc)

    def snapshot_metrics(self) -> Dict[str, Any]:
        return {
            "replay_size": len(self.replay),
            "model_version": self.model_version,
            "feature_dim": self.featurizer.dim,
            "n_keywords_tracked": len(self.bandit.stats),
            "bandit_total_evaluations": self.bandit.total_evaluations,
            "top_keywords": self.bandit.top_k(k=10),
        }


_singleton: Optional[LearningLoop] = None


def get_learning_loop() -> LearningLoop:
    global _singleton
    if _singleton is None:
        _singleton = LearningLoop()
    return _singleton


def attach_supabase(client: Any) -> None:
    """Wire a Supabase client to the singleton for telemetry writes."""
    loop = get_learning_loop()
    loop.supabase = client

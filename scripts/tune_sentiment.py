#!/usr/bin/env python3
"""Reproducible grid search for sentiment-engine tuning constants.

Runs the production `analyze_market_sentiment` flow against Financial
Phrasebank with a sweep of (blend, threshold, rule_coef, henry_scale) and
prints the top configurations.

Use this script every time you want to update HENRY_SCALE, SENTIBIG_SCALE,
SENTIMENT_THRESHOLD, SENTIMENT_BLEND_VADER, or SENTIMENT_RULE_COEF in
backend/main_simple_nlp.py. Record the runner's output in the PR body so
reviewers can see exactly which configuration was chosen and why.

Usage:
    cd backend && python ../scripts/tune_sentiment.py

Runtime: ~5 minutes for the default 168-config sweep on Financial Phrasebank.
"""

from __future__ import annotations

import csv
import itertools
import sys
import time
from dataclasses import dataclass
from pathlib import Path

# Allow `from main_simple_nlp import ...` when run from anywhere.
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from nltk.sentiment.vader import SentimentIntensityAnalyzer

from services.lexicons import HENRY, SENTI_BIG_NOMICS
import main_simple_nlp as nlp


DATA = ROOT / "backend" / "tests" / "data" / "financial_phrasebank.csv"


@dataclass
class Config:
    blend_vader: float
    threshold: float
    rule_coef: float
    henry_scale: float
    sentibig_scale: float = 0.1


def load_phrasebank() -> list[tuple[str, int]]:
    rows = []
    with open(DATA) as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append((row["text"], int(row["label"])))
    return rows


def configured_vader(cfg: Config) -> SentimentIntensityAnalyzer:
    v = SentimentIntensityAnalyzer()
    v.lexicon.update({k: val * cfg.sentibig_scale for k, val in SENTI_BIG_NOMICS.items()})
    v.lexicon.update({k: val * (cfg.henry_scale / 1.5) for k, val in HENRY.items()})
    return v


def classify(v: SentimentIntensityAnalyzer, text: str, cfg: Config) -> int:
    scores = v.polarity_scores(text)
    compound = scores["compound"]
    fundamental = nlp.analyze_fundamental_direction(text, None)
    has_rules = bool(fundamental.get("matched_signals"))
    if has_rules:
        combined = (compound * cfg.blend_vader
                    + fundamental["directional_score"] * (1 - cfg.blend_vader))
    else:
        combined = compound
    if combined >= cfg.threshold:
        return 1
    if combined <= -cfg.threshold:
        return -1
    return 0


def accuracy(v, rows, cfg: Config) -> float:
    correct = sum(1 for text, truth in rows if classify(v, text, cfg) == truth)
    return correct / len(rows)


def main():
    rows = load_phrasebank()
    print(f"Financial Phrasebank: {len(rows)} sentences")
    print(f"Lexicons: Henry={len(HENRY)} terms, SentiBignomics={len(SENTI_BIG_NOMICS)} terms\n")

    grid = list(itertools.product(
        [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],   # blend_vader
        [0.20, 0.25, 0.30, 0.33, 0.36, 0.40],  # threshold
        [0.22],                                 # rule_coef (rulebook rarely fires on FPB)
        [1.0, 1.5, 2.0, 2.5],                  # henry_scale
    ))

    print(f"Running {len(grid)} configs...")
    start = time.time()
    results = []
    for i, (b, t, r, h) in enumerate(grid):
        cfg = Config(blend_vader=b, threshold=t, rule_coef=r, henry_scale=h)
        v = configured_vader(cfg)
        results.append((accuracy(v, rows, cfg), b, t, r, h))
        if (i + 1) % 25 == 0:
            print(f"  {i+1}/{len(grid)} done ({time.time()-start:.0f}s)")

    results.sort(reverse=True)
    print("\nTop 10:")
    print(f"  {'acc':>6}  {'blend':>5}  {'thresh':>6}  {'rule':>5}  {'henry':>5}")
    for acc, b, t, r, h in results[:10]:
        print(f"  {acc*100:5.2f}%  {b:>5.2f}  {t:>6.2f}  {r:>5.2f}  {h:>5.2f}")

    acc, b, t, r, h = results[0]
    print(f"\nBest: blend={b}, threshold={t}, rule_coef={r}, henry_scale={h}")
    print(f"Accuracy: {acc*100:.2f}%")
    print(f"\nCopy these into the constants block in backend/main_simple_nlp.py.")


if __name__ == "__main__":
    main()

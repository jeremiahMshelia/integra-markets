"""Accuracy regression test for the sentiment-engine.

Loads Financial Phrasebank (Malo et al. 2014) — the canonical labelled
financial-sentiment dataset — and asserts the engine clears a documented
accuracy floor. Failure of this test means a backend change has degraded
sentiment classification on the benchmark Korab (2022) and many subsequent
finance-NLP papers report against.

This test is the load-bearing regression check for the lexicon + tuning
work in feat/sentiment-lexicon-tuning. If you reduce the floor, document
why in the PR that does so.

Run:
    cd backend && pytest tests/test_sentiment_accuracy.py -v
"""

from __future__ import annotations

import csv
from pathlib import Path

import pytest


# ---- documented accuracy targets -------------------------------------------
# These come from scripts/tune_sentiment.py runs against the same CSV.
# Update them only after a fresh tuning run, never to "make CI green".
FPB_ACCURACY_FLOOR = 0.65          # hard fail if we drop below this
FPB_ACCURACY_TARGET = 0.70         # documented goal; xfail below this once we hit it
FPB_PRE_PR_BASELINE = 0.543        # what main was scoring before this PR
FPB_KORAB_BASELINE = 0.587         # plain VADER, +/-0.33
FPB_KORAB_BEST = 0.694             # VADER + Henry + SentiBignomics, +/-0.33

DATA = Path(__file__).parent / "data" / "financial_phrasebank.csv"


@pytest.fixture(scope="module")
def phrasebank():
    rows = []
    with open(DATA) as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append((row["text"], int(row["label"])))
    return rows


def _label_to_int(label: str) -> int:
    return {"BULLISH": 1, "BEARISH": -1, "NEUTRAL": 0}[label.upper()]


def _classify(text: str) -> int:
    """Run the production sentiment pipeline on a single sentence."""
    # Import lazily so test failures here don't mask import errors elsewhere.
    from main_simple_nlp import analyze_market_sentiment, vader_analyzer

    if vader_analyzer is None:
        pytest.skip("VADER not initialised in this environment")

    result = analyze_market_sentiment(text)
    return _label_to_int(result["sentiment"])


def test_phrasebank_accuracy_floor(phrasebank):
    """Refuse to regress past the documented floor."""
    correct = sum(1 for text, truth in phrasebank if _classify(text) == truth)
    accuracy = correct / len(phrasebank)

    print(f"\nFinancial Phrasebank accuracy: {accuracy*100:.2f}% "
          f"(floor {FPB_ACCURACY_FLOOR*100:.0f}%, target {FPB_ACCURACY_TARGET*100:.0f}%)")
    print(f"  pre-PR baseline:           {FPB_PRE_PR_BASELINE*100:.2f}%")
    print(f"  Korab plain VADER:         {FPB_KORAB_BASELINE*100:.2f}%")
    print(f"  Korab VADER + lexicons:    {FPB_KORAB_BEST*100:.2f}%")

    assert accuracy >= FPB_ACCURACY_FLOOR, (
        f"sentiment accuracy on Financial Phrasebank dropped below the floor: "
        f"{accuracy*100:.2f}% < {FPB_ACCURACY_FLOOR*100:.0f}%. "
        "If this is intentional, update FPB_ACCURACY_FLOOR with justification in the PR."
    )


def test_phrasebank_beats_plain_vader(phrasebank):
    """The point of this PR: clear plain VADER's baseline."""
    correct = sum(1 for text, truth in phrasebank if _classify(text) == truth)
    accuracy = correct / len(phrasebank)
    assert accuracy > FPB_KORAB_BASELINE + 0.05, (
        f"Engine accuracy ({accuracy*100:.2f}%) should be at least 5pp above "
        f"plain VADER baseline ({FPB_KORAB_BASELINE*100:.2f}%). "
        "Lexicon updates may not be loading."
    )

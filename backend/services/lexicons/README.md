# Sentiment Lexicons

Domain-specific lexicons that extend NLTK VADER's general-language lexicon
for finance-aware sentiment classification.

## Files

| File | Source | Size | Polarity range |
|---|---|---|---|
| `henry.py` | Henry (2008) | 189 terms | uniform ±1.5 |
| `senti_bignomics.py` | Consoli et al. (2022) | 7,295 terms | continuous [-1, 1] |

## Loading order

`main_simple_nlp.py` applies these via:

```python
vader_analyzer.lexicon.update({k: v * 0.1 for k, v in SENTI_BIG_NOMICS.items()})
vader_analyzer.lexicon.update({k: v * (2.0 / 1.5) for k, v in HENRY.items()})
```

SentiBignomics is applied first so Henry's curated values **override** on the
~40 keys where both lexicons cover the same term. This ordering was verified
empirically against Financial Phrasebank — flipping it costs ~5–6 pp of
accuracy.

## Tuning constants

Both scaling constants come from grid search on Financial Phrasebank (see
`scripts/tune_sentiment.py`). The values currently in production:

- **SentiBignomics scale**: `0.1` (matches Korab, 2022)
- **Henry scale**: `2.0` (Korab used 1.5; grid search found 2.0 fractionally
  better on FPB)

Re-tune these any time the rulebook or threshold logic in
`analyze_market_sentiment()` changes.

## Sources & licenses

### Henry (2008)
- Paper: Henry, E. (2008). "Are Investors Influenced By How Earnings Press
  Releases Are Written?" *The Journal of Business Communication*, 45(4),
  363–407.
- Word list reproduced from Petr Korab's MIT-licensed companion notebook:
  https://github.com/PetrKorab/Fine-tuning-VADER-with-Domain-specific-Lexicons
- Underlying word list is academic prior art; no specific license claim is
  asserted by Henry (2008). Use case here (sentiment scoring) is consistent
  with the original publication.

### SentiBigNomics (Consoli et al., 2022)
- Paper: Consoli, S., Barbaglia, L., & Manzan, S. (2022). "Fine-grained,
  aspect-based sentiment analysis on economic and financial lexicon."
  *Knowledge-Based Systems*, 247, 108781.
- Source: https://github.com/consose/SentiBigNomics (GPLv3 in the upstream
  repository; this redistribution is consistent with the upstream license).
- See upstream for the full license text.

## Regenerating

`senti_bignomics.py` is mechanically generated from the upstream source. To
update:

```bash
curl -sL https://raw.githubusercontent.com/consose/SentiBigNomics/main/python/senti_bignomics.py \
  -o /tmp/upstream.py
python3 scripts/regenerate_senti_bignomics.py /tmp/upstream.py \
  backend/services/lexicons/senti_bignomics.py
```

Do not hand-edit `senti_bignomics.py`. Hand-edit `henry.py` only if a paper
revision or a domain expert update is being applied (rare).

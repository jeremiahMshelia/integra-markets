# Test Datasets

## financial_phrasebank.csv

Financial Phrasebank dataset (Malo et al. 2014), 4,846 sentences labelled
as bearish (-1), neutral (0), or bullish (1) by financial domain experts.

- **Source**: Reproduced from Petr Korab's MIT-licensed companion repository:
  https://github.com/PetrKorab/Fine-tuning-VADER-with-Domain-specific-Lexicons
  (file: `testing_data.csv`)
- **Original publication**: Malo, P., Sinha, A., Korhonen, P., Wallenius, J.,
  & Takala, P. (2014). "Good debt or bad debt: Detecting semantic orientations
  in economic texts." *Journal of the Association for Information Science and
  Technology*, 65(4), 782–796.
- **License**: CC BY-NC-SA 3.0 (non-commercial). Used here only for offline
  accuracy regression testing — not redistributed in the product or API.
  Do not bundle this CSV into deployed artifacts.

The CSV is the canonical benchmark for finance-domain VADER work. Korab
reported VADER baseline = 58%, VADER + Henry + SentiBignomics = 69% on this
exact file. Our regression test (`test_sentiment_accuracy.py`) asserts the
post-PR pipeline reaches >= 65% (with the 70% target documented in the test).

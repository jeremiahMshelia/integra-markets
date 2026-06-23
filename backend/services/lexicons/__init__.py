"""Domain-specific sentiment lexicons that extend NLTK VADER's general lexicon.

Two lexicons are applied at VADER instantiation in `main_simple_nlp.py`:

- ``HENRY``: 189-word finance lexicon from Henry (2008), Journal of Business
  Communication. Words drawn from US earnings press releases. ±1.5 polarity.
- ``SENTI_BIG_NOMICS``: ~7,300-term aspect-based finance lexicon from Consoli
  et al. (2022). Continuous polarity in [-1, 1].

Merge order matters: SentiBignomics first, Henry second so Henry's curated
values override on the ~40 keys where both lexicons overlap. This order was
empirically verified to give the published 69% accuracy on Financial
Phrasebank.

Verified accuracy lift (Financial Phrasebank, 4,846 sentences):
    Plain VADER, ±0.33 threshold:                          58.7%
    Integra rulebook + ±0.12 threshold (pre-PR):           54.3%
    + Henry + SentiBignomics + ±0.33 threshold:            69.4%
    Grid-best (blend=0.5, threshold=0.33, henry=2.0):      70.2%

See `backend/services/lexicons/README.md` for license + provenance.
"""

from .henry import HENRY
from .senti_bignomics import SENTI_BIG_NOMICS

__all__ = ["HENRY", "SENTI_BIG_NOMICS"]

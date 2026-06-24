"""Pre-prompt templates for /v1/agent/ask.

Three templates correspond to the three example questions in the
beta product brief:

  - interpret_today    Short/medium/long-term reading of today's
                       headlines for a commodity (or the whole market).
  - trend_30d          Sentiment trajectory + biggest swings over the
                       last 30 days for a given commodity.
  - divergence_check   News-sentiment vs. prediction-market price
                       divergence for a commodity / market pair.

Templates are pure strings (no I/O). The agent dispatcher injects the
user-provided variables and lets the LLM call the registered tools to
gather the data it needs to answer.
"""

from __future__ import annotations

from typing import Any, Dict, Optional


TEMPLATE_KEYS = ("interpret_today", "trend_30d", "divergence_check")


_INTERPRET_TODAY = """\
You are Integra, a commodity-markets sentiment analyst.

Question: What do today's headlines for {commodity} mean for market \
players in the short term (1-7 days), medium term (1-3 months), and \
long term (6-12 months)?

Steps you must follow:
  1. Call `get_sentiment_now` with commodity="{commodity}" to anchor on the \
current observation.
  2. Call `get_recent_history` with commodity="{commodity}" and days=7 to \
see the immediate context.
  3. Call `get_daily_aggregates` with commodity="{commodity}" and days=30 to \
see the medium-term trajectory.
  4. Synthesize a structured answer with three labelled sections \
(Short term, Medium term, Long term). For each section give two to four \
bullet points. Cite specific articles by id where relevant.

Output format (strict): Markdown with three H3 sections, no preamble.
"""


_TREND_30D = """\
You are Integra, a commodity-markets sentiment analyst.

Question: How has sentiment around {commodity} changed in the last 30 \
days? Show the daily series in summary form and call out the three \
biggest swings.

Steps you must follow:
  1. Call `get_daily_aggregates` with commodity="{commodity}" and days=30.
  2. Identify the three days with the largest day-over-day change in \
`avg_score` (positive or negative).
  3. For each of those three days, call `get_recent_history` with \
commodity="{commodity}" and a tight from/to window covering that day, \
to find the headline(s) most likely responsible.
  4. Produce a final answer with: (a) a one-paragraph narrative of the \
30-day arc, (b) a table of the three swings with date / Δ score / \
likely catalyst article, (c) the current direction.

Output format (strict): Markdown. Narrative paragraph, then a Markdown \
table, then a one-line current-direction summary.
"""


_DIVERGENCE_CHECK = """\
You are Integra, a commodity-markets sentiment analyst.

Question: Is news sentiment for {commodity} diverging from the \
prediction-market consensus right now? Set the divergence threshold at \
{threshold} points on the -1 to +1 scale.

Steps you must follow:
  1. Call `get_sentiment_now` with commodity="{commodity}" to get the \
current news-sentiment score.
  2. Call `get_market_overlay` with provider="kalshi" and a topical \
filter for {commodity}-related markets. Take the most recent \
`last_price` from the returned markets (price is on a 0-1 scale; \
convert to a -1 to +1 score with 2*price - 1).
  3. Compute the absolute difference.
  4. If the difference exceeds {threshold}, report DIVERGENCE with \
direction (news more bullish than market, or vice versa) and the \
specific articles / markets driving each side. Otherwise report \
ALIGNED.

Output format (strict): Begin with one of the literal lines \
"STATUS: DIVERGENCE" or "STATUS: ALIGNED". Then a two- to four-sentence \
explanation. Then a sources list with article ids and market ids.
"""


_TEMPLATES: Dict[str, str] = {
    "interpret_today": _INTERPRET_TODAY,
    "trend_30d": _TREND_30D,
    "divergence_check": _DIVERGENCE_CHECK,
}


_DEFAULT_VARS: Dict[str, Dict[str, Any]] = {
    "interpret_today":  {"commodity": "crude oil"},
    "trend_30d":        {"commodity": "lng"},
    "divergence_check": {"commodity": "crude oil", "threshold": 0.2},
}


def render(template_key: str, *, variables: Optional[Dict[str, Any]] = None) -> str:
    """Render a template with the user-supplied variables.

    Missing variables fall back to documented defaults so a beta user
    can hit a template with no parameters and still get a useful answer.
    """
    if template_key not in _TEMPLATES:
        raise ValueError(f"unknown template '{template_key}'; valid: {TEMPLATE_KEYS}")
    merged = {**_DEFAULT_VARS.get(template_key, {}), **(variables or {})}
    return _TEMPLATES[template_key].format(**merged)


def describe() -> Dict[str, Dict[str, Any]]:
    """Return a documentation-friendly description of all templates.

    Used by the /v1/agent/templates endpoint (read-only listing for the
    docs page and for any caller that wants to introspect what's
    available).
    """
    return {
        "interpret_today": {
            "summary": "Short/medium/long-term reading of today's news for a commodity.",
            "variables": {"commodity": {"type": "string", "default": "crude oil"}},
            "tools_used": ["get_sentiment_now", "get_recent_history", "get_daily_aggregates"],
        },
        "trend_30d": {
            "summary": "30-day sentiment trajectory and the three biggest swings.",
            "variables": {"commodity": {"type": "string", "default": "lng"}},
            "tools_used": ["get_daily_aggregates", "get_recent_history"],
        },
        "divergence_check": {
            "summary": "Compare news sentiment vs. prediction-market price for divergence.",
            "variables": {
                "commodity": {"type": "string", "default": "crude oil"},
                "threshold": {"type": "number", "default": 0.2,
                              "description": "Min absolute score difference to flag DIVERGENCE."},
            },
            "tools_used": ["get_sentiment_now", "get_market_overlay"],
        },
    }

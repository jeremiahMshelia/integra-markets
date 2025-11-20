"""Minimal weather alerts service used by the API.

The mobile app only calls `/api/weather/alerts`, which in turn uses
[get_weather_alerts()](cci:1://file:///Users/jerry/Documents/integra-markets/app/services/weather.py:395:0-425:5). To avoid heavy dependencies and missing
database models on Render, this module exposes just that function
with static sample data.
"""

from typing import Dict, Any


def get_weather_alerts() -> Dict[str, Any]:
    """Return sample weather alerts affecting commodity markets."""

    return {
        "alerts": [
            {
                "id": 1,
                "type": "severe_weather",
                "commodity": "CORN",
                "region": "US Midwest",
                "description": "Severe thunderstorms with potential hail damage to crops",
                "severity": "high",
                "impact_score": -0.7,
                "start_time": "2024-01-15T14:00:00Z",
                "end_time": "2024-01-15T20:00:00Z",
            },
            {
                "id": 2,
                "type": "drought",
                "commodity": "WHEAT",
                "region": "Australia",
                "description": "Prolonged dry conditions affecting wheat production",
                "severity": "medium",
                "impact_score": -0.5,
                "start_time": "2024-01-10T00:00:00Z",
                "end_time": None,
            },
        ],
        "total_alerts": 2,
        "last_updated": "2024-01-15T12:00:00Z",
    }
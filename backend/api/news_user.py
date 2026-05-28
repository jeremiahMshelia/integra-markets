"""User-aware news endpoint.

Wires ``user_news_service.UserNewsService.get_user_based_news`` to a HTTP
route. The user_news_service honors per-user preferences (commodities,
regions, keywords, websiteURLs, alertThreshold) and custom RSS feeds — the
running backend never exposed this until now.

Each returned article is also logged as a Prediction row so the learning
loop can evaluate it against future market data.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/news", tags=["news-user"])


class UserNewsRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    commodities: Optional[List[str]] = None
    regions: Optional[List[str]] = None
    keywords: Optional[List[str]] = None
    website_urls: Optional[List[str]] = Field(None, alias="websiteURLs")
    alert_threshold: Optional[str] = Field("medium", alias="alertThreshold")

    class Config:
        populate_by_name = True


@router.post("/user-based")
async def user_based_news(payload: UserNewsRequest) -> Dict[str, Any]:
    try:
        from user_news_service import UserNewsService  # type: ignore
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"user_news_service unavailable: {exc}",
        )

    service = UserNewsService()
    preferences = {
        "commodities": payload.commodities or ["oil", "gold", "wheat"],
        "regions": payload.regions or ["US", "EU", "Asia"],
        "keywords": payload.keywords or [],
        "websiteURLs": payload.website_urls or [],
        "alertThreshold": payload.alert_threshold or "medium",
    }
    try:
        result = await service.get_user_based_news(preferences)
    except Exception as exc:  # noqa: BLE001
        logger.exception("user_news_service failed")
        raise HTTPException(status_code=500, detail=str(exc))

    await _log_predictions(payload.user_id, result.get("articles", []))
    return result


async def _log_predictions(user_id: str, articles: List[Dict[str, Any]]) -> None:
    if not articles:
        return
    try:
        from services.learning_loop import get_learning_loop
        from services._supabase import get_supabase_client
    except ImportError:
        return

    supabase = get_supabase_client()

    loop = get_learning_loop()
    rows = []
    for article in articles:
        text = " ".join(filter(None, [article.get("title"), article.get("summary")]))
        commodity = (article.get("commodities") or [None])[0]
        source = article.get("source")
        try:
            prediction = loop.predict(text=text, commodity=commodity, source=source)
        except Exception as exc:  # noqa: BLE001
            logger.warning("loop.predict failed for article: %s", exc)
            continue
        article["integra_prediction"] = prediction
        if supabase is not None:
            rows.append(
                {
                    "article_id": str(article.get("id") or article.get("url") or text[:80]),
                    "article_title": article.get("title"),
                    "source": source,
                    "commodity": commodity,
                    "keywords": article.get("keywords") or [],
                    "predicted_sentiment": prediction["sentiment"],
                    "predicted_distribution": prediction["distribution"],
                    "confidence": prediction["confidence"],
                    "model_version": prediction["model_version"],
                    "user_id": user_id,
                }
            )
    if rows and supabase is not None:
        try:
            supabase.table("predictions").insert(rows).execute()
        except Exception as exc:  # noqa: BLE001
            logger.warning("predictions bulk insert failed: %s", exc)

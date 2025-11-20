import logging
import json
from typing import Dict, Any, Optional, List
from datetime import datetime
from sqlalchemy.orm import Session

from services.llm import LLMService
from models.news import NewsArticle, NewsAnalysis
from models.commodities import Commodity
from models.users import User

# Configure logging
logger = logging.getLogger(__name__)

class NewsAnalysisService:
    """Service for analyzing news articles and generating market implications"""
    
    def __init__(self, db: Session):
        self.db = db
        self.llm_service = LLMService(db)
    
    async def analyze_news_article(
        self, 
        news_id: int, 
        commodity_id: int,
        user: User
    ) -> Optional[Dict[str, Any]]:
        """Analyze a news article and generate market implications"""
        # Get news article
        news = self.db.query(NewsArticle).filter(NewsArticle.id == news_id).first()
        if not news:
            logger.error(f"News article with ID {news_id} not found")
            return None
        
        # Get commodity
        commodity = self.db.query(Commodity).filter(Commodity.id == commodity_id).first()
        if not commodity:
            logger.error(f"Commodity with ID {commodity_id} not found")
            return None
        
        # Check if analysis already exists
        existing_analysis = self.db.query(NewsAnalysis).filter(
            NewsAnalysis.news_id == news_id,
            NewsAnalysis.commodity_id == commodity_id
        ).first()
        
        if existing_analysis:
            return {
                "id": existing_analysis.id,
                "news_id": news_id,
                "commodity_id": commodity_id,
                "summary": existing_analysis.summary,
                "market_impact": existing_analysis.market_impact,
                "impact_confidence": existing_analysis.impact_confidence,
                "explanation": existing_analysis.explanation,
                "created_at": existing_analysis.created_at.isoformat()
            }
        
        # Combine title and content for analysis
        news_text = f"{news.title}. {news.content}"
        
        # Generate prompt for LLM
        prompt = f"""
        You are a financial analyst specializing in commodity markets. Analyze the following news article about {commodity.name}.
        
        NEWS ARTICLE:
        {news_text}
        
        COMMODITY CONTEXT:
        {commodity.name} is categorized as {commodity.category}.
        
        Provide a concise analysis with the following structure:
        1. A 1-2 sentence summary of the key points
        2. The potential market implications for {commodity.name} prices (bullish, bearish, or neutral)
        3. A brief explanation of why this news might impact the market
        
        Format your response as a JSON object with the following structure:
        {{"summary": "...", "market_impact": "bullish|bearish|neutral", "impact_confidence": 0-100, "explanation": "..."}}
        """
        
        # Generate analysis using LLM
        analysis_text = await self.llm_service.generate_completion(
            prompt=prompt,
            user=user,
            feature="news_analysis",
            max_tokens=500,
            temperature=0.3
        )
        
        if not analysis_text:
            logger.error(f"Failed to generate analysis for news ID {news_id}")
            return None
        
        # Parse LLM response
        try:
            analysis_data = json.loads(analysis_text)
        except json.JSONDecodeError:
            # If not valid JSON, extract information manually
            analysis_data = {
                "summary": analysis_text[:200] + "...",
                "market_impact": "neutral",
                "impact_confidence": 50,
                "explanation": "Unable to determine specific market impact."
            }
        
        # Create news analysis record
        news_analysis = NewsAnalysis(
            news_id=news_id,
            commodity_id=commodity_id,
            summary=analysis_data.get("summary", ""),
            market_impact=analysis_data.get("market_impact", "neutral"),
            impact_confidence=analysis_data.get("impact_confidence", 50),
            explanation=analysis_data.get("explanation", ""),
            created_at=datetime.utcnow()
        )
        
        self.db.add(news_analysis)
        self.db.commit()
        self.db.refresh(news_analysis)
        
        return {
            "id": news_analysis.id,
            "news_id": news_id,
            "commodity_id": commodity_id,
            "summary": news_analysis.summary,
            "market_impact": news_analysis.market_impact,
            "impact_confidence": news_analysis.impact_confidence,
            "explanation": news_analysis.explanation,
            "created_at": news_analysis.created_at.isoformat()
        }
    
    async def get_news_analysis(self, news_id: int, commodity_id: int) -> Optional[Dict[str, Any]]:
        """Get existing news analysis"""
        analysis = self.db.query(NewsAnalysis).filter(
            NewsAnalysis.news_id == news_id,
            NewsAnalysis.commodity_id == commodity_id
        ).first()
        
        if not analysis:
            return None
        
        return {
            "id": analysis.id,
            "news_id": news_id,
            "commodity_id": commodity_id,
            "summary": analysis.summary,
            "market_impact": analysis.market_impact,
            "impact_confidence": analysis.impact_confidence,
            "explanation": analysis.explanation,
            "created_at": analysis.created_at.isoformat()
        }

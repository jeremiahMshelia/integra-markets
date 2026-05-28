/**
 * News Analysis Service
 * Fetches comprehensive analysis including sentiment, insights, and market impact
 */

import { extractPolymarketSlug, getPreferredSourceUrl } from '../utils/polymarketLinks';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://integra-markets-backend.fly.dev';

class NewsAnalysisService {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
    }

    /**
     * Get comprehensive analysis for a news article
     */
    async analyzeArticle(article) {
        const cacheKey = article.title;
        
        // Check cache first
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            console.log('Returning cached analysis for:', article.title);
            return cached.data;
        }

        try {
            console.log('Fetching analysis for:', article.title);
            const isPolymarket = article.source?.toLowerCase?.() === 'polymarket';
            
            // Combine title and summary for better analysis
            const fullText = `${article.title}. ${article.summary || ''}`;
            
            // Fetch sentiment analysis
            const sentimentPromise = isPolymarket
                ? this.fetchOverallSentiment(article)
                : this.fetchSentiment(fullText);
            
            // Fetch AI insights (using chat endpoint for now)
            const insightsPromise = this.fetchAIInsights(article);
            
            // Fetch market data if available
            const marketDataPromise = this.fetchMarketSentiment();
            
            // Wait for all promises
            const [sentiment, insights, marketData] = await Promise.all([
                sentimentPromise,
                insightsPromise,
                marketDataPromise
            ]);
            
            // Combine all data into comprehensive analysis
            const analysis = isPolymarket && sentiment?.overall_sentiment
                ? this.buildPolymarketAnalysis(article, sentiment, insights, marketData)
                : {
                    summary: this.generateSummary(article, sentiment),
                    finBertSentiment: this.transformSentiment(sentiment),
                    keyDrivers: this.extractKeyDrivers(article, sentiment),
                    marketImpact: this.calculateMarketImpact(sentiment, marketData),
                    traderInsights: this.generateTraderInsights(article, sentiment, insights),
                    originalArticle: article,
                    timestamp: new Date().toISOString()
                };
            
            // Cache the result
            this.cache.set(cacheKey, {
                data: analysis,
                timestamp: Date.now()
            });
            
            return analysis;
            
        } catch (error) {
            console.error('Error analyzing article:', error);
            
            // Return fallback analysis
            return this.getFallbackAnalysis(article);
        }
    }

    async fetchOverallSentiment(article) {
        try {
            const preferredSourceUrl = getPreferredSourceUrl(article);
            const response = await fetch(`${API_BASE_URL}/api/news/overall-sentiment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic_text: article.title,
                    commodity: article.commodities?.[0] || null,
                    max_headlines: 20,
                    refresh_if_empty: true,
                    event_url: preferredSourceUrl,
                    event_slug: article.eventSlug || article.event_slug || extractPolymarketSlug(article)
                })
            });

            if (!response.ok) {
                throw new Error(`Overall sentiment API error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching overall sentiment:', error);
            return null;
        }
    }
    
    /**
     * Fetch sentiment analysis from backend
     */
    async fetchSentiment(text) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/sentiment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            
            if (!response.ok) {
                throw new Error(`Sentiment API error: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching sentiment:', error);
            return null;
        }
    }
    
    /**
     * Fetch AI insights using chat endpoint
     */
    async fetchAIInsights(article) {
        try {
            const prompt = `Analyze this commodity news and provide 3 key trading insights: "${article.title}. ${article.summary || ''}"`;
            
            const response = await fetch(`${API_BASE_URL}/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: prompt,
                    context: {
                        type: 'news_analysis',
                        commodity: article.commodities?.[0] || 'commodities'
                    }
                })
            });
            
            if (!response.ok) {
                console.log('AI chat endpoint not available');
                return null;
            }
            
            const data = await response.json();
            return data.response || data.message || null;
        } catch (error) {
            console.error('Error fetching AI insights:', error);
            return null;
        }
    }
    
    /**
     * Fetch current market sentiment
     */
    async fetchMarketSentiment() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/sentiment/market`);
            
            if (!response.ok) {
                throw new Error(`Market API error: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching market sentiment:', error);
            return null;
        }
    }
    
    /**
     * Generate enhanced summary
     */
    generateSummary(article, sentiment) {
        let summary = article.summary || article.title;
        
        // Add sentiment context if available
        if (sentiment && sentiment.sentiment) {
            const sentimentText = sentiment.sentiment.toLowerCase();
            const confidence = Math.round((sentiment.confidence || 0.5) * 100);
            
            summary += ` Market sentiment appears ${sentimentText} with ${confidence}% confidence based on the language analysis.`;
        }
        
        return summary;
    }
    
    /**
     * Transform sentiment to match UI format
     */
    transformSentiment(sentiment) {
        console.log('Transforming sentiment:', JSON.stringify(sentiment));
        
        if (!sentiment) {
            console.log('No sentiment data, returning defaults');
            return {
                bullish: 33,
                bearish: 33,
                neutral: 34
            };
        }
        
        // Convert sentiment scores to percentages based on VADER scores
        const scores = sentiment.scores || {};
        const compound = scores.compound || 0;
        
        // Map to bullish/bearish/neutral based on sentiment label and compound score
        let bullish = 0;
        let bearish = 0;
        let neutralScore = 0;
        
        console.log('Sentiment type:', sentiment.sentiment, 'Confidence:', sentiment.confidence);
        
        // Handle both BULLISH/BEARISH and POSITIVE/NEGATIVE formats
        const sentimentType = sentiment.sentiment === 'POSITIVE' ? 'BULLISH' : 
                              sentiment.sentiment === 'NEGATIVE' ? 'BEARISH' : 
                              sentiment.sentiment;
        
        if (sentimentType === 'BULLISH') {
            // For bullish sentiment, scale confidence to show clear bullish dominance
            const scaledConfidence = Math.max(0.6, sentiment.confidence); // Minimum 60% for clear sentiment
            bullish = Math.round(scaledConfidence * 70); // 70% of the chart for dominant sentiment
            
            // Use VADER neutral but scale it down
            const vaderNeutral = scores.neutral || 0.5;
            neutralScore = Math.round(vaderNeutral * 20); // Scale down neutral
            
            // Give some allocation to bearish for balance
            bearish = Math.max(5, 100 - bullish - neutralScore); // At least 5% for visibility
            
        } else if (sentimentType === 'BEARISH') {
            // For bearish sentiment, scale confidence to show clear bearish dominance
            const scaledConfidence = Math.max(0.6, sentiment.confidence); // Minimum 60% for clear sentiment
            bearish = Math.round(scaledConfidence * 70); // 70% of the chart for dominant sentiment
            
            // Use VADER neutral but scale it down
            const vaderNeutral = scores.neutral || 0.5;
            neutralScore = Math.round(vaderNeutral * 20); // Scale down neutral
            
            // Give some allocation to bullish for balance
            bullish = Math.max(5, 100 - bearish - neutralScore); // At least 5% for visibility
            
        } else {
            // For neutral sentiment, use VADER scores directly
            neutralScore = Math.round((scores.neutral || 0.5) * 100);
            // Distribute remaining between bullish and bearish based on positive/negative
            const remaining = 100 - neutralScore;
            if (compound > 0) {
                bullish = Math.round(remaining * 0.6);
                bearish = remaining - bullish;
            } else if (compound < 0) {
                bearish = Math.round(remaining * 0.6);
                bullish = remaining - bearish;
            } else {
                bullish = Math.round(remaining / 2);
                bearish = remaining - bullish;
            }
        }
        
        // Ensure all values are valid and sum to approximately 100
        const total = bullish + bearish + neutralScore;
        if (total > 100) {
            const scale = 100 / total;
            bullish = Math.round(bullish * scale);
            bearish = Math.round(bearish * scale);
            neutralScore = 100 - bullish - bearish;
        }
        
        const result = {
            bullish: Math.max(0, Math.min(100, bullish)),
            bearish: Math.max(0, Math.min(100, bearish)),
            neutral: Math.max(0, Math.min(100, neutralScore))
        };
        
        console.log('Transformed sentiment result:', result);
        return result;
    }

    buildPolymarketAnalysis(article, overallSentiment, aiInsights, marketData) {
        const sentimentLabel = overallSentiment.overall_sentiment || 'NEUTRAL';
        const confidence = overallSentiment.confidence || 0.5;
        const finBertSentiment = this.transformSentiment({
            sentiment: sentimentLabel,
            confidence,
            scores: {
                compound: sentimentLabel === 'BULLISH' ? confidence : sentimentLabel === 'BEARISH' ? -confidence : 0,
                neutral: Math.max(0.1, 1 - confidence)
            }
        });

        const driverTexts = [
            ...(overallSentiment.matched_signals || []).map(signal => ({
                text: String(signal).toLowerCase(),
                score: confidence
            })),
            ...(overallSentiment.target_assets || []).map(asset => ({
                text: String(asset).toLowerCase(),
                score: 0.8
            }))
        ];

        const seen = new Set();
        const keyDrivers = driverTexts.filter(driver => {
            if (seen.has(driver.text)) return false;
            seen.add(driver.text);
            return true;
        }).slice(0, 8);

        const articleWithTargets = {
            ...article,
            commodities: overallSentiment.target_assets || article.commodities || [],
            marketImpact: confidence > 0.72 ? 'HIGH' : confidence > 0.58 ? 'MEDIUM' : 'LOW'
        };

        const traderInsights = [];
        traderInsights.push(
            `Overall sentiment for ${(overallSentiment.primary_target || 'the market').toUpperCase()} is ${sentimentLabel.toLowerCase()} across ${overallSentiment.headline_count || 0} relevant headlines`
        );

        if (overallSentiment.target_assets?.length) {
            traderInsights.push(`Target assets: ${overallSentiment.target_assets.join(', ')}`);
        }

        if (overallSentiment.matched_signals?.length) {
            traderInsights.push(`Key drivers: ${overallSentiment.matched_signals.slice(0, 3).join(', ')}`);
        }

        const aiDerivedInsights = this.generateTraderInsights(articleWithTargets, {
            sentiment: sentimentLabel,
            confidence
        }, aiInsights);

        return {
            summary: overallSentiment.summary || article.summary || article.title,
            finBertSentiment,
            keyDrivers: keyDrivers.length ? keyDrivers : this.extractKeyDrivers(articleWithTargets, null),
            marketImpact: this.calculateMarketImpact({ sentiment: sentimentLabel, confidence }, marketData),
            traderInsights: [...traderInsights, ...aiDerivedInsights].slice(0, 5),
            originalArticle: article,
            timestamp: new Date().toISOString(),
            overallSentiment,
            eventUrl: overallSentiment.event_url || getPreferredSourceUrl(article),
            eventSlug: overallSentiment.event_slug || extractPolymarketSlug(article),
            sourceUrl: overallSentiment.source_url || getPreferredSourceUrl(article)
        };
    }
    
    /**
     * Extract key drivers from article
     */
    extractKeyDrivers(article, sentiment) {
        const drivers = [];
        const foundWords = new Set();
        
        // Extract from sentiment keywords if available (ML-enhanced)
        if (sentiment && sentiment.keywords && Array.isArray(sentiment.keywords)) {
            sentiment.keywords.forEach(keywordObj => {
                const word = keywordObj.word || keywordObj.text;
                if (word && !foundWords.has(word.toLowerCase())) {
                    // Format for clean UI display - combine score and importance
                    const mlScore = keywordObj.score || 0.85;
                    const importance = keywordObj.importance || 0;
                    // Weight the score based on ML importance
                    const finalScore = importance > 0 
                        ? Math.min(0.95, (mlScore * 0.7) + (importance * 0.3 / 3)) 
                        : mlScore;
                    
                    drivers.push({
                        text: word.toLowerCase(),
                        score: finalScore
                    });
                    foundWords.add(word.toLowerCase());
                }
            });
        }
        
        // Extract from commodities
        if (article.commodities && article.commodities.length > 0) {
            article.commodities.forEach(commodity => {
                if (!foundWords.has(commodity.toLowerCase())) {
                    drivers.push({
                        text: commodity.toLowerCase(),
                        score: 0.8
                    });
                    foundWords.add(commodity.toLowerCase());
                }
            });
        }
        
        // Extract from key drivers if available
        if (article.keyDrivers && article.keyDrivers.length > 0) {
            article.keyDrivers.forEach(driver => {
                if (!foundWords.has(driver.toLowerCase())) {
                    drivers.push({
                        text: driver.toLowerCase(),
                        score: 0.7
                    });
                    foundWords.add(driver.toLowerCase());
                }
            });
        }
        
        // Extract event-driven and geopolitical keywords from text
        const text = `${article.title} ${article.summary || ''}`.toLowerCase();
        
        // Comprehensive keyword list including geopolitical and event terms
        const comprehensiveKeywords = [
            // Supply/demand fundamentals
            'supply', 'demand', 'shortage', 'oversupply', 'surplus', 'deficit',
            'inventory', 'stockpile', 'drawdown', 'build', 'storage',
            
            // Production and infrastructure
            'production', 'output', 'capacity', 'refinery', 'pipeline', 'terminal',
            'facilities', 'shutdown', 'outage', 'disruption', 'maintenance',
            
            // Geopolitical events
            'sanctions', 'tensions', 'attacks', 'conflict', 'war', 'military',
            'iran', 'russia', 'saudi', 'opec', 'embargo', 'blockade', 'crisis',
            
            // Natural events
            'drought', 'flood', 'hurricane', 'freeze', 'weather',
            
            // Price movements
            'price', 'surge', 'crash', 'rally', 'decline', 'volatility',
            
            // Trade and policy
            'export', 'import', 'tariff', 'quota', 'ban', 'restriction', 'policy'
        ];
        
        // Look for comprehensive keywords in text
        comprehensiveKeywords.forEach(keyword => {
            if (text.includes(keyword) && !foundWords.has(keyword)) {
                // Calculate relevance score based on frequency
                const count = (text.match(new RegExp(keyword, 'g')) || []).length;
                const score = Math.min(0.6 + (count * 0.1), 0.9);
                
                drivers.push({
                    text: keyword,
                    score: score
                });
                foundWords.add(keyword);
            }
        });
        
        // Add sentiment as a driver only if it's strong
        if (sentiment && sentiment.sentiment && sentiment.confidence > 0.6) {
            const sentimentText = sentiment.sentiment.toLowerCase();
            if (!foundWords.has(sentimentText)) {
                drivers.push({
                    text: sentimentText,
                    score: sentiment.confidence || 0.5
                });
            }
        }
        
        // Sort by score and format for UI display
        // Prioritize ML-derived keywords with high importance
        const sortedDrivers = drivers
            .sort((a, b) => b.score - a.score)
            .slice(0, 8)  // Take top 8 for UI space
            .map(driver => ({
                text: driver.text,
                score: parseFloat(driver.score.toFixed(1))  // Clean decimal for display
            }));
        
        // Ensure we have meaningful keywords, not just generic terms
        const meaningfulDrivers = sortedDrivers.filter(d => 
            d.text.length > 2 && 
            !['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'].includes(d.text)
        );
        
        return meaningfulDrivers.length >= 3 ? meaningfulDrivers : sortedDrivers;
    }
    
    /**
     * Calculate market impact
     */
    calculateMarketImpact(sentiment, marketData) {
        let level = 'MEDIUM';
        let confidence = 0.5;
        
        if (sentiment) {
            confidence = sentiment.confidence || 0.5;
            
            // High confidence sentiment indicates higher impact
            if (confidence > 0.8) {
                level = 'HIGH';
            } else if (confidence < 0.4) {
                level = 'LOW';
            }
        }
        
        // Adjust based on market volatility if available
        if (marketData && marketData.overall) {
            if (marketData.overall === 'BULLISH' || marketData.overall === 'BEARISH') {
                level = confidence > 0.6 ? 'HIGH' : 'MEDIUM';
            }
        }
        
        return {
            level,
            confidence: Math.round(confidence * 10) / 10
        };
    }
    
    /**
     * Generate trader insights
     */
    generateTraderInsights(article, sentiment, aiInsights) {
        const insights = [];
        
        // Add AI-generated insights if available
        if (aiInsights && typeof aiInsights === 'string') {
            // Parse AI response for bullet points
            const lines = aiInsights.split('\n').filter(line => line.trim());
            lines.forEach(line => {
                if (line.trim() && !line.toLowerCase().includes('analyze')) {
                    insights.push(line.trim());
                }
            });
        }
        
        // If no AI insights, generate context-aware insights based on the article
        if (insights.length === 0) {
            // Generate insights based on sentiment and article content
            const sentimentType = sentiment?.sentiment === 'POSITIVE' ? 'bullish' : 
                                 sentiment?.sentiment === 'NEGATIVE' ? 'bearish' : 
                                 sentiment?.sentiment?.toLowerCase() || 'neutral';
            const confidence = Math.round((sentiment?.confidence || 0.5) * 100);
            
            // Sentiment-based insight
            if (sentimentType === 'bullish' || sentiment?.sentiment === 'BULLISH') {
                insights.push(`Market sentiment is ${confidence}% bullish - consider momentum trading strategies`);
                insights.push(`Positive price action expected - watch for resistance levels`);
            } else if (sentimentType === 'bearish' || sentiment?.sentiment === 'BEARISH') {
                insights.push(`Market sentiment is ${confidence}% bearish - consider defensive positions`);
                insights.push(`Downward pressure likely - monitor support levels closely`);
            } else {
                insights.push(`Neutral market sentiment at ${confidence}% - wait for clearer directional signals`);
                insights.push(`Consolidation phase possible - range-bound trading strategies may work`);
            }
            
            // Add commodity-specific context
            const title = (article.title || '').toLowerCase();
            const summary = (article.summary || '').toLowerCase();
            const fullText = `${title} ${summary}`;
            
            // Price action insights
            if (fullText.includes('record') || fullText.includes('high')) {
                insights.push('Price at or near record levels - consider profit-taking opportunities');
            } else if (fullText.includes('drop') || fullText.includes('fall') || fullText.includes('decline')) {
                insights.push('Recent price weakness observed - evaluate entry points for value buyers');
            } else if (fullText.includes('surge') || fullText.includes('rally') || fullText.includes('jump')) {
                insights.push('Strong upward momentum detected - ride the trend but set stop-losses');
            }
            
            // Supply/demand insights
            if (fullText.includes('demand')) {
                insights.push('Demand dynamics are key - monitor consumption data and economic indicators');
            }
            if (fullText.includes('supply') || fullText.includes('production')) {
                insights.push('Supply-side factors dominating - track production reports and inventory data');
            }
            
            // Central bank/policy insights
            if (fullText.includes('fed') || fullText.includes('rate') || fullText.includes('central bank')) {
                insights.push('Monetary policy impacting markets - watch for central bank communications');
            }
        }
        
        // Add commodity-specific insights
        if (article.commodities && article.commodities.length > 0) {
            const commodity = article.commodities[0].toLowerCase();
            
            if (commodity.includes('oil') || commodity.includes('gas')) {
                insights.push('Monitor energy sector correlations and seasonal demand patterns');
            } else if (commodity.includes('gold') || commodity.includes('silver')) {
                insights.push('Watch for safe-haven flows and currency movements');
            } else if (commodity.includes('wheat') || commodity.includes('corn')) {
                insights.push('Consider weather patterns and agricultural supply cycles');
            }
        }
        
        // Add market impact insight
        if (article.marketImpact) {
            insights.push(`Market impact assessed as ${article.marketImpact} - adjust position sizing accordingly`);
        }
        
        // Ensure we have at least 3 insights
        while (insights.length < 3) {
            const defaultInsights = [
                'Monitor volume and price action for confirmation',
                'Consider broader market trends and correlations',
                'Set appropriate stop-loss levels based on volatility'
            ];
            
            const newInsight = defaultInsights[insights.length];
            if (newInsight) {
                insights.push(newInsight);
            } else {
                break;
            }
        }
        
        // Limit to 5 insights max
        return insights.slice(0, 5);
    }
    
    /**
     * Get fallback analysis when API fails
     */
    getFallbackAnalysis(article) {
        return {
            summary: article.summary || article.title,
            finBertSentiment: {
                bullish: 33,
                bearish: 33,
                neutral: 34
            },
            keyDrivers: this.extractKeyDrivers(article, null),
            marketImpact: {
                level: article.marketImpact || 'MEDIUM',
                confidence: 0.5
            },
            traderInsights: [
                'Analysis temporarily unavailable - using cached data',
                'Monitor market conditions for real-time updates',
                'Consider multiple sources for trading decisions'
            ],
            originalArticle: article,
            timestamp: new Date().toISOString(),
            isFallback: true
        };
    }
}

// Export singleton instance
export default new NewsAnalysisService();

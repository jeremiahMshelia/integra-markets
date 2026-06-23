/**
 * API Service for Integra Markets
 * Handles communication with the Python FastAPI backend
 * Implements robust error handling and retry logic
 */

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
const API_URL = `${API_BASE_URL.replace(/\/$/, '')}/api`;

// Common API configuration
const API_CONFIG = {
  timeout: 30000, // 30 seconds for news aggregation
  retries: 3,     // More retries
  retryDelay: 2000, // 2 seconds between retries
};

/**
 * Check network connectivity before making requests
 * Common pattern for React Native apps
 */
const checkNetworkConnectivity = async () => {
  try {
    // Simple connectivity test to a reliable endpoint
    const response = await fetch('https://httpbin.org/status/200', {
      method: 'HEAD',
      cache: 'no-cache',
    });
    return response.ok;
  } catch (error) {
    console.warn('Network connectivity check failed:', error.message);
    return false;
  }
};

/**
 * Enhanced health check with connectivity validation
 */
export const checkApiStatus = async () => {
  try {
    // First check basic connectivity
    const isConnected = await checkNetworkConnectivity();
    if (!isConnected) {
      console.warn('No internet connection detected');
      return false;
    }
    
    const response = await fetchWithTimeout(`${API_BASE_URL}/health`, {}, 5000);
    const isHealthy = response.ok;
    
    if (isHealthy) {
      console.log('API health check passed');
    } else {
      console.warn(`API health check failed: ${response.status}`);
    }
    
    return isHealthy;
  } catch (error) {
    console.error('API health check error:', error.message);
    return false;
  }
};

/**
 * Enhanced fetch with timeout and retry logic
 * Common pattern for React Native API calls
 */
const fetchWithTimeout = async (url, options = {}, timeout = API_CONFIG.timeout) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // Common headers that help with API compatibility
        'User-Agent': 'IntegraMarkets/1.0.1',
        ...options.headers,
      },
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - please check your connection');
    }
    throw error;
  }
};

/**
 * Retry logic for failed requests
 * Common pattern for handling transient network errors
 */
const fetchWithRetry = async (url, options = {}, retries = API_CONFIG.retries) => {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetchWithTimeout(url, options);
      
      // Check for specific error status codes that shouldn't be retried
      if (response.status === 404 || response.status === 401 || response.status === 403) {
        return response; // Don't retry client errors
      }
      
      if (!response.ok && i < retries) {
        console.warn(`API request failed (attempt ${i + 1}/${retries + 1}): ${response.status}`);
        await new Promise(resolve => setTimeout(resolve, API_CONFIG.retryDelay * (i + 1)));
        continue;
      }
      
      return response;
    } catch (error) {
      if (i === retries) {
        console.error('API request failed after all retries:', error.message);
        throw error;
      }
      
      console.warn(`API request failed (attempt ${i + 1}/${retries + 1}):`, error.message);
      await new Promise(resolve => setTimeout(resolve, API_CONFIG.retryDelay * (i + 1)));
    }
  }
};

/**
 * Fetches market sentiment data from the Python backend
 * @returns {Promise<Object>} Market sentiment data
 */
export const fetchMarketSentiment = async () => {
  try {
    const response = await fetchWithRetry(`${API_URL}/sentiment/market`);
    
    if (!response.ok) {
      // Log specific error details for debugging
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Market sentiment API error: ${response.status} - ${errorText}`);
      throw new Error(`API error: ${response.status} - ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Market sentiment fetched successfully');
    return data;
  } catch (error) {
    console.error('Error fetching market sentiment:', error.message);
    // Return default data if API is unreachable
    return {
      overall: 'NEUTRAL',
      confidence: 50,
      commodities: [
        { name: 'OIL', change: 0.0 },
        { name: 'NAT GAS', change: 0.0 },
        { name: 'WHEAT', change: 0.0 },
        { name: 'GOLD', change: 0.0 },
      ],
      error: error.message
    };
  }
};

/**
 * Fetches top market movers data
 * @returns {Promise<Array>} Top market movers
 */
export const fetchTopMovers = async () => {
  try {
    const response = await fetch(`${API_URL}/sentiment/movers`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching top movers:', error);
    return [
      { symbol: 'OIL', sentiment: 0.0, trend: 'neutral' },
      { symbol: 'CORN', sentiment: 0.0, trend: 'neutral' },
      { symbol: 'COPPER', sentiment: 0.0, trend: 'neutral' },
      { symbol: 'SILVER', sentiment: 0.0, trend: 'neutral' },
    ];
  }
};

/**
 * Fetches latest news analysis from real news sources
 * @returns {Promise<Array>} News items with sentiment analysis
 */
export const fetchNewsAnalysis = async (preferences = {}) => {
  try {
    console.log('fetchNewsAnalysis: Fetching real news from backend...');
    
    // Check if enhanced content is requested (for premium users or specific features)
    const enhancedContent = preferences.enhancedContent || false;
    
    const response = await fetchWithRetry(`${API_URL}/news/feed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        max_articles: preferences.maxArticles || 20,
        sources: preferences.sources || null,
        commodity_filter: preferences.commodity || null,
        hours_back: preferences.hoursBack || 12, // Default to 12 hours for fresher content
        enhanced_content: enhancedContent,
        max_enhanced: enhancedContent ? (preferences.maxEnhanced || 3) : 0
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`News feed API error: ${response.status} - ${errorText}`);
      throw new Error(`API error: ${response.status} - ${response.statusText}`);
    }
    
    const data = await response.json();
    // Handle both array response (current) and object with articles property (future)
    const articles = Array.isArray(data) ? data : (data.articles || []);
    const sourcesUsed = Array.isArray(data) ? [] : (data.sources_used || []);
    const status = Array.isArray(data) ? 'success' : (data.status || 'success');
    
    console.log(`✅ Real news data fetched: ${articles.length} articles from ${sourcesUsed.length > 0 ? sourcesUsed.join(', ') : 'various sources'}`);
    
    if (status === 'fallback') {
      console.warn('⚠️  Using fallback mock data - news sources not available on backend');
    }
    
    return articles;
  } catch (error) {
    console.error('Error fetching news analysis:', error.message);
    
    // Return fallback mock data
    console.log('📄 Using local fallback data');
    return [
      {
        id: 1,
        title: 'Oil Prices Rise Amid Supply Concerns',
        summary: 'Crude oil futures jumped 2.3% as geopolitical tensions raise supply concerns in key producing regions.',
        source: 'Reuters',
        source_url: 'https://reuters.com',
        time_published: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        sentiment: 'BULLISH',
        sentiment_score: 0.72,
        categories: ['energy', 'commodities'],
        tickers: ['WTI', 'BRENT']
      },
      {
        id: 2,
        title: 'Gold Holds Steady as Fed Signals Caution', 
        summary: 'Gold prices remained stable around $1,950 per ounce as Federal Reserve officials signal a cautious approach to rate changes.',
        source: 'Bloomberg',
        source_url: 'https://bloomberg.com',
        time_published: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        sentiment: 'NEUTRAL',
        sentiment_score: 0.51,
        categories: ['metals', 'precious metals'],
        tickers: ['GOLD']
      },
      {
        id: 3,
        title: 'Wheat Futures Fall on Improved Weather Forecast',
        summary: 'Chicago wheat futures declined 1.8% after meteorologists predicted favorable weather conditions for major growing regions.',
        source: 'MarketWatch',
        source_url: 'https://marketwatch.com',
        time_published: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        sentiment: 'BEARISH',
        sentiment_score: 0.34,
        categories: ['agriculture', 'grains'],
        tickers: ['WHEAT']
      }
    ];
  }
};

/**
 * Fetches latest weather alerts
 * @returns {Promise<Object>} Weather alerts
 */
export const fetchWeatherAlerts = async () => {
  try {
    const response = await fetch(`${API_URL}/weather/alerts`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching weather alerts:', error);
    return null;
  }
};


/**
 * Preprocesses raw news text
 * @param {string} rawText - Raw news text
 * @returns {Promise<Object>} Preprocessed news data
 */
export const preprocessNews = async (rawText) => {
  try {
    // Use analyze-sentiment endpoint instead of non-existent preprocess-news
    const response = await fetch(`${API_BASE_URL}/analyze-sentiment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: rawText }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('News preprocessing failed:', error);
    // Fallback to basic preprocessing
    return {
      commodity: 'general',
      event_type: 'market_movement',
      region: 'Global',
      entities: [],
      trigger_keywords: [],
      market_impact: 'neutral',
      severity: 'low',
      confidence_score: 0.1,
      summary: rawText.substring(0, 200) + '...',
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Analyzes news text using the backend analysis endpoint
 * @param {string} newsText - The news text to analyze
 * @param {string} source - Optional source identifier
 * @returns {Promise<Object>} Analysis result with sentiment and insights
 */
export const analyzeNewsText = async (newsText, source = null) => {
  try {
    const response = await fetchWithRetry(`${API_URL}/news/analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: newsText,
        source: source
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`News text analysis API error: ${response.status} - ${errorText}`);
      throw new Error(`API error: ${response.status} - ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('News text analysis completed successfully');
    return data;
  } catch (error) {
    console.error('Error analyzing news text:', error.message);
    return {
      sentiment: 'NEUTRAL',
      confidence: 0.5,
      analysis: 'Text analysis failed',
      error: error.message
    };
  }
};

/**
 * Fetches enhanced news data
 * @deprecated Use fetchNewsAnalysis() instead - this returns mock data
 * @returns {Promise<Array>} Enhanced news items
 */
export const getEnhancedNews = async () => {
  console.warn('getEnhancedNews is deprecated, using fetchNewsAnalysis instead');
  return await fetchNewsAnalysis();
};

/**
 * Performs sentiment analysis on text
 * @param {string} text - Text to analyze
 * @param {string|null} commodity - Optional commodity context
 * @returns {Promise<Object>} Sentiment analysis result
 */
export const getSentimentAnalysis = async (text, commodity = null) => {
  try {
    const response = await fetch(`${API_URL}/sentiment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        text, 
        commodity,
        enhanced: true // Request enhanced analysis
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Sentiment analysis failed:', error);
    return {
      sentiment: 'neutral',
      confidence: 0.5,
      commodity_specific: false
    };
  }
};

/**
 * Dashboard API for TodayDashboard component
 */
export const dashboardApi = {
  getTodayDashboard: async (commodities = []) => {
    try {
      // Try to fetch real-time market data
      const response = await fetch(`${API_URL}/sentiment/market`);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const marketData = await response.json();
      
      // Also fetch news analysis (using POST as required by the backend)
      const newsResponse = await fetch(`${API_URL}/news/analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      });
      let newsData = [];
      if (newsResponse.ok) {
        const rawNews = await newsResponse.json();
        // Handle both array and object responses
        newsData = Array.isArray(rawNews) ? rawNews : (rawNews.articles || []);
      }
      
      return {
        status: 'success',
        data: marketData.data || {},
        news: newsData,
        requestedCommodities: commodities,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Dashboard API error:', error);
      // Return empty data structure on error
      return {
        status: 'error',
        data: {},
        news: [],
        error: error.message
      };
    }
  },

  getSentimentEngine: async (commodities = [], options = {}) => {
    try {
      const response = await fetchWithRetry(`${API_URL}/dashboard/sentiment-engine`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commodities,
          max_headlines: options.maxHeadlines || 15,
          refresh_if_empty: options.refreshIfEmpty !== false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Sentiment engine dashboard API error:', error);
      return {
        overall_sentiment: 'NEUTRAL',
        confidence: 0.5,
        commodities: [],
        error: error.message,
      };
    }
  }
};

/**
 * Sentiment API for enhanced analysis
 */
export const sentimentApi = {
  analyzeEnhanced: async (text, commodity = null) => {
    try {
      const response = await fetch(`${API_URL}/sentiment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          text, 
          commodity,
          enhanced: true
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Format response for TodayDashboard
      return {
        bullish: data.sentiment === 'BULLISH' ? data.confidence : 0.2,
        bearish: data.sentiment === 'BEARISH' ? data.confidence : 0.2,
        neutral: data.sentiment === 'NEUTRAL' ? data.confidence : 0.2,
        confidence: data.confidence || 0.5,
        impact: data.sentiment === 'BULLISH' ? 'HIGH' : data.sentiment === 'BEARISH' ? 'HIGH' : 'MEDIUM',
        keywords: [],
        method: data.method || 'unknown'
      };
    } catch (error) {
      console.error('Enhanced sentiment analysis error:', error);
      return {
        bullish: 0.33,
        bearish: 0.33,
        neutral: 0.34,
        confidence: 0.5,
        impact: 'MEDIUM',
        keywords: [],
        error: error.message
      };
    }
  },

  getCommodityLexiconCatalog: async () => {
    try {
      const response = await fetchWithRetry(`${API_URL}/lexicon/commodities`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Commodity lexicon catalog error:', error);
      return {
        count: 0,
        commodities: [],
        error: error.message,
      };
    }
  },

  getCommodityLexicon: async (commodity) => {
    try {
      const response = await fetchWithRetry(`${API_URL}/lexicon/commodities/${encodeURIComponent(commodity)}`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Commodity lexicon detail error:', error);
      return {
        commodity,
        bullish_rules: [],
        bearish_rules: [],
        error: error.message,
      };
    }
  },

  explainLexicon: async (text, commodity = null, includeRulebook = false) => {
    try {
      const response = await fetchWithRetry(`${API_URL}/lexicon/explain`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          commodity,
          include_rulebook: includeRulebook,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Lexicon explain API error:', error);
      return {
        text,
        commodity,
        sentiment: 'NEUTRAL',
        confidence: 0.5,
        market_context: { matched_signals: [] },
        keywords: [],
        tickers: [],
        error: error.message,
      };
    }
  }
};

/**
 * Market Data API
 */
export const marketDataApi = {
  getRealtimeData: fetchMarketSentiment,
  getTopMovers: fetchTopMovers,
  getMarketOverview: async () => {
    try {
      const response = await fetch(`${API_URL}/sentiment/market`);
      if (!response.ok) throw new Error('Failed to fetch market data');
      return await response.json();
    } catch (error) {
      console.error('Market data error:', error);
      return { data: {}, status: 'error' };
    }
  }
};

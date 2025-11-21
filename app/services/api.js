import Constants from 'expo-constants';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || 'http://localhost:8000';
const API_URL = `${API_BASE_URL}/api`;
console.log('[api] API_BASE_URL', API_BASE_URL);

const request = async (path, options = {}) => {
  const url = `${API_URL}${path}`;

  try {
    console.log('[api]', (options.method || 'GET'), url);
  } catch {}

  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  });

  if (!response.ok) {
    const message = await response.text();
    try { console.log('[api] error', response.status, message?.slice?.(0, 200)); } catch {}
    throw new Error(`API error ${response.status}: ${message}`);
  }

  return response.status === 204 ? null : response.json();
};

export const dashboardApi = {
  /**
   * Aggregates the Today dashboard data from backend endpoints.
   * Backend exposes /api/sentiment/market, /api/sentiment/movers, /api/news/analysis, /api/weather/alerts.
   * We merge them client-side for now.
   */
  async getTodayDashboard(trackedCommodities = []) {
    try {
      const [marketSentiment, topMovers, _unused, weatherAlerts] = await Promise.all([
        request('/sentiment/market'),
        request('/sentiment/movers'),
        Promise.resolve(null),
        request('/weather/alerts'),
      ]);

      // Single news request with fallback to analysis
      const hours = 24;
      let newsData = { articles: [] };
      try {
        newsData = await request('/news/latest', {
          method: 'POST',
          body: JSON.stringify({ commodities: trackedCommodities, hours }),
        });
      } catch {
        newsData = { articles: [] };
      }
      if (!Array.isArray(newsData?.articles) || newsData.articles.length === 0) {
        try {
          newsData = await request(`/news/analysis?hours=${hours}`, { method: 'GET' });
        } catch {
          newsData = { articles: [] };
        }
      }

      return {
        sentiment: marketSentiment,
        movers: topMovers,
        weather: weatherAlerts,
        news: Array.isArray(newsData?.articles)
          ? newsData.articles
          : Array.isArray(newsData)
            ? newsData
            : [],
      };
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      throw error;
    }
  },
};

export const sentimentApi = {
  async analyzeEnhanced(text, commodity = null) {
    return request('/sentiment', {
      method: 'POST',
      body: JSON.stringify({ text, commodity, enhanced: true }),
    });
  },

  async getMarketSentiment() {
    return request('/sentiment/market');
  },

  async getTopMovers() {
    return request('/sentiment/movers');
  },
};

export const marketDataApi = {
  async getWeatherAlerts() {
    return request('/weather/alerts');
  },

  async getNewsAnalysis() {
    return request('/news/analysis', { method: 'GET' });
  },
};

export const fetchMarketSentiment = sentimentApi.getMarketSentiment;
export const fetchTopMovers = sentimentApi.getTopMovers;
export const fetchNewsAnalysis = marketDataApi.getNewsAnalysis;
export const fetchWeatherAlerts = marketDataApi.getWeatherAlerts;

/**
 * Checks status of the Python backend
 * @returns {Promise<boolean>} True if backend is online
 */
export const checkApiStatus = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.ok;
  } catch (error) {
    console.warn('API not available:', error);
    return false;
  }
};

/**
 * Preprocesses raw news text
 * @param {string} rawText - Raw news text
 * @returns {Promise<Object>} Preprocessed news data
 */
export const preprocessNews = async (rawText) => {
  try {
    const response = await fetch(`${API_URL}/preprocess-news`, {
      method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` }),
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
 * Fetches enhanced news data
 * @returns {Promise<Array>} Enhanced news items
 */
export const getEnhancedNews = async () => {
  try {
    const response = await fetch(`${API_URL}/news/enhanced`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Enhanced news fetch failed:', error);
    return [];
  }
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
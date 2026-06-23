/**
 * Debug API Helper to troubleshoot connection issues
 */

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://integra-markets-backend.fly.dev';
const API_URL = `${API_BASE_URL.replace(/\/$/, '')}/api`;

export const testConnection = async () => {
  console.log('===== API CONNECTION DEBUG =====');
  console.log(`Testing connection to: ${API_BASE_URL}`);
  
  // Test 1: Basic connectivity
  try {
    console.log('Test 1: Basic health check...');
    const healthResponse = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });
    
    console.log(`Health check response status: ${healthResponse.status}`);
    
    if (healthResponse.ok) {
      const data = await healthResponse.json();
      console.log('✅ Health check SUCCESS:', data);
    } else {
      console.log('❌ Health check failed with status:', healthResponse.status);
    }
  } catch (error) {
    console.log('❌ Health check ERROR:', error.message);
    console.log('Full error:', error);
  }
  
  // Test 2: Market data endpoint
  try {
    console.log('\nTest 2: Market data endpoint...');
    const marketResponse = await fetch(`${API_URL}/sentiment/market`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      }
    });
    
    console.log(`Market data response status: ${marketResponse.status}`);
    
    if (marketResponse.ok) {
      const data = await marketResponse.json();
      console.log('✅ Market data SUCCESS:', data);
      return data;
    } else {
      console.log('❌ Market data failed with status:', marketResponse.status);
    }
  } catch (error) {
    console.log('❌ Market data ERROR:', error.message);
    console.log('Full error:', error);
  }
  
  // Test 3: News endpoint
  try {
    console.log('\nTest 3: News analysis endpoint...');
    const newsResponse = await fetch(`${API_URL}/news/analysis`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
    });
    
    console.log(`News response status: ${newsResponse.status}`);
    
    if (newsResponse.ok) {
      const data = await newsResponse.json();
      console.log('✅ News analysis SUCCESS:', Array.isArray(data) ? `${data.length} items` : data);
    } else {
      console.log('❌ News analysis failed with status:', newsResponse.status);
    }
  } catch (error) {
    console.log('❌ News analysis ERROR:', error.message);
  }
  
  console.log('\n===== END DEBUG =====\n');
  
  // Return mock data if all fails
  return {
    status: 'debug',
    message: 'See console for debug output',
    mockData: {
      news: [{
        id: 1,
        title: 'Debug Test Article',
        summary: 'API connection debugging in progress',
        sentiment: 'NEUTRAL'
      }]
    }
  };
};

// Enhanced dashboard API with extensive logging
export const debugDashboardApi = {
  getTodayDashboard: async (commodities = []) => {
    console.log('\n📱 DASHBOARD API CALL');
    console.log('Commodities:', commodities);
    console.log('API URL:', API_URL);
    
    try {
      // Step 1: Try market data
      console.log('Step 1: Fetching market data...');
      const marketUrl = `${API_URL}/sentiment/market`;
      console.log('Market URL:', marketUrl);
      
      const response = await fetch(marketUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }
      }).catch(err => {
        console.log('Fetch error:', err);
        throw err;
      });
      
      console.log('Market response received:', response.status, response.statusText);
      
      if (!response.ok) {
        console.log('Market response not OK');
        throw new Error(`API error: ${response.status}`);
      }
      
      const marketData = await response.json();
      console.log('Market data parsed:', marketData);
      
      // Step 2: Try news
      console.log('\nStep 2: Fetching news...');
      const newsUrl = `${API_URL}/news/analysis`;
      console.log('News URL:', newsUrl);
      
      const newsResponse = await fetch(newsUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      }).catch(err => {
        console.log('News fetch error:', err);
        return null;
      });
      
      let newsData = [];
      if (newsResponse && newsResponse.ok) {
        newsData = await newsResponse.json();
        console.log('News data received:', newsData.length, 'items');
      } else {
        console.log('News fetch failed or returned non-OK status');
      }
      
      const result = {
        status: 'success',
        data: marketData.data || {},
        news: newsData,
        timestamp: new Date().toISOString()
      };
      
      console.log('✅ Dashboard API SUCCESS');
      console.log('Returning:', result);
      
      return result;
      
    } catch (error) {
      console.log('❌ DASHBOARD API ERROR');
      console.log('Error type:', error.constructor.name);
      console.log('Error message:', error.message);
      console.log('Error stack:', error.stack);
      
      // Return empty data structure on error
      const fallback = {
        status: 'error',
        data: {},
        news: [],
        error: error.message,
        errorDetails: {
          type: error.constructor.name,
          message: error.message,
          apiUrl: API_URL
        }
      };
      
      console.log('Returning fallback:', fallback);
      return fallback;
    }
  }
};

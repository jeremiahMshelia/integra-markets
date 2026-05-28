/**
 * Enhanced Sentiment Analysis Hook
 * Integrates with FinBERT and VADER backend APIs
 */
import { useState, useCallback } from 'react';

const _API_ROOT =
  process.env.EXPO_PUBLIC_API_URL || 'https://integra-markets-backend.fly.dev';
const API_BASE_URL = `${_API_ROOT.replace(/\/$/, '')}/api`;

export const useSentimentAnalysis = () => {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const analyzeText = useCallback(async (text, options = {}) => {
    const {
      commodity = null,
      enhanced = true,
      includePreprocessing = true
    } = options;

    setLoading(true);
    setError(null);

    try {
      const endpoint = includePreprocessing ? 
        '/comprehensive-analysis' : 
        '/analyze-sentiment';

      const requestBody = includePreprocessing ? {
        text,
        commodity,
        include_preprocessing: true,
        include_finbert: enhanced
      } : {
        text,
        commodity,
        enhanced
      };

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
      return data;

    } catch (err) {
      console.error('Sentiment analysis error:', err);
      setError(err.message);
      
      // Return fallback data for offline functionality
      return {
        status: 'fallback',
        analysis: {
          sentiment: 'Neutral',
          confidence: 0.5,
          market_impact: 'neutral',
          severity: 'low',
          commodity_specific: false
        }
      };
    } finally {
      setLoading(false);
    }
  }, []);

  const checkApiStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  const getModelStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/models/status`);
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  return {
    analyzeText,
    result,
    loading,
    error,
    checkApiStatus,
    getModelStatus
  };
};

export default useSentimentAnalysis;
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  ScrollView,
  Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import EnhancedNewsAnalysis, { preprocessNews } from './EnhancedNewsAnalysis';
import useSentimentAnalysis from '../services/useSentimentAnalysis';

// Color palette - Updated for consistency with App.js
const colors = {
  bgPrimary: '#121212',
  bgSecondary: '#1E1E1E',
  textPrimary: '#ECECEC',
  textSecondary: '#A0A0A0',
  accentPositive: '#4ECCA3', // Mint Green - consistent with App.js
  accentNegative: '#F05454', // Red - consistent with App.js
  accentNeutral: '#A0A0A0', // Gray - consistent with App.js (changed from yellow)
  accentData: '#30A5FF',    // Cyan Blue - consistent with App.js
  divider: '#333333',
};

const AISentimentModal = ({ visible, onClose, newsItem }) => {
  const [showEnhancedAnalysis, setShowEnhancedAnalysis] = useState(false);
  const [realSentimentData, setRealSentimentData] = useState(null);
  const { analyzeText, loading, error } = useSentimentAnalysis();

  useEffect(() => {
    if (visible && newsItem) {
      performRealAnalysis();
    }
  }, [visible, newsItem]);

  const performRealAnalysis = async () => {
    const fullText = `${newsItem.headline}. ${newsItem.summary}`;
    const result = await analyzeText(fullText, {
      enhanced: true,
      includePreprocessing: true,
      commodity: newsItem.preprocessing?.commodity
    });

    if (result && result.analysis) {
      setRealSentimentData(result.analysis);
    }
  };

  if (!newsItem) return null;

  const analysisData = realSentimentData || {};
  const sentimentAnalysis = analysisData.sentiment_analysis || {};
  const finbertData = sentimentAnalysis.details?.finbert;
  const vaderData = sentimentAnalysis.details?.vader;

  const sentimentData = {
    bullish: finbertData?.probabilities?.positive ? (finbertData.probabilities.positive * 100) : 20.0,
    bearish: finbertData?.probabilities?.negative ? (finbertData.probabilities.negative * 100) : 20.0,
    neutral: finbertData?.probabilities?.neutral ? (finbertData.probabilities.neutral * 100) : 70.0,
  };

  const keyDrivers = analysisData.preprocessing?.trigger_keywords?.map(kw => `${kw.keyword} (${kw.relevance.toFixed(2)})`) || ['No drivers available'];

  const marketImpact = sentimentAnalysis.market_impact?.toUpperCase() || 'MEDIUM';
  const confidence = sentimentAnalysis.confidence || 0.5;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{loading ? 'Analyzing...' : 'AI Sentiment Analysis'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {loading && (
              <View style={styles.loadingContainer}>
                <MaterialIcons name="auto-awesome" size={48} color={colors.accentData} />
                <Text style={styles.loadingText}>Processing with FinBERT & VADER...</Text>
              </View>
            )}

            {!loading && (
              <>
                <Text style={styles.newsTitle}>{newsItem.headline}</Text>
                <Text style={styles.newsSource}>{newsItem.source}</Text>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Key Sentiment Drivers</Text>
                  <View style={styles.driversContainer}>
                    {keyDrivers.map((driver, index) => (
                      <View key={index} style={styles.driverTag}>
                        <Text style={styles.driverText}>{driver}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Trading Intelligence</Text>
                  <View style={styles.tradingIntelligenceContainer}>
                    <Text style={styles.riskLevel}>Risk Level: {analysisData.trading_intelligence?.risk_level || 'Unknown'}</Text>
                    <Text style={styles.timeHorizon}>Time Horizon: {analysisData.trading_intelligence?.time_horizon || 'N/A'}</Text>
                    <View style={styles.recommendationsContainer}>
                      {analysisData.trading_intelligence?.recommendations?.map((rec, index) => (
                        <Text key={index} style={styles.recommendation}>• {rec}</Text>
                      )) || <Text>No recommendations available</Text>}
                    </View>
                  </View>
                </View>

                {/* Groq Trader Insights */}
                {analysisData.trader_insights?.success && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>What It Means For Traders</Text>
                    <View style={[styles.tradingIntelligenceContainer, { backgroundColor: '#1a3320' }]}>
                      <Text style={styles.traderSummary}>
                        {analysisData.trader_insights?.trader_summary || 'No summary available'}
                      </Text>
                      {analysisData.trader_insights?.key_driver && (
                        <View style={styles.keyDriverContainer}>
                          <Text style={styles.keyDriverLabel}>Key Driver:</Text>
                          <Text style={styles.keyDriverValue}>
                            {analysisData.trader_insights.key_driver}
                          </Text>
                        </View>
                      )}
                      {analysisData.trader_insights?.action_considerations?.length > 0 && (
                        <View style={styles.actionContainer}>
                          <Text style={styles.actionLabel}>Action Considerations:</Text>
                          {analysisData.trader_insights.action_considerations.map((action, idx) => (
                            <Text key={idx} style={styles.actionItem}>• {action}</Text>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                )}

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>VADER Analysis</Text>
                  <View style={styles.vaderContainer}>
                    <Text style={styles.vaderScore}>Compound Score: {vaderData?.compound?.toFixed(3) || 'N/A'}</Text>
                    <Text style={styles.vaderBreakdown}>
                      Pos: {(vaderData?.positive * 100)?.toFixed(1)}% | Neu: {(vaderData?.neutral * 100)?.toFixed(1)}% | Neg: {(vaderData?.negative * 100)?.toFixed(1)}%
                    </Text>
                  </View>
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Market Impact</Text>
                  <View style={styles.impactContainer}>
                    <View style={styles.impactBadge}>
                      <Text style={styles.impactText}>{marketImpact}</Text>
                    </View>
                    <Text style={styles.confidenceText}>Confidence: {(confidence * 100).toFixed(2)}%</Text>
                  </View>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalContainer: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '600',
  },
  closeButton: {
    padding: 5,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  newsTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    lineHeight: 24,
  },
  newsSource: {
    color: colors.accentData,
    fontSize: 14,
    marginBottom: 20,
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    color: colors.accentData,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 15,
    borderLeftWidth: 3,
    borderLeftColor: colors.accentData,
    paddingLeft: 12,
  },
  summaryText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  sentimentBarContainer: {
    marginBottom: 15,
  },
  sentimentBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sentimentLabel: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
  },
  sentimentPercentage: {
    fontSize: 16,
    fontWeight: '600',
  },
  sentimentBarTrack: {
    height: 8,
    backgroundColor: colors.bgPrimary,
    borderRadius: 4,
    overflow: 'hidden',
  },
  sentimentBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  driversContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  driverTag: {
    backgroundColor: colors.accentData, // Updated to use accentData (blue) for consistency
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  driverText: {
    color: colors.bgPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  impactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  impactBadge: {
    backgroundColor: colors.accentData, // Updated to use accentData (blue) for consistency
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 15,
  },
  impactText: {
    color: colors.bgPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  confidenceText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgPrimary,
    padding: 15,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 8,
  },
  errorBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accentNegative,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  errorNumber: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  errorText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 14,
  },
  errorClose: {
    padding: 5,
  },
  quickIntelligenceContainer: {
    backgroundColor: colors.bgPrimary,
    borderRadius: 8,
    padding: 15,
    borderLeftWidth: 4,
    borderLeftColor: colors.accentData,
  },
  quickIntelligenceText: {
    color: colors.accentData,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  quickIntelligenceDirection: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
  },
  enhancedAnalysisButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentData,
    borderRadius: 10,
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginVertical: 20,
    gap: 10,
  },
  enhancedAnalysisButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 16,
    marginTop: 15,
  },
  vaderContainer: {
    backgroundColor: colors.bgPrimary,
    borderRadius: 8,
    padding: 15,
  },
  vaderScore: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  vaderBreakdown: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  tradingIntelligenceContainer: {
    backgroundColor: colors.bgPrimary,
    borderRadius: 8,
    padding: 15,
    borderLeftWidth: 4,
    borderLeftColor: colors.accentData,
  },
  riskLevel: {
    color: colors.accentData,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  timeHorizon: {
    color: colors.textPrimary,
    fontSize: 14,
    marginBottom: 15,
  },
  recommendationsContainer: {
    marginTop: 10,
  },
  recommendation: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 5,
    lineHeight: 20,
  },
  traderSummary: {
    color: '#4ECCA3',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 15,
  },
  keyDriverContainer: {
    backgroundColor: 'rgba(78, 204, 163, 0.1)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  keyDriverLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
  keyDriverValue: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
  },
  actionContainer: {
    marginTop: 5,
  },
  actionLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 6,
  },
  actionItem: {
    color: colors.textPrimary,
    fontSize: 13,
    marginBottom: 4,
    lineHeight: 18,
  },
});

export default AISentimentModal;
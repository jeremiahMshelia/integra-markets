import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, Share, Alert } from 'react-native';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { dashboardApi, sentimentApi, marketDataApi } from '../services/api';
import IntegraIcon from './IntegraIcon';
import AIAnalysisOverlay from './AIAnalysisOverlay';
import { getPreferredSourceUrl } from '../utils/polymarketLinks';

const TodayDashboard = ({ agentActive }) => {
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [newsData, setNewsData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [sentimentModalVisible, setSentimentModalVisible] = useState(false);
  const [sentimentAnalysis, setSentimentAnalysis] = useState(null);
  const [sentimentLoading, setSentimentLoading] = useState(false);
const [marketData, setMarketData] = useState(null);
  const [aiOverlayVisible, setAiOverlayVisible] = useState(false);
  const [selectedNews, setSelectedNews] = useState(null);

  const filterOptions = ['All', 'Bullish', 'Neutral', 'Bearish', 'Divergence'];

  const trackedCommodities = ['OIL', 'GOLD', 'WHEAT', 'NAT GAS'];

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      // Use real dashboard API for production
      const dashboardData = await dashboardApi.getTodayDashboard(trackedCommodities);

      if (dashboardData.news && dashboardData.news.length > 0) {
        const processedNews = dashboardData.news.map((article, index) => ({
          id: index + 1,
          headline: article.title,
          summary: article.summary,
          source: article.source,
          sourceUrl: getPreferredSourceUrl(article) || getSourceUrl(article.source),
          eventUrl: article.event_url || article.eventUrl || article.polymarket_url || article.polymarketUrl,
          eventSlug: article.event_slug || article.eventSlug || article.slug || article.polymarket_slug || article.polymarketSlug,
          polymarketContext: article.polymarket_context || article.polymarketContext,
          timeAgo: formatTimeAgo(article.time_published),
          sentiment: article.ensemble_sentiment || article.sentiment,
          sentimentScore: article.sentiment_score ? article.sentiment_score.toFixed(2) : "0.50",
          category: getCategoryFromArticle(article),
          originalArticle: article
        }));

        setNewsData(processedNews);
      } else {
        setNewsData(sampleNewsData);
      }

      setMarketData(dashboardData);
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setNewsData(sampleNewsData);
      setIsLoading(false);
    }
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return "recently";

    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.round(diffMs / 60000);

      if (diffMins < 60) {
        return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
      } else if (diffMins < 1440) {
        const hours = Math.floor(diffMins / 60);
        return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
      } else {
        const days = Math.floor(diffMins / 1440);
        return `${days} day${days !== 1 ? 's' : ''} ago`;
      }
    } catch (e) {
      return "recently";
    }
  };

  const getSourceUrl = (source) => {
    // Map common sources to their URLs
    const sourceUrls = {
      'Bloomberg': 'https://www.bloomberg.com',
      'Reuters': 'https://www.reuters.com',
      'MarketWatch': 'https://www.marketwatch.com',
      'Financial Times': 'https://www.ft.com',
      'CNBC': 'https://www.cnbc.com',
      'Wall Street Journal': 'https://www.wsj.com',
      'Yahoo Finance': 'https://finance.yahoo.com',
      'Investing.com': 'https://www.investing.com',
      'IEA': 'https://www.iea.org',
      'EIA': 'https://www.eia.gov',
    };
    
    return sourceUrls[source] || null;
  };

  const getCategoryFromArticle = (article) => {
    if (article.categories && article.categories.length > 0) {
      const categories = article.categories.map(c => c.toLowerCase());
      if (categories.some(c => c.includes('energy') || c.includes('oil') || c.includes('gas'))) {
        return 'energy';
      } else if (categories.some(c => c.includes('gold') || c.includes('silver') || c.includes('metal'))) {
        return 'metals';
      } else if (categories.some(c => c.includes('agriculture') || c.includes('crop') || c.includes('grain'))) {
        return 'agriculture';
      }
    }

    if (article.tickers && article.tickers.length > 0) {
      const tickers = article.tickers.map(t => t.toLowerCase());
      if (tickers.includes('wti') || tickers.includes('brent') || tickers.includes('natural_gas')) {
        return 'energy';
      } else if (tickers.includes('gold') || tickers.includes('silver') || tickers.includes('copper')) {
        return 'metals';
      } else if (tickers.includes('wheat') || tickers.includes('corn') || tickers.includes('soybean')) {
        return 'agriculture';
      }
    }

    return 'general';
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const getSentimentColor = (sentiment) => {
    switch (sentiment) {
      case 'BULLISH': return '#4ECCA3';
      case 'BEARISH': return '#F05454';
      case 'NEUTRAL': return '#FFD700';
      default: return '#A0A0A0';
    }
  };

  const getSentimentIcon = (sentiment) => {
    switch (sentiment) {
      case 'BULLISH': return 'trending-up';
      case 'BEARISH': return 'trending-down';
      case 'NEUTRAL': return 'trending-flat';
      default: return 'remove';
    }
  };

  const filteredNews = newsData.filter(item => {
    if (selectedFilter === 'All') return true;
    if (selectedFilter === 'Divergence') return item.divergenceStatus === 'DIVERGENCE';
    return item.sentiment === selectedFilter.toUpperCase();
  });

  const fetchSentimentAnalysis = async (article) => {
    setSentimentLoading(true);
    try {
      let analysis;

      if (article.originalArticle && article.originalArticle.integra_sentiment) {
        const originalArticle = article.originalArticle;

        analysis = {
          summary: article.summary,
          headline: article.headline,
          source: article.source,
          models: {
            finbert: {
              bullish: originalArticle.integra_sentiment.bullish_score || 0,
              bearish: originalArticle.integra_sentiment.bearish_score || 0,
              neutral: originalArticle.integra_sentiment.neutral_score || 0,
            },
            keywords: originalArticle.keywords || [],
            marketImpact: originalArticle.impact || "MEDIUM",
            confidence: originalArticle.integra_sentiment.confidence || 0.5
          }
        };

        if (originalArticle.market_data) {
          analysis.marketData = originalArticle.market_data;
        }
      } else {
        const text = `${article.headline}. ${article.summary}`;

        let category = '';
        if (article.category === 'energy') category = 'OIL';
        else if (article.category === 'metals') category = 'GOLD';
        else if (article.category === 'agriculture') category = 'WHEAT';

        const enhancedResult = await sentimentApi.analyzeEnhanced(text, category);

        analysis = {
          summary: article.summary,
          headline: article.headline,
          source: article.source,
          models: {
            finbert: {
              bullish: enhancedResult.bullish || 0,
              bearish: enhancedResult.bearish || 0,
              neutral: enhancedResult.neutral || 0,
            },
            keywords: enhancedResult.keywords || [],
            marketImpact: enhancedResult.impact || "MEDIUM",
            confidence: enhancedResult.confidence || 0.5
          }
        };

        if (enhancedResult.market_data) {
          analysis.marketData = enhancedResult.market_data;
        }
      }

      setSentimentAnalysis(analysis);
      setSentimentLoading(false);
    } catch (error) {
      console.error('Error fetching sentiment analysis:', error);
      setSentimentLoading(false);

      const analysis = {
        summary: article.summary,
        headline: article.headline,
        source: article.source,
        models: {
          finbert: {
            bullish: article.sentiment === 'BULLISH' ? 0.7 : 0.2,
            bearish: article.sentiment === 'BEARISH' ? 0.7 : 0.2,
            neutral: article.sentiment === 'NEUTRAL' ? 0.7 : 0.2,
          },
          keywords: [
            { word: "market", sentiment: "neutral", score: 0.50 }
          ],
          marketImpact: "MEDIUM",
          confidence: 0.5
        }
      };

      setSentimentAnalysis(analysis);
    }
  };

  const showSentimentAnalysis = (article) => {
    setSelectedArticle(article);
    setSentimentModalVisible(true);
    fetchSentimentAnalysis(article);
  };

  const renderSentimentModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={sentimentModalVisible}
      onRequestClose={() => setSentimentModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>AI Sentiment Analysis</Text>
            <TouchableOpacity onPress={() => setSentimentModalVisible(false)}>
              <MaterialIcons name="close" size={24} color="#ECECEC" />
            </TouchableOpacity>
          </View>
          {sentimentLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4ECCA3" />
              <Text style={styles.loadingText}>Analyzing sentiment...</Text>
            </View>
          ) : sentimentAnalysis ? (
            <ScrollView style={styles.analysisContainer}>
              <Text style={styles.articleHeadline}>{sentimentAnalysis.headline}</Text>
              <Text style={styles.articleSource}>{sentimentAnalysis.source}</Text>
              <View style={styles.analysisSection}>
                <Text style={styles.sectionTitle}>Summary</Text>
                <Text style={styles.summarText}>{sentimentAnalysis.summary}</Text>
              </View>
              <View style={styles.analysisSection}>
                <Text style={styles.sectionTitle}>FinBERT Sentiment</Text>
                <View style={styles.barContainer}>
                  <View style={styles.labelContainer}>
                    <Text style={styles.barLabel}>Bullish</Text>
                    <Text style={[styles.barValue, { color: '#4ECCA3' }]}>
                      {(sentimentAnalysis.models.finbert.bullish * 100).toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.barBackground}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${sentimentAnalysis.models.finbert.bullish * 100}%`,
                          backgroundColor: '#4ECCA3'
                        }
                      ]}
                    />
                  </View>
                </View>
                <View style={styles.barContainer}>
                  <View style={styles.labelContainer}>
                    <Text style={styles.barLabel}>Bearish</Text>
                    <Text style={[styles.barValue, { color: '#F05454' }]}>
                      {(sentimentAnalysis.models.finbert.bearish * 100).toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.barBackground}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${sentimentAnalysis.models.finbert.bearish * 100}%`,
                          backgroundColor: '#F05454'
                        }
                      ]}
                    />
                  </View>
                </View>
                <View style={styles.barContainer}>
                  <View style={styles.labelContainer}>
                    <Text style={styles.barLabel}>Neutral</Text>
                    <Text style={[styles.barValue, { color: '#FFD700' }]}>
                      {(sentimentAnalysis.models.finbert.neutral * 100).toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.barBackground}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${sentimentAnalysis.models.finbert.neutral * 100}%`,
                          backgroundColor: '#FFD700'
                        }
                      ]}
                    />
                  </View>
                </View>
              </View>
              <View style={styles.analysisSection}>
                <Text style={styles.sectionTitle}>Key Sentiment Drivers</Text>
                <View style={styles.keywordsContainer}>
                  {sentimentAnalysis.models.keywords.map((keyword, index) => (
                    <View
                      key={index}
                      style={[
                        styles.keywordTag,
                        {
                          backgroundColor: keyword.sentiment === 'positive'
                            ? 'rgba(78, 204, 163, 0.2)'
                            : keyword.sentiment === 'negative'
                              ? 'rgba(240, 84, 84, 0.2)'
                              : 'rgba(255, 215, 0, 0.2)'
                        }
                      ]}
                    >
                      <Text
                        style={[
                          styles.keywordText,
                          {
                            color: keyword.sentiment === 'positive'
                              ? '#4ECCA3'
                              : keyword.sentiment === 'negative'
                                ? '#F05454'
                                : '#FFD700'
                          }
                        ]}
                      >
                        {keyword.word} ({keyword.score})
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={styles.analysisSection}>
                <Text style={styles.sectionTitle}>Market Impact</Text>
                <View style={styles.impactContainer}>
                  <View
                    style={[
                      styles.impactIndicator,
                      {
                        backgroundColor: sentimentAnalysis.models.marketImpact === "HIGH"
                          ? '#F05454'
                          : sentimentAnalysis.models.marketImpact === "MEDIUM"
                            ? '#FFD700'
                            : '#4ECCA3'
                      }
                    ]}
                  >
                    <Text style={styles.impactText}>
                      {sentimentAnalysis.models.marketImpact}
                    </Text>
                  </View>
                  <Text style={styles.confidenceText}>
                    Confidence: {sentimentAnalysis.models.confidence}
                  </Text>
                </View>
              </View>
            </ScrollView>
          ) : (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Failed to load sentiment analysis</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );

const renderNewsCard = (item) => {
    
    const openAIOverlay = (article) => {
      setSelectedNews(article);
      setAiOverlayVisible(true);
    };
    
    const handleShare = async () => {
      try {
        const shareContent = {
          message: `${item.headline}\n\n${item.summary}\n\nSentiment: ${item.sentiment} (${item.sentimentScore})\nSource: ${item.source}\n\nShared via Integra Markets`,
          title: item.headline,
        };
        
        const result = await Share.share(shareContent);
        
        if (result.action === Share.sharedAction) {
          // User shared successfully
          console.log('Shared successfully');
        } else if (result.action === Share.dismissedAction) {
          // User dismissed the share dialog
          console.log('Share dismissed');
        }
      } catch (error) {
        Alert.alert('Error', 'Unable to share this article');
        console.error('Share error:', error);
      }
    };
    
    return (
    <View key={item.id} style={styles.newsCard}>
      <View style={styles.cardHeader}>
        <View style={styles.sentimentContainer}>
          <MaterialIcons
            name={getSentimentIcon(item.sentiment)}
            size={16}
            color={getSentimentColor(item.sentiment)}
          />
          <Text style={[styles.sentimentLabel, { color: getSentimentColor(item.sentiment) }]}>
            {item.sentiment}
          </Text>
          <Text style={styles.sentimentScore}>{item.sentimentScore}</Text>
        </View>
        <View style={styles.cardHeaderRight}>
          <TouchableOpacity
            style={styles.aiButton}
            onPress={() => openAIOverlay(item)}
          >
            <MaterialCommunityIcons name="star-four-points" size={18} color="#30A5FF" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.moreButton}
            onPress={() => Alert.alert('More Options', 'Additional article options will be available in the next update')}
          >
            <MaterialIcons name="more-horiz" size={20} color="#A0A0A0" />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.newsHeadline}>{item.headline}</Text>
      <Text style={styles.newsSummary} numberOfLines={2}>{item.summary}</Text>
      <View style={styles.cardFooter}>
        <View style={styles.sourceInfo}>
          <Text style={styles.sourceText}>{item.source}</Text>
          <MaterialIcons name="link" size={12} color="#30A5FF" style={styles.linkIcon} />
        </View>
        <View style={styles.cardActions}>
          <Text style={styles.timeAgo}>{item.timeAgo}</Text>
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <MaterialIcons name="share" size={16} color="#A0A0A0" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
    );
  };

  const renderFilterButton = (filter) => {
    const isSelected = selectedFilter === filter;
    return (
      <TouchableOpacity
        key={filter}
        style={[
          styles.filterButton,
          isSelected && styles.filterButtonActive,
          isSelected && filter === 'Bullish' && { backgroundColor: '#4ECCA3' },
          isSelected && filter === 'Bearish' && { backgroundColor: '#F05454' },
          isSelected && filter === 'Neutral' && { backgroundColor: '#FFD700' },
        ]}
        onPress={() => setSelectedFilter(filter)}
      >
        <Text style={[
          styles.filterButtonText,
          isSelected && styles.filterButtonTextActive,
          isSelected && (filter === 'Bullish' || filter === 'Bearish') && { color: '#FFFFFF' },
          isSelected && filter === 'Neutral' && { color: '#121212' },
        ]}>
          {filter}
        </Text>
      </TouchableOpacity>
    );
  };

  const sampleNewsData = [
    {
      id: 1,
      headline: "US Natural Gas Storage Exceeds Expectations",
      summary: "Weekly natural gas storage report shows higher than expected inventory build, indicating potential...",
      source: "Bloomberg",
      timeAgo: "2 hours ago",
      sentiment: "NEUTRAL",
      sentimentScore: "0.50",
      category: "energy"
    },
    {
      id: 2,
      headline: "Drought Conditions Worsen in Key Corn Growing Regions",
      summary: "Extended drought in the US Midwest has raised concerns about corn yields for the upcoming har...",
      source: "Reuters",
      timeAgo: "3 hours ago",
      sentiment: "BEARISH",
      sentimentScore: "0.78",
      category: "agriculture"
    },
    {
      id: 3,
      headline: "Another Bearish Headline Example",
      summary: "More details would go here...",
      source: "Source",
      timeAgo: "4 hours ago",
      sentiment: "BEARISH",
      sentimentScore: "0.83",
      category: "general"
    },
    {
      id: 4,
      headline: "Gold Prices Rally on Fed Policy Uncertainty",
      summary: "Precious metals gain momentum as investors seek safe haven assets amid monetary policy shifts...",
      source: "MarketWatch",
      timeAgo: "1 hour ago",
      sentiment: "BULLISH",
      sentimentScore: "0.72",
      category: "metals"
    },
    {
      id: 5,
      headline: "Oil Demand Forecasts Remain Steady",
      summary: "International Energy Agency maintains stable outlook for global oil consumption through Q4...",
      source: "IEA",
      timeAgo: "30 minutes ago",
      sentiment: "NEUTRAL",
      sentimentScore: "0.45",
      category: "energy"
    }
  ];

  const renderLoadingScreen = () => (
    <View style={styles.loadingContainer}>
      <IntegraIcon 
        size={120} 
        animated={true} 
        variant="default"
        style={{ marginBottom: 20 }}
      />
      <ActivityIndicator size="large" color="#4ECCA3" />
      <Text style={styles.loadingText}>Loading latest news...</Text>
      <Text style={styles.loadingSubtext}>Powered by Integra AI</Text>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <IntegraIcon 
          size={32} 
          animated={agentActive} 
          variant="default"
          style={{ marginRight: 12 }}
        />
        <View>
          <Text style={styles.headerTitle}>The Wire</Text>
          {agentActive && (
            <View style={styles.agentStatus}>
              <View style={styles.agentIndicator} />
              <Text style={styles.agentStatusText}>AI Agent Active</Text>
            </View>
          )}
        </View>
      </View>
      <TouchableOpacity>
        <Ionicons name="notifications-outline" size={24} color="#ECECEC" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      
      <View style={styles.filtersContainer}>
        {filterOptions.map(renderFilterButton)}
      </View>
      
      {isLoading ? (
        renderLoadingScreen()
      ) : (
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#4ECCA3"
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {filteredNews.map(renderNewsCard)}
          <View style={styles.endMessage}>
            <IntegraIcon 
              size={48} 
              animated={false} 
              variant="default"
              style={{ marginBottom: 12, opacity: 0.5 }}
            />
            <Text style={styles.endMessageText}>You're all caught up!</Text>
            <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
              <MaterialIcons name="refresh" size={16} color="#30A5FF" />
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
      
      {renderSentimentModal()}
      <AIAnalysisOverlay 
        isVisible={aiOverlayVisible} 
        onClose={() => setAiOverlayVisible(false)}
        newsData={selectedNews}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ECECEC',
  },
  agentStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  agentIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ECCA3',
    marginRight: 6,
  },
  agentStatusText: {
    fontSize: 11,
    color: '#4ECCA3',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#333333',
  },
  filterButtonActive: {
    borderColor: 'transparent',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#A0A0A0',
    fontWeight: '500',
  },
  filterButtonTextActive: {
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    color: '#ECECEC',
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
  },
  loadingSubtext: {
    color: '#A0A0A0',
    marginTop: 8,
    fontSize: 12,
    fontStyle: 'italic',
  },
  scrollView: {
    flex: 1,
  },
  newsCard: {
    backgroundColor: '#1E1E1E',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333333',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sentimentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sentimentLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  sentimentScore: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ECECEC',
    marginLeft: 6,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiButton: {
    padding: 4,
    marginRight: 8,
  },
  moreButton: {
    padding: 4,
  },
  newsHeadline: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ECECEC',
    lineHeight: 22,
    marginBottom: 8,
  },
  newsSummary: {
    fontSize: 14,
    color: '#A0A0A0',
    lineHeight: 20,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sourceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sourceText: {
    fontSize: 12,
    color: '#30A5FF',
    fontWeight: '500',
  },
  linkIcon: {
    marginLeft: 4,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeAgo: {
    fontSize: 12,
    color: '#666666',
    marginRight: 12,
  },
  shareButton: {
    padding: 4,
  },
  endMessage: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  endMessageText: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 12,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
  },
  refreshButtonText: {
    fontSize: 14,
    color: '#30A5FF',
    marginLeft: 4,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ECECEC',
  },
  analysisContainer: {
    padding: 16,
  },
  articleHeadline: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ECECEC',
    marginBottom: 8,
  },
  articleSource: {
    fontSize: 14,
    color: '#30A5FF',
    marginBottom: 16,
  },
  analysisSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ECECEC',
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#30A5FF',
    paddingLeft: 8,
  },
  summarText: {
    fontSize: 14,
    color: '#A0A0A0',
    lineHeight: 20,
  },
  sentimentScores: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  scoreItem: {
    width: '48%',
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  scoreLabel: {
    fontSize: 12,
    color: '#A0A0A0',
    marginBottom: 4,
  },
  scoreValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  barContainer: {
    marginBottom: 12,
  },
  labelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  barLabel: {
    fontSize: 14,
    color: '#ECECEC',
  },
  barValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  barBackground: {
    height: 8,
    backgroundColor: '#2A2A2A',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  keywordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  keywordTag: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    margin: 4,
  },
  keywordText: {
    fontSize: 14,
    fontWeight: '500',
  },
  impactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  impactIndicator: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginRight: 12,
  },
  impactText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#121212',
  },
  confidenceText: {
    fontSize: 14,
    color: '#A0A0A0',
  },
  errorContainer: {
    padding: 24,
    alignItems: 'center',
  },
  errorText: {
    color: '#F05454',
    fontSize: 16,
  },
});

export default TodayDashboard;

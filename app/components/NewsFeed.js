import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import NewsCard from './NewsCard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/apiClient';
import useAlertPreferences from '../hooks/useAlertPreferences';
import { isBreakingNews, sortNewsWithBreaking } from '../utils/newsUtils';
import { getPreferredSourceUrl } from '../utils/polymarketLinks';
import BreakingNewsIndicator from './BreakingNewsIndicator';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Color palette
const colors = {
  bgPrimary: '#121212',
  bgSecondary: '#1E1E1E',
  textPrimary: '#ECECEC',
  textSecondary: '#A0A0A0',
  accentPositive: '#4ECCA3',
  accentNeutral: '#EAB308',
  divider: '#333333',
};

const NewsFeed = ({ 
  activeFilter = 'All',
  onArticlePress,
  refreshTrigger = 0, // External trigger to force refresh
}) => {
  // State management
  const [newsData, setNewsData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(null);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const [isNearTop, setIsNearTop] = useState(true);
  const [isNearBottom, setIsNearBottom] = useState(false);
  
  // Alert preferences
  const { preferences, shouldShowAlert } = useAlertPreferences();
  
  // Refs for optimization
  const flatListRef = useRef(null);
  const refreshInterval = useRef(null);
  const mounted = useRef(true);

  // Constants
  const PAGE_SIZE = 20;
  const REFRESH_INTERVAL = 60000; // 1 minute
  const CACHE_KEY = '@news_cache';
  const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

  // Initialize and load cached data
  useEffect(() => {
    mounted.current = true;
    loadCachedData();
    fetchNews(true);
    
    // Set up auto-refresh
    refreshInterval.current = setInterval(() => {
      if (mounted.current) {
        fetchNews(false, true); // Silent refresh
      }
    }, REFRESH_INTERVAL);

    return () => {
      mounted.current = false;
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    };
  }, []);

  // External refresh trigger
  useEffect(() => {
    if (refreshTrigger > 0) {
      handleRefresh();
    }
  }, [refreshTrigger]);

  // Filter data when filter changes
  useEffect(() => {
    filterNews();
  }, [activeFilter, newsData]);

  // Load cached data for instant display
  const loadCachedData = async () => {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        
        // Use cache if less than 5 minutes old
        if (age < CACHE_EXPIRY && data.length > 0) {
          setNewsData(data);
          setIsLoading(false);
        }
      }
    } catch (error) {
      console.log('Cache load error:', error);
    }
  };

  // Save data to cache
  const saveToCache = async (data) => {
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
        data,
        timestamp: Date.now(),
      }));
    } catch (error) {
      console.log('Cache save error:', error);
    }
  };

  // Fetch news from API
  const fetchNews = async (initial = false, silent = false) => {
    if (!mounted.current) return;
    
    if (initial && !silent) {
      setIsLoading(true);
    } else if (!silent) {
      setIsRefreshing(true);
    }
    
    setError(null);
    
    try {
      // Get user preferences
      const prefsString = await AsyncStorage.getItem('alert_preferences');
      const preferences = prefsString ? JSON.parse(prefsString) : {};
      
      // Fetch from API
      const response = await api.getNewsAnalysis(preferences);
      
      if (response && response.news) {
        const processedNews = processNews(response.news);
        
        if (mounted.current) {
          setNewsData(processedNews);
          setLastRefreshTime(new Date());
          setHasMore(processedNews.length >= PAGE_SIZE);
          
          // Cache the data
          if (processedNews.length > 0) {
            saveToCache(processedNews);
          }
        }
      }
    } catch (err) {
      console.error('Fetch error:', err);
      if (mounted.current) {
        setError('Unable to load news. Pull to retry.');
      }
    } finally {
      if (mounted.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  // Process news items
  const processNews = (rawNews) => {
    const now = new Date();
    const oneHourAgo = new Date(now - 60 * 60 * 1000);
    
    return rawNews
      .map((item, index) => {
        // Check if we should show this item based on preferences
        if (!shouldShowAlert(item)) {
          return null;
        }
        // Parse date with multiple fallbacks
        let articleDate = null;
        const dateFields = [
          item.published,
          item.published_at,
          item.time_published,
          item.date,
          item.publishedAt,
        ];
        
        for (const field of dateFields) {
          if (field) {
            const parsed = new Date(field);
            if (!isNaN(parsed.getTime())) {
              articleDate = parsed;
              break;
            }
          }
        }
        
        // Default to now if no valid date
        if (!articleDate) {
          articleDate = now;
        }
        
        // Process summary - clean HTML if present
        let summary = item.summary || item.description || item.content || '';
        
        // Remove HTML tags if present
        if (summary && summary.includes('<')) {
          summary = summary.replace(/<[^>]*>/g, '').trim();
        }
        
        // If summary is too short or invalid after cleaning, generate from title
        if (!summary || summary.length < 20) {
          // Extract key information from title for preview
          const title = item.title || item.headline || '';
          const source = item.source || 'Market';
          
          // Parse title to extract main action/event
          if (title.includes(' - ')) {
            // Title format: "Main headline - Source"
            const mainPart = title.split(' - ')[0];
            summary = `${mainPart}. Analysis pending from ${source} on market implications and price movements.`;
          } else if (title.length > 30) {
            // Use title as base for summary
            summary = `${title}. Full market analysis and impact assessment available.`;
          } else {
            summary = '';
          }
        }
        
        // Calculate age category for visual indicators
        const sixHoursAgo = new Date(now - 6 * 60 * 60 * 1000);
        const twelveHoursAgo = new Date(now - 12 * 60 * 60 * 1000);
        const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
        
        let ageCategory = 'older';
        const isBreaking = isBreakingNews(item);
        
        if (isBreaking) {
          ageCategory = 'breaking';
        } else if (articleDate >= sixHoursAgo) {
          ageCategory = 'fresh';
        } else if (articleDate >= twelveHoursAgo) {
          ageCategory = 'recent';
        } else if (articleDate >= oneDayAgo) {
          ageCategory = 'today';
        }
        
        return {
          id: item.id || `news-${Date.now()}-${index}`,
          title: item.title || item.headline || 'Untitled',
          summary: summary,
          content: item.content || summary,
          source: item.source || 'Unknown',
          sourceUrl: getPreferredSourceUrl(item) || '#',
          eventUrl: item.event_url || item.eventUrl || item.polymarket_url || item.polymarketUrl,
          eventSlug: item.event_slug || item.eventSlug || item.slug || item.polymarket_slug || item.polymarketSlug,
          polymarketContext: item.polymarket_context || item.polymarketContext,
          timeAgo: formatTimeAgo(articleDate),
          publishedAt: articleDate.toISOString(),
          sentiment: (item.sentiment || 'NEUTRAL').toUpperCase(),
          sentimentScore: item.sentiment_score?.toFixed(2) || '0.50',
          keyDrivers: item.key_drivers || item.keywords || [],
          marketImpact: item.market_impact || item.impact || 'MEDIUM',
          commodities: item.commodities || item.tickers || [],
          isBreaking: isBreaking,
          ageCategory: ageCategory,
          articleDate,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.articleDate - a.articleDate);
  };

  // Format relative time
  const formatTimeAgo = (date) => {
    const now = new Date();
    const diffMs = now - date;
    
    if (diffMs < 0) return 'just now';
    
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    // Format as date for older items
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  // Filter news based on sentiment
  const filterNews = () => {
    if (activeFilter === 'All') {
      setFilteredData(newsData);
    } else {
      const filtered = newsData.filter(
        item => item.sentiment === activeFilter.toUpperCase()
      );
      setFilteredData(filtered);
    }
  };

  // Handle pull to refresh
  const handleRefresh = useCallback(() => {
    setPage(1);
    fetchNews(true);
  }, []);

  // Handle load more (infinite scroll)
  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMore && filteredData.length >= PAGE_SIZE) {
      setIsLoadingMore(true);
      setPage(prev => prev + 1);
      // In a real app, you'd fetch more from API
      // For now, we'll just set hasMore to false
      setTimeout(() => {
        setIsLoadingMore(false);
        setHasMore(false);
      }, 1000);
    }
  }, [isLoadingMore, hasMore, filteredData.length]);

  // Handle scroll events to show/hide scroll buttons
  const handleScroll = useCallback((event) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const scrollY = contentOffset.y;
    const contentHeight = contentSize.height;
    const screenHeight = layoutMeasurement.height;
    
    // Show buttons after scrolling 200px from top
    const shouldShowButtons = scrollY > 200 && contentHeight > screenHeight * 1.5;
    setShowScrollButtons(shouldShowButtons);
    
    // Update position states
    setIsNearTop(scrollY < 100);
    setIsNearBottom(scrollY + screenHeight > contentHeight - 100);
  }, []);

  // Scroll to top
  const scrollToTop = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, []);

  // Render individual news item
  const renderItem = useCallback(({ item, index }) => (
    <NewsCard
      key={item.id}
      item={item}
      onAIClick={() => onArticlePress(item)}
      isBreaking={item.isBreaking}
      style={styles.newsCard}
    />
  ), [onArticlePress]);

  // Render footer (loading more indicator)
  const renderFooter = () => {
    if (!isLoadingMore) return null;
    
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.accentPositive} />
      </View>
    );
  };

  // Render empty state with modern minimal design
  const renderEmpty = () => {
    if (isLoading) return null;
    
    return (
      <View style={styles.emptyContainer}>
        {/* Minimal geometric icon */}
        <View style={styles.emptyIconContainer}>
          <View style={styles.emptyIconOuter}>
            <View style={styles.emptyIconInner} />
          </View>
        </View>
        
        <Text style={styles.emptyText}>
          {error || 'No stories yet'}
        </Text>
        <Text style={styles.emptySubtext}>
          Check back soon for updates
        </Text>
        
        {/* Minimal retry button */}
        <TouchableOpacity 
          style={styles.retryButton}
          onPress={handleRefresh}
          activeOpacity={0.7}
        >
          <View style={styles.retryIconContainer}>
            <MaterialIcons name="refresh" size={14} color={colors.accentPositive} />
          </View>
          <Text style={styles.retryText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Render list header
  const renderHeader = () => {
    if (filteredData.length === 0) return null;
    
    const breakingCount = filteredData.filter(item => item.isBreaking).length;
    
    if (breakingCount > 0) {
      return (
        <View style={styles.headerContainer}>
          <View style={styles.breakingBadge}>
            <MaterialIcons name="flash-on" size={16} color="#fff" />
            <Text style={styles.breakingText}>
              {breakingCount} Breaking
            </Text>
          </View>
        </View>
      );
    }
    
    return null;
  };

  // Key extractor for FlatList
  const keyExtractor = useCallback((item) => item.id, []);

  // Get item layout for optimization
  const getItemLayout = useCallback((data, index) => ({
    length: 150, // Approximate height of NewsCard
    offset: 150 * index,
    index,
  }), []);

  // Render skeleton loader
  const renderSkeletonItem = () => (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonHeader}>
        <View style={styles.skeletonSource} />
        <View style={styles.skeletonTime} />
      </View>
      <View style={styles.skeletonTitle} />
      <View style={styles.skeletonTitleSecond} />
      <View style={styles.skeletonSummary} />
      <View style={styles.skeletonFooter}>
        <View style={styles.skeletonSentiment} />
        <View style={styles.skeletonAction} />
      </View>
    </View>
  );
  
  // Main render
  if (isLoading && newsData.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        {/* Show 3 skeleton cards */}
        {[1, 2, 3].map(i => (
          <View key={i}>
            {renderSkeletonItem()}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={flatListRef}
        data={filteredData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accentPositive}
            title="Pull to refresh"
            titleColor={colors.textSecondary}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        getItemLayout={getItemLayout}
        removeClippedSubviews={Platform.OS === 'android'}
        maxToRenderPerBatch={10}
        windowSize={21}
        initialNumToRender={10}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={filteredData.length === 0 ? styles.emptyList : null}
      />
      
      {/* Floating scroll buttons */}
      {showScrollButtons && (
        <View style={styles.scrollButtonsContainer}>
          {!isNearTop && (
            <TouchableOpacity
              style={[styles.scrollButton, styles.scrollToTopButton]}
              onPress={scrollToTop}
              activeOpacity={0.7}
            >
              <MaterialIcons name="keyboard-arrow-up" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
          
          {!isNearBottom && filteredData.length > 5 && (
            <TouchableOpacity
              style={[styles.scrollButton, styles.scrollToBottomButton]}
              onPress={scrollToBottom}
              activeOpacity={0.7}
            >
              <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    paddingTop: 20,
  },
  skeletonCard: {
    backgroundColor: colors.bgSecondary,
    marginHorizontal: 20,
    marginVertical: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  skeletonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  skeletonSource: {
    width: 80,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.divider,
    opacity: 0.3,
  },
  skeletonTime: {
    width: 60,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.divider,
    opacity: 0.3,
  },
  skeletonTitle: {
    width: '90%',
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.divider,
    opacity: 0.4,
    marginBottom: 8,
  },
  skeletonTitleSecond: {
    width: '70%',
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.divider,
    opacity: 0.4,
    marginBottom: 12,
  },
  skeletonSummary: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.divider,
    opacity: 0.3,
    marginBottom: 16,
  },
  skeletonFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  skeletonSentiment: {
    width: 60,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.divider,
    opacity: 0.3,
  },
  skeletonAction: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.divider,
    opacity: 0.3,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: colors.bgSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  emptyIconOuter: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIconInner: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: colors.textSecondary,
    opacity: 0.6,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtext: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 6,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.divider,
  },
  retryIconContainer: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(78, 204, 163, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  retryText: {
    color: colors.accentPositive,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  breakingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F05454',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  breakingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  newsCard: {
    marginHorizontal: 20,
    marginVertical: 8,
  },
  scrollButtonsContainer: {
    position: 'absolute',
    right: 16,
    bottom: 20,
    flexDirection: 'column',
    alignItems: 'center',
  },
  scrollButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.divider,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  scrollToTopButton: {
    marginBottom: 8,
  },
  scrollToBottomButton: {
    // No additional styles needed
  },
});

export default NewsFeed;

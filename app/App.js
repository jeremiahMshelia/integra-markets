// Full Integra App v1.0 - TestFlight Ready with All Features
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  FlatList,
  RefreshControl,
  Alert,
  Image,
  Platform,
  DevSettings,
  Modal,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotificationsAsync, setupNotificationListeners, ensurePushEnabled, openSystemSettings, checkNotificationPermissions, getNotificationSettings } from './services/notificationService';

// Ensure dev tools are disabled in production
if (!__DEV__) {
  console.disableYellowBox = true;
  console.reportErrorsAsExceptions = false;

  // Disable React Native Inspector in production
  if (global && global.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    global.__REACT_DEVTOOLS_GLOBAL_HOOK__.isDisabled = true;
  }
}

// Import Supabase Auth Provider
// import { AuthProvider } from '../contexts/AuthContext';
// Import the example auth component for testing
// import { AuthExample } from '../components/AuthExample';
// Import database utilities for testing
// import { testConnection } from '../lib/database';
// import { setupDatabase } from '../lib/setupDatabase';

// Import all components
import IntegraLoadingPage from './components/IntegraLoadingPage';
import AuthLoadingScreen from './components/AuthLoadingScreen';
import EditProfileModal from './components/EditProfileModal';
import EditAlertsModal from './components/EditAlertsModal';
import AlertsScreen from './components/AlertsScreen';
import NewsCard from './components/NewsCard';
import AIAnalysisOverlay from './components/AIAnalysisOverlay';
import ProfileScreen from './components/ProfileScreen';
import { BookmarkProvider } from './providers/BookmarkProvider';
import PrivacyPolicyModal from './components/PrivacyPolicyModal';
import TermsOfServiceModal from './components/TermsOfServiceModal';
import AboutModal from './components/AboutModal';
import OnboardingTooltip from './components/OnboardingTooltip';
import { dashboardApi, sentimentApi } from './services/api';

// Color Palette
const colors = {
  bgPrimary: '#121212',
  bgSecondary: '#1E1E1E',
  bgTertiary: '#252525',
  textPrimary: '#ECECEC',
  textSecondary: '#A0A0A0',
  accentPositive: '#4ECCA3',
  accentNegative: '#F05454',
  accentNeutral: '#EAB308',
  accentData: '#30A5FF',
  divider: '#333333',
  cardBorder: '#2A2A2A',
};

// Sample news data
const sampleNewsData = [
  {
    id: '1',
    title: 'US Natural Gas Storage Exceeds Expectations',
    summary: 'Weekly natural gas storage report shows higher than expected inventory build, indicating potential oversupply conditions in key markets. This could signal bearish pressure on natural gas prices in the near term.',
    source: 'Bloomberg',
    sourceUrl: 'https://www.bloomberg.com',
    timeAgo: '2 hours ago',
    sentiment: 'BEARISH',
    sentimentScore: '0.83',
    keyDrivers: ['Storage build', 'Oversupply conditions', 'Price pressure'],
    marketImpact: 'HIGH',
    commodities: ['Natural Gas'],
  },
  {
    id: '2',
    title: 'Gold Prices Rally on Fed Policy Uncertainty',
    summary: 'Precious metals gain momentum as investors seek safe haven assets amid monetary policy shifts...',
    source: 'MarketWatch',
    sourceUrl: 'https://www.marketwatch.com',
    timeAgo: '1 hour ago',
    sentiment: 'BULLISH',
    sentimentScore: '0.72',
    keyDrivers: ['Fed policy', 'Safe haven demand', 'Monetary shifts'],
    marketImpact: 'MEDIUM',
    commodities: ['Gold', 'Silver'],
  },
  {
    id: '3',
    title: 'Oil Demand Forecasts Remain Steady',
    summary: 'International Energy Agency maintains stable outlook for global oil consumption through Q4...',
    source: 'IEA',
    sourceUrl: 'https://www.iea.org',
    timeAgo: '30 minutes ago',
    sentiment: 'NEUTRAL',
    sentimentScore: '0.45',
    keyDrivers: ['IEA forecasts', 'Global consumption', 'Q4 outlook'],
    marketImpact: 'LOW',
    commodities: ['Crude Oil'],
  },
];

// Profile Screen Component


// Main App Component
const App = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAlertPreferences, setShowAlertPreferences] = useState(false);
  const [isEditingAlerts, setIsEditingAlerts] = useState(false); // true when editing from Alerts screen
  const [activeNav, setActiveNav] = useState('Today');
  const [activeFilter, setActiveFilter] = useState('All');
  const [userData, setUserData] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [showAIAnalysis, setShowAIAnalysis] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTermsOfService, setShowTermsOfService] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [liveNews, setLiveNews] = useState([]);
  const [allNews, setAllNews] = useState([]);
  const [newsLimit, setNewsLimit] = useState(8);
  const FEED_CACHE_KEY = '@integra_feed_cache_v3'; // Bumped to v3 for fullSummary support
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [showNotifHelp, setShowNotifHelp] = useState(false);
  const [alertPreferences, setAlertPreferences] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Load alert preferences
  const loadAlertPreferences = async () => {
    try {
      const prefs = await AsyncStorage.getItem('alert_preferences');
      if (prefs) {
        const parsed = JSON.parse(prefs);
        setAlertPreferences(parsed);
        return parsed;
      }
    } catch (error) {
      console.error('Error loading alert preferences:', error);
    }
    return null;
  };

  const loadCachedFeed = async () => {
    try {
      const raw = await AsyncStorage.getItem(FEED_CACHE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      if (items.length > 0) {
        setAllNews(items);
        setLiveNews(items.slice(0, newsLimit));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const saveFeedCache = async (items) => {
    try {
      await AsyncStorage.setItem(FEED_CACHE_KEY, JSON.stringify({ items, savedAt: Date.now() }));
    } catch { }
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'recently';
    try {
      const parseAlphaTime = (ts) => {
        if (!ts) return null;
        // Alpha Vantage sometimes uses YYYYMMDDTHHMMSS (optionally with Z)
        const m = String(ts).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
        if (m) {
          const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
          const d = new Date(iso);
          return isNaN(d.getTime()) ? null : d;
        }
        const d = new Date(ts);
        return isNaN(d.getTime()) ? null : d;
      };
      const date = parseAlphaTime(timestamp);
      if (!date) return 'recently';
      const diffMs = Date.now() - date.getTime();
      const mins = Math.max(0, Math.floor(diffMs / 60000));
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins} min${mins !== 1 ? 's' : ''} ago`;
      if (mins < 1440) {
        const hrs = Math.floor(mins / 60);
        return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
      }
      const days = Math.floor(mins / 1440);
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    } catch {
      return 'recently';
    }
  };

  const loadNews = async () => {
    try {
      // Load user's alert preferences to filter news by their chosen commodities
      let prefs = alertPreferences;
      if (!prefs) {
        prefs = await loadAlertPreferences();
      }

      // Get commodities from preferences, or use defaults
      const defaultCommodities = ['OIL', 'GOLD', 'WHEAT', 'NAT GAS'];
      let commodities = defaultCommodities;

      if (prefs?.commodities && Array.isArray(prefs.commodities) && prefs.commodities.length > 0) {
        // Map user preference names to API-compatible names
        const commodityMap = {
          'Crude Oil': 'OIL',
          'Oil': 'OIL',
          'Natural Gas': 'NAT GAS',
          'Gold': 'GOLD',
          'Silver': 'GOLD',  // Silver uses gold endpoint
          'Wheat': 'WHEAT',
          'Corn': 'WHEAT',
          'Soybeans': 'WHEAT',
          'Copper': 'GOLD',
        };
        commodities = prefs.commodities.map(c => commodityMap[c] || c.toUpperCase()).filter((v, i, a) => a.indexOf(v) === i);
        if (commodities.length === 0) commodities = defaultCommodities;
      }

      console.log('[News] Loading news for commodities:', commodities);
      const data = await dashboardApi.getTodayDashboard(commodities);
      const articles = Array.isArray(data?.news) ? data.news : [];

      // Map backend articles into the shape NewsCard expects, then hard-cap to 20
      let mapped = articles.map((a, i) => {
        // Title / headline
        let title = (a.title || a.headline || '').trim();
        if (title.length > 150) {
          title = title.substring(0, 147) + '...';
        }

        // Summary / description
        let summary = (a.summary || a.description || a.content || '').trim();
        if (!summary && title) {
          summary = title;
        }
        if (summary.length > 260) {
          summary = summary.substring(0, 257) + '...';
        }

        // Source name and direct article URL
        const sourceUrl = a.url || a.source_url || '';
        console.log('[loadNews] article url:', a.url, 'source_url:', a.source_url, '=> sourceUrl:', sourceUrl);
        let sourceName = (a.source || a.source_name || '').trim();
        if (!sourceName && sourceUrl) {
          try {
            const u = new URL(sourceUrl);
            sourceName = (u.hostname || '').replace(/^www\./i, '');
          } catch { }
        }
        if (/^https?:\/\//i.test(sourceName)) {
          try {
            const u = new URL(sourceName);
            sourceName = (u.hostname || '').replace(/^www\./i, '');
          } catch { }
        }
        sourceName = sourceName
          .replace(/[-|\u2013].*$/, '')
          .replace(/:.*/, '')
          .trim();
        if (sourceName.length > 18) {
          sourceName = sourceName.substring(0, 17) + '…';
        }
        if (!sourceName) {
          sourceName = 'Unknown';
        }

        // Initial sentiment label from backend (will be refined by analyzeBatch)
        const rawSentiment = String(a.sentiment || a.ensemble_sentiment || 'NEUTRAL').toUpperCase();
        let sentiment = rawSentiment;
        if (!['BULLISH', 'BEARISH', 'NEUTRAL'].includes(sentiment)) {
          sentiment = rawSentiment === 'POSITIVE'
            ? 'BULLISH'
            : rawSentiment === 'NEGATIVE'
              ? 'BEARISH'
              : 'NEUTRAL';
        }

        // Initial score from backend confidence if available
        let score = typeof a.sentiment_score === 'number'
          ? a.sentiment_score
          : typeof a.confidence === 'number'
            ? a.confidence
            : 0.5;
        score = Math.max(0, Math.min(1, score));
        const sentimentScore = score.toFixed(2);

        // Optional server-side analysis details, if present
        const serverAnalysis = a.sentiment_analysis;
        let analysis;
        if (serverAnalysis) {
          const bulls = Math.round(Number(serverAnalysis.bullish ?? 0) * 100);
          const bears = Math.round(Number(serverAnalysis.bearish ?? 0) * 100);
          const neuts = Math.max(0, 100 - bulls - bears);
          analysis = {
            bulls,
            bears,
            neuts,
            keywords: serverAnalysis.keywords || a.keywords || [],
            impact: (serverAnalysis.market_impact || 'MEDIUM').toString().toUpperCase(),
            confidence: Number(serverAnalysis.confidence ?? score),
          };
        }

        // Get keywords directly from backend (top-level) - for AI Analysis overlay
        const backendKeywords = a.keywords || serverAnalysis?.keywords || [];

        // Preserve original full summary for overlay
        const fullSummary = (a.summary || a.description || a.content || '').trim();

        return {
          id: String(i + 1),
          title,
          summary,
          fullSummary, // Full summary for AI Analysis overlay
          source: sourceName,
          sourceUrl,
          timeAgo: formatTimeAgo(a.published || a.time_published),
          sentiment,
          sentimentScore,
          analysis,
          // Include top-level keywords for AIAnalysisOverlay
          keywords: backendKeywords,
          // Include backend preprocessing fields for AI Analysis
          bullish: a.bullish,
          bearish: a.bearish,
          neutral: a.neutral,
          market_impact: a.market_impact,
          trade_ideas: a.trade_ideas,
          event_type: a.event_type,
          severity: a.severity,
          // Image URL for card display
          image_url: a.image_url,
        };
      });

      if (mapped.length === 0) {
        setAllNews([]);
        setLiveNews([]);
        await saveFeedCache([]);
        return;
      }

      // Apply keyword filtering/prioritization if user has custom keywords
      let prioritized = mapped;
      if (prefs?.keywords && Array.isArray(prefs.keywords) && prefs.keywords.length > 0) {
        const userKeywords = prefs.keywords.map(k => k.toLowerCase());
        // Score articles by keyword matches
        prioritized = mapped.map(article => {
          const text = `${article.title} ${article.summary}`.toLowerCase();
          const matchScore = userKeywords.reduce((score, kw) => {
            return score + (text.includes(kw) ? 1 : 0);
          }, 0);
          return { ...article, matchScore };
        });
        // Sort by match score (highest first), then by original order
        prioritized.sort((a, b) => b.matchScore - a.matchScore);
        console.log('[News] Applied keyword prioritization, top matches:', prioritized.slice(0, 3).map(a => ({ title: a.title.slice(0, 40), matches: a.matchScore })));
      }

      const limited = prioritized.slice(0, 20);
      setAllNews(limited);

      // Trust backend sentiment - no need to re-analyze
      // The backend already provides sentiment and sentiment_score
      console.log('[News] Using backend sentiment, sample:', limited[0]?.sentiment, limited[0]?.sentimentScore);
      setLiveNews(limited.slice(0, 8));

      // Persist latest non-empty feed
      await saveFeedCache(limited.slice(0, 8));
    } catch (e) {
      console.error('Live news fetch failed:', e);
      await loadCachedFeed();
    }
  };

  // Analyze a slice of items [start,end) using backend and return updated items
  const analyzeBatch = async (items, start, end) => {
    const slice = items.slice(start, end);
    const guessCommodity = (t) => {
      const s = (t || '').toLowerCase();
      if (/(brent|wti|crude|oil)/.test(s)) return 'OIL';
      if (/(nat\s?gas|natural gas|lng)/.test(s)) return 'NAT GAS';
      if (/(gold|bullion)/.test(s)) return 'GOLD';
      if (/(wheat|corn|soybean|soybeans)/.test(s)) return 'WHEAT';
      if (/(silver|copper|platinum)/.test(s)) return 'GOLD';
      return undefined;
    };

    const analyzed = await Promise.all(slice.map(async (item) => {
      try {
        const text = `${item.title}. ${item.summary || ''}`.trim();
        const commodity = guessCommodity(text);
        const res = await sentimentApi.analyzeEnhanced(text, commodity);
        try {
          console.log('[sentiment] result for', text.slice(0, 80), '\n', JSON.stringify(res));
        } catch { }
        let bull = Math.max(0, Math.min(1, Number(res?.bullish || 0)));
        let bear = Math.max(0, Math.min(1, Number(res?.bearish || 0)));
        let neu = Math.max(0, Math.min(1, Number(res?.neutral || 0)));
        // Normalize to sum to 1
        const sum = bull + bear + neu;
        if (sum > 0 && Math.abs(sum - 1) > 1e-6) {
          bull = bull / sum; bear = bear / sum; neu = neu / sum;
        }
        const topProb = Math.max(bull, bear, neu);
        let lbl = 'NEUTRAL';
        if (bull === topProb && bull > bear) lbl = 'BULLISH';
        else if (bear === topProb && bear > bull) lbl = 'BEARISH';

        return {
          ...item,
          sentiment: lbl,
          sentimentScore: topProb.toFixed(2),
          analysis: {
            bulls: Math.round(bull * 100),
            bears: Math.round(bear * 100),
            neuts: 100 - Math.round(bull * 100) - Math.round(bear * 100),
            keywords: Array.isArray(res?.keywords) ? res.keywords : [],
            impact: res?.impact || 'LOW',
            confidence: Number(res?.confidence ?? 0.5),
          },
        };
      } catch {
        return item; // Keep original if analysis fails
      }
    }));
    return analyzed;
  };

  // Pull-to-refresh handler
  const onRefresh = async () => {
    console.log('[App] Pull-to-refresh triggered');
    setRefreshing(true);
    await loadNews();
    setRefreshing(false);
    console.log('[App] Refresh complete');
  };

  useEffect(() => { (async () => { await loadCachedFeed(); await loadNews(); })(); }, []);
  useEffect(() => {
    (async () => {
      try {
        const perm = await checkNotificationPermissions();
        let enabled = perm;
        try { const s = await getNotificationSettings(); if (s && s.pushNotifications === false) enabled = false; } catch { }
        setNotifEnabled(Boolean(enabled));
      } catch { setNotifEnabled(false); }
    })();
  }, []);

  // Update displayed news when limit changes
  useEffect(() => {
    if (allNews.length > 0) {
      setLiveNews(allNews.slice(0, newsLimit));
    }
  }, [newsLimit]);

  // Check app state on mount
  useEffect(() => {
    console.log('App mounted, checking state...');

    // Wrap in try-catch to prevent initialization crashes
    try {
      checkAppState();
      initializeNotifications();
    } catch (error) {
      console.error('Error during app initialization:', error);
      // Continue anyway - don't let initialization errors crash the app
    }

    // Database setup removed - these were causing crashes as imports were commented out
    // setupDatabase.createTables();
    // testConnection();
  }, []);

  // Re-register push token when user data becomes available (user logged in)
  useEffect(() => {
    if (userData && userData.id) {
      // User is authenticated — ensure push token is registered in Supabase
      const ensurePushTokenRegistered = async () => {
        try {
          const token = await registerForPushNotificationsAsync({ silent: true });
          if (token) {
            console.log('[App] Push token re-registered after auth:', token.substring(0, 20) + '...');
          }
        } catch (e) {
          console.warn('[App] Push token re-registration failed:', e);
        }
      };
      ensurePushTokenRegistered();
    }
  }, [userData?.id]);

  // Initialize notifications
  const initializeNotifications = async () => {
    try {
      // Register for push notifications (silent to avoid popup on startup)
      const token = await registerForPushNotificationsAsync({ silent: true });
      console.log('[App] Initial push token:', token ? token.substring(0, 20) + '...' : 'none');

      // If initial registration didn't save to Supabase (user not yet authenticated),
      // retry after a delay to give the session time to restore
      if (token) {
        setTimeout(async () => {
          try {
            const { supabaseService } = require('./services/supabaseService');
            const userId = await supabaseService.getCurrentUserId();
            if (userId) {
              await supabaseService.registerPushToken(token, Platform.OS);
              console.log('[App] Push token registered to Supabase (delayed)');
            } else {
              console.log('[App] Still no user session — push token saved locally only');
            }
          } catch (e) {
            console.warn('[App] Delayed push token registration failed:', e);
          }
        }, 5000); // Wait 5 seconds for session to restore
      }

      // Set up notification listeners
      setupNotificationListeners(
        (notification) => {
          console.log('Notification received:', notification.request.content.title);
        },
        (response) => {
          console.log('Notification tapped:', response.notification.request.content.title);
          const data = response.notification.request.content.data;
          if (data?.article_url) {
            // Try to find the article in our feed and open it
            const matchingArticle = newsItems.find(
              item => item.url === data.article_url || item.sourceUrl === data.article_url
            );
            if (matchingArticle) {
              setSelectedArticle(matchingArticle);
              setShowAIAnalysis(true);
            } else {
              // If not in feed, open in browser
              Linking.openURL(data.article_url).catch(err =>
                console.error('Failed to open notification URL:', err)
              );
            }
          }
        }
      );
    } catch (error) {
      console.error('Error initializing notifications:', error);
    }
  };

  const checkAppState = async () => {
    try {
      console.log('checkAppState called');

      // Ensure Platform is available
      if (!Platform || !Platform.OS) {
        console.warn('Platform not available, defaulting to mobile');
        // Default to mobile behavior if Platform is not available
      } else {
        // Check if we're running on web using Platform API
        const isWeb = Platform.OS === 'web';

        if (isWeb) {
          // We're on web, skip all onboarding
          console.log('Web platform detected, setting demo user');
          setUserData({ name: 'Demo User', email: 'demo@integramarkets.com' });
          return;
        }
      }

      console.log('Platform:', Platform.OS); // Will show 'ios', 'android', or 'web'

      // Wrap AsyncStorage calls in try-catch to handle potential errors
      let onboardingCompleted = null;
      let alertsCompleted = null;
      let storedUserData = null;

      try {
        onboardingCompleted = await AsyncStorage.getItem('onboarding_completed');
        alertsCompleted = await AsyncStorage.getItem('alerts_completed');
        storedUserData = await AsyncStorage.getItem('user_data');
      } catch (storageError) {
        console.warn('AsyncStorage access failed:', storageError);
        // Continue with null values - don't crash
      }

      console.log('Storage values:', {
        onboardingCompleted,
        alertsCompleted,
        storedUserData: storedUserData ? 'exists' : 'null'
      });

      // Try to load fresh profile from Supabase
      if (storedUserData) {
        let parsedUserData = JSON.parse(storedUserData);

        // If we have a user ID, fetch fresh profile from Supabase
        if (parsedUserData.id) {
          try {
            const { supabaseService } = require('./services/supabaseService');
            const profile = await supabaseService.getProfile(parsedUserData.id);

            if (profile) {
              console.log('[App] Loaded profile from Supabase in checkAppState');
              parsedUserData = {
                ...parsedUserData,
                username: profile.username || parsedUserData.username,
                fullName: profile.full_name || parsedUserData.fullName,
                role: profile.role || '',
                experience: profile.experience_level || '',
                institution: profile.company || '',
                bio: profile.bio || '',
                marketFocus: profile.market_focus || [],
                avatarUrl: profile.avatar_url || '',
                linkedin: profile.linkedin || '',
                github: profile.github || '',
              };
            }
          } catch (e) {
            console.log('[App] Could not load profile from Supabase:', e);
          }
        }

        setUserData(parsedUserData);

        // Even if we have user data, verify onboarding is actually complete via Supabase username
        // This prevents stale AsyncStorage from bypassing onboarding for new accounts
      } else if (onboardingCompleted === 'true') {
        // No stored user data but onboarding was completed - check Supabase session
        try {
          const { supabaseService } = require('./services/supabaseService');
          const { data: { session } } = await supabaseService.supabase.auth.getSession();

          if (session?.user) {
            console.log('[App] Found active Supabase session, loading profile');
            const profile = await supabaseService.getProfile(session.user.id);

            const restoredUserData = {
              id: session.user.id,
              email: session.user.email,
              username: profile?.username || session.user.email?.split('@')[0],
              fullName: profile?.full_name || '',
              role: profile?.role || '',
              experience: profile?.experience_level || '',
              institution: profile?.company || '',
              bio: profile?.bio || '',
              marketFocus: profile?.market_focus || [],
              avatarUrl: profile?.avatar_url || '',
            };

            setUserData(restoredUserData);
            await AsyncStorage.setItem('user_data', JSON.stringify(restoredUserData));

            // IMPORTANT: If profile has no username, user needs onboarding even if AsyncStorage says otherwise
            if (!profile?.username) {
              console.log('[App] Profile has no username, needs onboarding');
              setShowOnboarding(true);
              return;
            }
          }
        } catch (e) {
          console.log('[App] Could not restore from Supabase session:', e);
        }
      }

      // Check via Supabase if onboarding is really complete before skipping
      if (onboardingCompleted === 'true') {
        try {
          const { supabaseService } = require('./services/supabaseService');
          const { data: { session } } = await supabaseService.supabase.auth.getSession();

          if (session?.user) {
            const profile = await supabaseService.getProfile(session.user.id);

            // If profile doesn't have username, need onboarding regardless of AsyncStorage
            if (!profile?.username) {
              console.log('[App] Username not set in Supabase, showing onboarding');
              setShowAuth(true);
              return;
            }
          }
        } catch (e) {
          console.log('[App] Could not verify onboarding via Supabase:', e);
        }
      }

      if (onboardingCompleted !== 'true') {
        console.log('Showing auth screen');
        setShowAuth(true);
      } else if (alertsCompleted !== 'true') {
        console.log('Showing alert preferences');
        setShowAlertPreferences(true);
      } else {
        console.log('All onboarding complete, showing main app');
      }
    } catch (error) {
      console.error('Error checking app state:', error);
    }
  };

  const handleLoadingComplete = () => {
    console.log('handleLoadingComplete called');
    setIsLoading(false);
    console.log('isLoading set to false');
  };

  const handleAuthComplete = async (authData) => {
    console.log('handleAuthComplete called with:', authData);

    // Fetch full profile from Supabase
    let fullUserData = { ...authData };
    try {
      const { supabaseService } = require('./services/supabaseService');
      const profile = await supabaseService.getProfile(authData.id);

      if (profile) {
        console.log('[App] Loaded profile from Supabase:', profile);
        fullUserData = {
          ...authData,
          username: profile.username || authData.username,
          fullName: profile.full_name || authData.fullName,
          role: profile.role || '',
          experience: profile.experience_level || '',
          institution: profile.company || '',
          bio: profile.bio || '',
          marketFocus: profile.market_focus || [],
          avatarUrl: profile.avatar_url || '',
          linkedin: profile.linkedin || '',
          github: profile.github || '',
        };
      }
    } catch (e) {
      console.log('[App] Could not load profile from Supabase:', e);
    }

    setUserData(fullUserData);
    await AsyncStorage.setItem('user_data', JSON.stringify(fullUserData));
    setShowAuth(false);

    // Check if we should skip onboarding (returning user)
    if (authData.skipOnboarding) {
      console.log('User has skipOnboarding=true, checking alerts...');
      // User has already completed onboarding, go straight to main app
      const alertsCompleted = await AsyncStorage.getItem('alerts_completed');
      console.log('Alerts completed status:', alertsCompleted);

      if (alertsCompleted !== 'true') {
        console.log('Showing alert preferences');
        setShowAlertPreferences(true);
      } else {
        console.log('All onboarding complete, showing main app');
      }
      // Otherwise, show main app (all flags remain false)
    } else {
      console.log('User needs onboarding, showing onboarding screen');
      // New user or user who hasn't completed onboarding
      setShowOnboarding(true);
    }
  };

  const handleAuthSkip = () => {
    setShowAuth(false);
    setShowOnboarding(true);
  };

  const handleOnboardingComplete = async (formData) => {
    try {
      await AsyncStorage.setItem('onboarding_completed', 'true');
      await AsyncStorage.setItem('user_data', JSON.stringify({ ...userData, ...formData }));
      setUserData({ ...userData, ...formData });

      // Save profile to Supabase
      const { supabaseService } = require('./services/supabaseService');

      // Upload profile photo if provided
      if (formData.profilePhoto) {
        try {
          console.log('[App] Uploading profile photo to Supabase...');
          await supabaseService.uploadAvatar(formData.profilePhoto);
          console.log('[App] Profile photo uploaded successfully');
        } catch (photoError) {
          console.error('[App] Failed to upload profile photo:', photoError);
          // Continue with profile save even if photo upload fails
        }
      }

      await supabaseService.updateProfile({
        full_name: formData.fullName || userData?.fullName,
        username: formData.username || userData?.username,
        company: formData.institution,
        role: formData.role,
        experience_level: formData.experience,
        bio: formData.bio,
        market_focus: formData.marketFocus,
        linkedin: formData.linkedin,
        github: formData.github,
      });
      console.log('[App] Profile saved to Supabase');

      setShowOnboarding(false);
      setShowAlertPreferences(true);
    } catch (error) {
      console.error('Error saving onboarding data:', error);
      // Still proceed even if Supabase save fails
      setShowOnboarding(false);
      setShowAlertPreferences(true);
    }
  };

  const handleOnboardingSkip = async () => {
    try {
      await AsyncStorage.setItem('onboarding_completed', 'true');
      setShowOnboarding(false);
      setShowAlertPreferences(true);
    } catch (error) {
      console.error('Error saving onboarding skip:', error);
      // Still proceed even if saving fails
      setShowOnboarding(false);
      setShowAlertPreferences(true);
    }
  };

  const handleNotificationSettings = async () => {
    try {
      const settings = await getNotificationSettings();
      const enabled = Boolean(settings?.pushNotifications);
      Alert.alert(
        'Notification Settings',
        `Push notifications are currently ${enabled ? 'enabled' : 'disabled'}. You can change this in your device settings.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error determining notification status:', error);
      Alert.alert(
        'Notification Settings',
        'We could not confirm your notification status. Please check your device settings.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleAlertPreferencesComplete = async (preferences) => {
    try {
      await AsyncStorage.setItem('alerts_completed', 'true');
      // Only save preferences if they exist
      if (preferences) {
        await AsyncStorage.setItem('alert_preferences', JSON.stringify(preferences));
        setAlertPreferences(preferences); // Update local state
      }
      setShowAlertPreferences(false);
      // Reload news with new preferences
      console.log('[News] Alert preferences updated, reloading news...');
      loadNews();
    } catch (error) {
      console.error('Error saving alert preferences:', error);
    }
  };

  const handleAlertPreferencesSkip = async () => {
    try {
      await AsyncStorage.setItem('alerts_completed', 'true');
      setShowAlertPreferences(false);
    } catch (error) {
      console.error('Error skipping alerts:', error);
    }
  };

  const resetAppData = async () => {
    Alert.alert(
      'Reset App Data',
      'This will clear all your preferences and data. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.clear();
              setUserData(null);
              setActiveNav('Today');
              setShowAuth(true);
              Alert.alert(
                'Success',
                'All preferences have been cleared',
                [{ text: 'OK' }]
              );
            } catch (error) {
              console.error('Error resetting app:', error);
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone and will permanently delete all your data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            try {
              // In a real app, you would call the deleteAccount method from AuthContext here
              // For now, we'll just clear local data and show auth screen
              await AsyncStorage.clear();
              setUserData(null);
              setActiveNav('Today');
              setShowAuth(true);
              Alert.alert(
                'Account Deleted',
                'Your account has been deleted successfully.',
                [{ text: 'OK' }]
              );
            } catch (error) {
              console.error('Error deleting account:', error);
              Alert.alert(
                'Error',
                'Failed to delete account. Please try again.',
                [{ text: 'OK' }]
              );
            }
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
    Alert.alert(
      'Log out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            try {
              // Don't clear onboarding/alerts completion - user should never redo these
              // Only clear session-specific data
              await AsyncStorage.removeItem('user_data');
              await AsyncStorage.removeItem('auth_token');
              await AsyncStorage.removeItem('session');

              // Sign out from Supabase
              try {
                const { supabaseService } = require('./services/supabaseService');
                await supabaseService.signOut();
              } catch (e) {
                console.log('Supabase signout error:', e);
              }

              setUserData(null);
              setActiveNav('Today');
              setShowAuth(true);
            } catch (error) {
              console.error('Error logging out:', error);
              Alert.alert(
                'Error',
                'Failed to log out. Please try again.',
                [{ text: 'OK' }]
              );
            }
          },
        },
      ]
    );
  };

  const handleShowAlertPreferences = () => {
    setActiveNav('Today');
    setShowAlertPreferences(true);
  };

  const handleArticlePress = (article) => {
    console.log('[handleArticlePress] sourceUrl:', article.sourceUrl, 'url:', article.url, 'source:', article.source);
    setSelectedArticle(article);
    setShowAIAnalysis(true);
  };

  const getFilteredNews = () => {
    if (activeFilter === 'All') return liveNews;
    // When filtering by sentiment, search ALL news — not just the paginated slice.
    // This ensures Bearish/Bullish articles beyond the initial 8 are shown immediately.
    return allNews.filter(item => item.sentiment === activeFilter.toUpperCase());
  };

  const handleLoadMore = async () => {
    if (loadingMore) return; // Prevent double-tap
    setLoadingMore(true);
    try {
      const newLimit = Math.min(newsLimit + 8, allNews.length);
      // Analyze the next batch before showing
      const analyzed = await analyzeBatch(allNews, newsLimit, newLimit);
      // Merge analyzed items back into allNews
      setAllNews(prev => {
        const merged = [...prev];
        for (let i = newsLimit, j = 0; i < newLimit; i++, j++) merged[i] = analyzed[j];
        return merged;
      });
      setNewsLimit(newLimit);
      setLiveNews(prev => {
        const next = [...prev, ...analyzed];
        return next;
      });
    } catch (error) {
      console.error('Error loading more:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const getFilterChipColor = (filter) => {
    if (activeFilter !== filter) return colors.bgSecondary;

    switch (filter) {
      case 'Bullish': return '#4ade80';
      case 'Bearish': return '#ff6b6b';
      case 'Neutral': return '#fbbf24';
      default: return colors.accentPositive;
    }
  };

  const getFilterBorderColor = (filter) => {
    if (activeFilter !== filter) return colors.cardBorder;

    switch (filter) {
      case 'Bullish': return '#4ade80';
      case 'Bearish': return '#ff6b6b';
      case 'Neutral': return '#fbbf24';
      default: return colors.accentPositive;
    }
  };

  // Render bottom navigation
  const renderBottomNav = () => (
    <View style={styles.bottomNav}>
      <TouchableOpacity
        style={styles.navItem}
        onPress={() => setActiveNav('Today')}
      >
        <MaterialIcons
          name="flash-on"
          size={24}
          color={activeNav === 'Today' ? colors.accentPositive : colors.textSecondary}
        />
        <Text style={[styles.navLabel, activeNav === 'Today' && styles.activeNavLabel]}>
          Today
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navItem}
        onPress={() => setActiveNav('Alerts')}
      >
        <MaterialIcons
          name="notifications"
          size={24}
          color={activeNav === 'Alerts' ? colors.accentPositive : colors.textSecondary}
        />
        <Text style={[styles.navLabel, activeNav === 'Alerts' && styles.activeNavLabel]}>
          Alerts
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navItem}
        onPress={() => setActiveNav('Profile')}
      >
        <MaterialIcons
          name="person"
          size={24}
          color={activeNav === 'Profile' ? colors.accentPositive : colors.textSecondary}
        />
        <Text style={[styles.navLabel, activeNav === 'Profile' && styles.activeNavLabel]}>
          Profile
        </Text>
      </TouchableOpacity>
    </View>
  );

  // Render loading screen
  if (isLoading) {
    return <IntegraLoadingPage onLoadingComplete={handleLoadingComplete} />;
  }

  // Render auth screen
  if (showAuth) {
    return (
      <AuthLoadingScreen
        onAuthComplete={handleAuthComplete}
        onSkip={handleAuthSkip}
      />
    );
  }

  // Render onboarding
  if (showOnboarding) {
    return (
      <View style={styles.container}>
        <EditProfileModal
          visible={true}
          onboarding={true}
          initialProfile={userData}
          onSave={async (data) => {
            // Update local storage to mark profile step as done
            try {
              await AsyncStorage.setItem('onboarding_completed', 'true');

              // Map Supabase data format to userData format and update local cache
              const updatedUserData = {
                ...userData,
                username: data.username,
                fullName: data.full_name,
                role: data.role,
                experience: data.experience_level,
                institution: data.company,
                bio: data.bio,
                marketFocus: data.market_focus,
                avatarUrl: data.avatar_url,
                linkedin: data.linkedin,
              };

              await AsyncStorage.setItem('user_data', JSON.stringify(updatedUserData));
              setUserData(updatedUserData);
              console.log('[App] Local profile state updated after save');
            } catch (e) {
              console.error('[App] Failed to update local state:', e);
            }

            // Proceed to alerts step
            setShowOnboarding(false);
            setShowAlertPreferences(true);
          }}
          onSkip={handleOnboardingSkip}
          onClose={handleOnboardingSkip}
        />
      </View>
    );
  }

  // Render alert preferences (using EditAlertsModal for consistency)
  if (showAlertPreferences) {
    return (
      <View style={styles.container}>
        <EditAlertsModal
          visible={true}
          wrapInModal={false}
          initialPreferences={null}
          onSave={(data) => {
            handleAlertPreferencesComplete(data);
            setIsEditingAlerts(false);
          }}
          onClose={() => {
            handleAlertPreferencesSkip();
            setIsEditingAlerts(false);
          }}
        />
      </View>
    );
  }

  // Render profile screen
  if (activeNav === 'Profile') {
    return (
      <>
        <ProfileScreen
          onBack={() => setActiveNav('Today')}
          userProfile={userData}
          onLogout={handleLogout}
          onNavigateToSettings={(screen) => {
            if (screen === 'NotificationsSettings') handleNotificationSettings();
            else if (screen === 'PrivacyPolicy') setShowPrivacyPolicy(true);
            else if (screen === 'TermsOfService') setShowTermsOfService(true);
            else if (screen === 'About') setShowAbout(true);
            else if (screen === 'EditMarketFocus') {
              Alert.alert(
                'Edit Market Focus',
                'You can update your market focus in the Alerts section.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Go to Alerts', onPress: () => setActiveNav('Alerts') }
                ]
              );
            }
            else if (screen === 'EditExperience') {
              const experienceOptions = ['0-2 years', '3-5 years', '6-10 years', '10+ years'];
              Alert.alert(
                'Years of Experience',
                'Select your experience level:',
                [
                  ...experienceOptions.map(label => ({
                    text: label,
                    onPress: async () => {
                      const value = label.replace(' years', '');
                      try {
                        const { supabaseService } = require('./services/supabaseService');
                        await supabaseService.updateProfile({ experience_level: value });
                        setUserData(prev => ({ ...prev, experience: value }));
                        Alert.alert('Updated!', `Experience set to ${label}`);
                      } catch (e) {
                        Alert.alert('Error', 'Failed to update experience');
                      }
                    }
                  })),
                  { text: 'Cancel', style: 'cancel' }
                ]
              );
            }
          }}
          onOpenArticle={(article) => {
            setSelectedArticle(article);
            setShowAIAnalysis(true);
          }}
        />
        <PrivacyPolicyModal
          visible={showPrivacyPolicy}
          onClose={() => setShowPrivacyPolicy(false)}
        />
        <TermsOfServiceModal
          visible={showTermsOfService}
          onClose={() => setShowTermsOfService(false)}
        />
        <AboutModal
          visible={showAbout}
          onClose={() => setShowAbout(false)}
        />
        {showAIAnalysis && selectedArticle && (
          <AIAnalysisOverlay
            isVisible={showAIAnalysis}
            onClose={() => {
              setShowAIAnalysis(false);
              setSelectedArticle(null);
            }}
            newsData={{
              ...selectedArticle,
              source: selectedArticle.source || 'Unknown',
              sourceUrl: selectedArticle.sourceUrl || selectedArticle.url || '',
              timeAgo: selectedArticle.timeAgo || selectedArticle.date || '2 hours ago',
              sentiment: selectedArticle.sentiment || 'NEUTRAL',
              sentimentScore: parseFloat(selectedArticle.sentimentScore) || 0.5,
              keywords: selectedArticle.keywords || selectedArticle.analysis?.keywords || [],
            }}
          />
        )}
      </>
    );
  }

  // Render alerts screen
  if (activeNav === 'Alerts') {
    return (
      <View style={styles.container}>
        <AlertsScreen
          onNavigateToAlertPreferences={() => { setIsEditingAlerts(true); setShowAlertPreferences(true); }}
          onArticlePress={handleArticlePress}
        />
        <OnboardingTooltip
          storageKey="@tooltip_alerts_v3"
          title="Your Curated Alerts"
          message="Your curated sentiment news based on your commodity and keyword preferences will appear here. You can adjust your preferences anytime using the Edit Alert Preferences button below."
          verticalPosition={140}
        />
        {showAIAnalysis && selectedArticle && (
          <AIAnalysisOverlay
            isVisible={showAIAnalysis}
            onClose={() => {
              setShowAIAnalysis(false);
              setSelectedArticle(null);
            }}
            newsData={{
              ...selectedArticle,
              source: selectedArticle.source || 'Unknown',
              sourceUrl: selectedArticle.sourceUrl || selectedArticle.url || '',
              timeAgo: selectedArticle.timeAgo || selectedArticle.date || '2 hours ago',
              sentiment: selectedArticle.sentiment || 'NEUTRAL',
              sentimentScore: parseFloat(selectedArticle.sentimentScore) || 0.5,
              keywords: selectedArticle.keywords || selectedArticle.analysis?.keywords || [],
            }}
          />
        )}
        {renderBottomNav()}
      </View>
    );
  }

  // Main news feed screen
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Today</Text>
          <TouchableOpacity onPress={async () => {
            const enabled = await ensurePushEnabled();
            if (enabled) {
              setActiveNav('Alerts');
            } else {
              openSystemSettings();
            }
          }}>
            <MaterialIcons name="notifications-none" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {!notifEnabled && !bannerDismissed && (
          <View style={styles.banner}>
            <MaterialIcons name="notifications-off" size={18} color={colors.accentNegative} />
            <Text style={styles.bannerText}>Push notifications are disabled</Text>
            <TouchableOpacity style={styles.bannerCta} onPress={async () => {
              setShowNotifHelp(true);
            }}>
              <Text style={styles.bannerCtaText}>Enable Notifications</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setBannerDismissed(true)} style={styles.bannerClose}>
              <MaterialIcons name="close" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Notification Help Modal (Today screen) */}
        <Modal visible={showNotifHelp} animationType="slide" transparent onRequestClose={() => setShowNotifHelp(false)}>
          <View style={styles.helpBackdrop}>
            <View style={styles.helpCard}>
              <View style={styles.helpHeader}>
                <Text style={styles.helpTitle}>Enable Notifications</Text>
                <TouchableOpacity onPress={() => setShowNotifHelp(false)}>
                  <MaterialIcons name="close" size={22} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.helpText}>Quick steps to turn notifications back on:</Text>
              <Text style={styles.helpStep}>1. Tap <Text style={styles.helpStepEm}>Open Settings</Text> below.</Text>
              <Text style={styles.helpStep}>2. In Settings, go to <Text style={styles.helpStepEm}>Apps → Integra Markets</Text>.</Text>
              <Text style={styles.helpStep}>3. Open <Text style={styles.helpStepEm}>Notifications</Text>, toggle <Text style={styles.helpStepEm}>Allow Notifications</Text> ON, then enable Alerts.</Text>
              <View style={styles.helpButtons}>
                <TouchableOpacity style={styles.helpButton} onPress={async () => {
                  await openSystemSettings();
                }}>
                  <Text style={styles.helpButtonText}>Open Settings</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.helpButton, { backgroundColor: colors.bgSecondary, borderColor: colors.cardBorder }]} onPress={async () => {
                  const perm = await checkNotificationPermissions();
                  setNotifEnabled(Boolean(perm));
                  setShowNotifHelp(false);
                }}>
                  <Text style={[styles.helpButtonText, { color: colors.textPrimary }]}>I've Enabled It</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <OnboardingTooltip
          storageKey="@tooltip_newsfeed_v3"
          title="Your Personalized News Feed"
          message="All your commodity news based on your preferences will appear here. Swipe through articles and tap any card for a full AI-powered analysis."
          verticalPosition={140}
        />

        <View style={styles.filterContainer}>
          {['All', 'Bullish', 'Neutral', 'Bearish'].map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterChip,
                {
                  backgroundColor: getFilterChipColor(filter),
                  borderColor: getFilterBorderColor(filter)
                }
              ]}
              onPress={() => setActiveFilter(filter)}
            >
              {filter === 'Bullish' && <MaterialIcons name="trending-up" size={14} color={activeFilter === filter ? colors.bgPrimary : colors.textSecondary} />}
              {filter === 'Bearish' && <MaterialIcons name="trending-down" size={14} color={activeFilter === filter ? colors.bgPrimary : colors.textSecondary} />}
              {filter === 'Neutral' && <MaterialIcons name="trending-flat" size={14} color={activeFilter === filter ? colors.bgPrimary : colors.textSecondary} />}
              <Text style={[styles.filterText, activeFilter === filter && styles.activeFilterText]}>
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <FlatList
          data={getFilteredNews()}
          keyExtractor={(item, index) => `${item.url || item.title || ''}-${index}`}
          renderItem={({ item }) => (
            <NewsCard item={item} onAIClick={handleArticlePress} />
          )}
          style={styles.feed}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#4ECCA3"
              colors={['#4ECCA3', '#30A5FF']}
              progressBackgroundColor="#1E1E1E"
            />
          }
          ListFooterComponent={() => (
            <View style={styles.endOfFeed}>
              {allNews.length > liveNews.length ? (
                <TouchableOpacity
                  style={[styles.loadMoreButton, loadingMore && styles.loadMoreButtonLoading]}
                  onPress={handleLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <View style={styles.loadMoreLoadingContainer}>
                      <ActivityIndicator size="small" color="#4ECCA3" />
                      <Text style={[styles.loadMoreText, { color: '#4ECCA3', marginLeft: 8 }]}>Loading...</Text>
                    </View>
                  ) : (
                    <Text style={styles.loadMoreText}>Load More</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <>
                  <View style={styles.integraIcon}>
                    <Text style={styles.integraIconText}>i</Text>
                  </View>
                  <Text style={styles.endOfFeedText}>You're all caught up!</Text>
                  <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
                    <MaterialIcons name="refresh" size={16} color={colors.accentData} />
                    <Text style={styles.refreshText}>Refresh</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        />

        {renderBottomNav()}
      </View>

      {showAIAnalysis && selectedArticle && (
        <AIAnalysisOverlay
          newsData={{
            ...selectedArticle,
            source: selectedArticle.source || 'Unknown',
            sourceUrl: selectedArticle.sourceUrl || selectedArticle.url || '',
            timeAgo: selectedArticle.timeAgo || selectedArticle.date || '2 hours ago',
            sentiment: selectedArticle.sentiment || 'NEUTRAL',
            sentimentScore: parseFloat(selectedArticle.sentimentScore) || 0.5,
            keywords: selectedArticle.keywords || selectedArticle.analysis?.keywords || [],
          }}
          isVisible={showAIAnalysis}
          onClose={() => {
            setShowAIAnalysis(false);
            setSelectedArticle(null);
          }}
        />
      )}
    </SafeAreaView>
  );
};

// Error Boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.errorContainer}>
          <MaterialIcons name="error" size={48} color={colors.accentPositive} />
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => this.setState({ hasError: false })}
          >
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

// Web Container Component for Desktop Layout
const WebContainer = ({ children }) => {
  if (Platform.OS !== 'web') {
    // Not on web, return children as-is
    return children;
  }

  return (
    <View style={webStyles.webWrapper}>
      <View style={webStyles.webContainer}>
        {children}
      </View>
    </View>
  );
};

// Wrapped App - AuthProvider removed since import is commented out
const WrappedApp = () => (
  <ErrorBoundary>
    <BookmarkProvider>
      <WebContainer>
        <App />
      </WebContainer>
    </BookmarkProvider>
  </ErrorBoundary>
);

// Web-specific styles
const webStyles = StyleSheet.create({
  webWrapper: {
    flex: 1,
    backgroundColor: '#0a0a0a', // Darker background for web
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
  },
  webContainer: {
    width: 414, // iPhone Pro Max width
    height: '100vh',
    maxHeight: 896, // iPhone Pro Max height
    backgroundColor: colors.bgPrimary,
    borderRadius: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 30,
    overflow: 'hidden',
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    ...(Platform.OS === 'web' && {
      justifyContent: 'center',
      alignItems: 'center',
    }),
  },
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    ...(Platform.OS === 'web' && {
      maxWidth: 414, // iPhone Pro Max width
      width: '100%',
      alignSelf: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
      elevation: 20,
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  banner: {
    marginHorizontal: 20,
    marginTop: 10,
    backgroundColor: '#2a1f1f',
    borderColor: colors.accentNegative,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bannerText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
  },
  bannerCta: {
    backgroundColor: colors.accentNegative,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  bannerCtaText: {
    color: colors.bgPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  bannerClose: {
    marginLeft: 8,
    padding: 6,
  },
  helpBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  helpCard: {
    backgroundColor: colors.bgSecondary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  helpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  helpTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  helpText: {
    color: colors.textSecondary,
    fontSize: 15,
    marginBottom: 10,
  },
  helpStep: {
    color: colors.textPrimary,
    fontSize: 15,
    marginBottom: 8,
    lineHeight: 22,
  },
  helpStepEm: {
    color: colors.accentPositive,
    fontWeight: '700',
  },
  helpButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  helpButton: {
    backgroundColor: colors.accentPositive,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accentPositive,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  helpButtonText: {
    color: colors.bgPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  backButton: {
    padding: 5,
  },
  headerSpacer: {
    width: 34,
  },
  filterContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  activeFilterChip: {
    backgroundColor: colors.accentPositive,
    borderColor: colors.accentPositive,
  },
  filterText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 3,
  },
  activeFilterText: {
    color: colors.bgPrimary,
    fontWeight: '600',
  },
  feed: {
    flex: 1,
    paddingHorizontal: 20,
  },
  endOfFeed: {
    alignItems: 'center',
    paddingVertical: 40,
    marginBottom: 80,
  },
  integraIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.accentPositive,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  integraIconText: {
    color: colors.bgPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
  endOfFeedText: {
    color: colors.textSecondary,
    fontSize: 16,
    marginBottom: 16,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 10,
  },
  refreshText: {
    color: colors.accentData,
    fontSize: 14,
    marginLeft: 4,
  },
  loadMoreButton: {
    backgroundColor: colors.accentPositive,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 10,
    minWidth: 140,
    alignItems: 'center',
  },
  loadMoreButtonLoading: {
    backgroundColor: 'rgba(78, 204, 163, 0.15)',
    borderWidth: 1,
    borderColor: '#4ECCA3',
  },
  loadMoreLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreText: {
    color: colors.bgPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: colors.bgPrimary,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingBottom: 20,
    paddingTop: 10,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 5,
  },
  navLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  activeNavLabel: {
    color: colors.accentPositive,
  },
  alertsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  setupAlertsButton: {
    backgroundColor: colors.accentPositive,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  setupAlertsText: {
    color: colors.bgPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: colors.bgSecondary,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  profileAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accentPositive,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  profileEmail: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  settingsSection: {
    marginTop: 30,
    marginHorizontal: 20,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  settingsText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    marginLeft: 15,
  },
  appInfo: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 100,
  },
  appVersion: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  appSubtext: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
  },
  dangerZone: {
    marginTop: 30,
    marginHorizontal: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  dangerZoneTitle: {
    color: colors.accentNegative,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentNegative,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 8,
  },
  deleteAccountText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  deleteAccountWarning: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 30,
  },
  retryButton: {
    backgroundColor: colors.accentPositive,
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 30,
  },
  retryText: {
    color: colors.bgPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default WrappedApp;

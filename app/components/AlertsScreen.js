import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  Switch,
  Modal,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ensurePushEnabled,
  openSystemSettings,
  registerForPushNotificationsAsync,
  getNotificationSettings,
  saveNotificationSettings,
  checkNotificationPermissions,
  getStoredPushToken,
} from '../services/notificationService';
import { dashboardApi } from '../services/api';
import HollowCircularIcon from './HollowCircularIcon';

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

// Match news against user preferences
const matchArticleToPreferences = (article, preferences) => {
  const { commodities = [], regions = [], currencies = [], keywords = [], websiteURLs = [] } = preferences;
  const text = `${article.title || ''} ${article.summary || ''}`.toLowerCase();
  const source = (article.source || '').toLowerCase();
  const sourceUrl = (article.sourceUrl || '').toLowerCase();

  const matchedTags = [];
  let score = 0;

  // Check commodities
  const commodityMap = {
    'Crude Oil': ['oil', 'crude', 'brent', 'wti', 'petroleum'],
    'Natural Gas': ['gas', 'lng', 'natural gas'],
    'Gold': ['gold', 'bullion'],
    'Silver': ['silver'],
    'Wheat': ['wheat', 'grain'],
    'Corn': ['corn'],
    'Copper': ['copper'],
  };
  for (const c of commodities) {
    const terms = commodityMap[c] || [c.toLowerCase()];
    if (terms.some(t => text.includes(t))) {
      matchedTags.push(c);
      score += 10;
    }
  }

  // Check regions
  const regionMap = {
    'North America': ['us', 'usa', 'america', 'canada', 'mexico', 'united states'],
    'Middle East': ['middle east', 'saudi', 'iran', 'iraq', 'opec', 'uae', 'dubai'],
    'Europe': ['europe', 'eu', 'uk', 'germany', 'france', 'italy'],
    'Asia Pacific': ['asia', 'china', 'japan', 'india', 'pacific', 'australia'],
    'Latin America': ['latin', 'brazil', 'argentina', 'venezuela'],
    'Africa': ['africa', 'nigeria', 'libya', 'algeria'],
  };
  for (const r of regions) {
    const terms = regionMap[r] || [r.toLowerCase()];
    if (terms.some(t => text.includes(t))) {
      matchedTags.push(r);
      score += 5;
    }
  }

  // Check currencies
  for (const cur of currencies) {
    if (text.includes(cur.toLowerCase())) {
      matchedTags.push(cur);
      score += 3;
    }
  }

  // Check keywords
  for (const kw of keywords) {
    if (text.includes(kw.toLowerCase())) {
      matchedTags.push(kw);
      score += 8;
    }
  }

  // Check website sources
  for (const url of websiteURLs) {
    const domain = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
    if (sourceUrl.includes(domain) || source.includes(domain)) {
      matchedTags.push(`Source: ${url}`);
      score += 7;
    }
  }

  return { matched: score > 0, score, matchedTags };
};

const getSentimentColor = (sentiment) => {
  switch (sentiment?.toUpperCase()) {
    case 'BULLISH': return colors.accentPositive;
    case 'BEARISH': return colors.accentNegative;
    default: return colors.accentNeutral;
  }
};

const AlertsScreen = ({ onNavigateToAlertPreferences, onArticlePress }) => {
  const [alertPreferences, setAlertPreferences] = useState({
    commodities: [],
    regions: [],
    currencies: [],
    keywords: [],
    websiteURLs: [],
    alertFrequency: 'Real-time',
    alertThreshold: 'Medium',
    pushNotifications: true,
    emailAlerts: false,
  });
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [pushAlerts, setPushAlerts] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [priceAlerts, setPriceAlerts] = useState(true);
  const [newsAlerts, setNewsAlerts] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadDataAndAlerts();
    // Initialize push toggle from real notification settings
    (async () => {
      try {
        const hasPerm = await checkNotificationPermissions();
        const s = await getNotificationSettings();
        setPushAlerts(Boolean(s?.pushNotifications && hasPerm));
      } catch { }
    })();
  }, []);

  const loadDataAndAlerts = async () => {
    setLoading(true);
    try {
      // Load preferences first
      const savedPreferences = await AsyncStorage.getItem('alert_preferences');
      let preferences = alertPreferences;
      if (savedPreferences) {
        preferences = JSON.parse(savedPreferences);
        setAlertPreferences(preferences);
      }

      // Fetch real news from dashboard
      const commodityMap = {
        'Crude Oil': 'OIL',
        'Natural Gas': 'NAT GAS',
        'Gold': 'GOLD',
        'Wheat': 'WHEAT',
      };
      const commodities = preferences.commodities?.map(c => commodityMap[c] || c.toUpperCase()) || [];
      const queryComms = commodities.length > 0 ? [...new Set(commodities)] : ['OIL', 'GOLD', 'WHEAT', 'NAT GAS'];

      console.log('[AlertsScreen] Fetching news for:', queryComms);
      const data = await dashboardApi.getTodayDashboard(queryComms);
      const articles = Array.isArray(data?.news) ? data.news : [];

      // Convert articles to alerts and filter by preferences
      const newsAlerts = articles
        .map((article, idx) => {
          const { matched, score, matchedTags } = matchArticleToPreferences(article, preferences);

          // Format time - handle various date formats
          const published = article.published || article.time_published || article.pubDate;
          let timeAgo = 'recently';
          if (published) {
            try {
              const pubDate = new Date(published);
              if (!isNaN(pubDate.getTime())) {
                const diff = Date.now() - pubDate.getTime();
                const mins = Math.floor(diff / 60000);
                if (mins < 0) {
                  timeAgo = 'just now';
                } else if (mins < 60) {
                  timeAgo = `${mins} min ago`;
                } else if (mins < 1440) {
                  timeAgo = `${Math.floor(mins / 60)}h ago`;
                } else {
                  timeAgo = `${Math.floor(mins / 1440)}d ago`;
                }
              }
            } catch (e) {
              console.log('Date parse error:', published);
            }
          }

          // Extract sentiment from various possible fields
          let sentiment = 'NEUTRAL';
          const rawSentiment = (
            article.ensemble_sentiment ||
            article.sentiment ||
            article.overall_sentiment_label ||
            article.sentiment_label ||
            ''
          ).toString().toUpperCase();

          if (rawSentiment.includes('BULL') || rawSentiment.includes('POSITIVE')) {
            sentiment = 'BULLISH';
          } else if (rawSentiment.includes('BEAR') || rawSentiment.includes('NEGATIVE')) {
            sentiment = 'BEARISH';
          } else if (rawSentiment.includes('NEUTRAL')) {
            sentiment = 'NEUTRAL';
          }

          // Also check sentiment score if available
          const sentimentScore = parseFloat(article.sentiment_score || article.score || 0.5);
          if (sentiment === 'NEUTRAL' && !isNaN(sentimentScore)) {
            if (sentimentScore >= 0.6) sentiment = 'BULLISH';
            else if (sentimentScore <= 0.4) sentiment = 'BEARISH';
          }

          return {
            id: `news-${idx}-${Date.now()}`,
            title: article.title || article.headline || 'News Update',
            message: article.summary || article.description || '',
            source: article.source || 'Unknown',
            sourceUrl: article.source_url || article.sourceUrl,
            type: 'news',
            sentiment,
            matchedTags,
            score,
            matched,
            createdAt: published || new Date().toISOString(),
            timeAgo,
            read: false,
            severity: score > 15 ? 'high' : score > 5 ? 'medium' : 'low',
          };
        })
        // Only show matched articles if user has preferences, otherwise show all
        .filter(a => {
          const hasPrefs = (preferences.commodities?.length > 0 ||
            preferences.regions?.length > 0 ||
            preferences.currencies?.length > 0 ||
            preferences.keywords?.length > 0 ||
            preferences.websiteURLs?.length > 0);
          return !hasPrefs || a.matched;
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 15);

      console.log('[AlertsScreen] Found', newsAlerts.length, 'matching alerts');
      setAlerts(newsAlerts);
    } catch (error) {
      console.error('Error loading alerts:', error);
    } finally {
      setPreferencesLoaded(true);
      setLoading(false);
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high':
        return colors.accentNegative;
      case 'medium':
        return colors.accentNeutral;
      case 'low':
        return colors.accentPositive;
      default:
        return colors.textSecondary;
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'price':
        return 'trending-up';
      case 'news':
        return 'article';
      case 'threshold':
        return 'warning';
      default:
        return 'notifications';
    }
  };

  const handleAlertTap = async (alert) => {
    // Mark as read
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alert.id ? { ...a, read: true } : a
      )
    );

    // Open article if it has a URL
    if (alert.sourceUrl) {
      try {
        await Linking.openURL(alert.sourceUrl);
      } catch (err) {
        console.log('Could not open URL:', alert.sourceUrl);
      }
    } else if (onArticlePress) {
      // If we have an onArticlePress handler, use it
      onArticlePress(alert);
    }
  };

  const formatRelativeTime = (isoString) => {
    if (!isoString) return '';
    const now = Date.now();
    const time = new Date(isoString).getTime();
    const diffMs = now - time;

    const minutes = Math.round(diffMs / (1000 * 60));
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  };

  const handleSettingChange = async (setting, value) => {
    switch (setting) {
      case 'push':
        if (value) {
          const enabled = await ensurePushEnabled();
          if (enabled) {
            setPushAlerts(true);
            const s = await getNotificationSettings();
            await saveNotificationSettings({ ...s, pushNotifications: true });
            const token = await getStoredPushToken();
            if (!token) await registerForPushNotificationsAsync({ silent: true });
          } else {
            openSystemSettings();
          }
        } else {
          setPushAlerts(false);
          const s = await getNotificationSettings();
          await saveNotificationSettings({ ...s, pushNotifications: false });
        }
        break;
      case 'email':
        setEmailAlerts(value);
        break;
      case 'price':
        setPriceAlerts(value);
        break;
      case 'news':
        setNewsAlerts(value);
        break;
    }
  };

  const renderPreferenceItem = (label, items, emptyMessage) => {
    if (!preferencesLoaded) {
      return (
        <View style={styles.preferenceItem}>
          <Text style={styles.preferenceLabel}>{label}:</Text>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      );
    }

    return (
      <View style={styles.preferenceItem}>
        <Text style={styles.preferenceLabel}>{label}:</Text>
        <Text style={styles.preferenceValue}>
          {items && items.length > 0 ? items.join(', ') : emptyMessage}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Alerts</Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Alert Preferences Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Alert Preferences</Text>
          <View style={styles.preferencesContainer}>
            {renderPreferenceItem(
              'Commodities',
              alertPreferences.commodities,
              'No commodities selected'
            )}
            {renderPreferenceItem(
              'Regions',
              alertPreferences.regions,
              'No regions selected'
            )}
            {renderPreferenceItem(
              'Currencies',
              alertPreferences.currencies,
              'No currencies selected'
            )}
            {renderPreferenceItem(
              'Keywords',
              alertPreferences.keywords,
              'No keywords added'
            )}
            {renderPreferenceItem(
              'Website Sources',
              alertPreferences.websiteURLs,
              'No website sources added'
            )}

            <View style={styles.preferenceItem}>
              <Text style={styles.preferenceLabel}>Alert Frequency:</Text>
              <Text style={styles.preferenceValue}>
                {preferencesLoaded ? alertPreferences.alertFrequency : 'Loading...'}
              </Text>
            </View>

            <View style={styles.preferenceItem}>
              <Text style={styles.preferenceLabel}>Alert Threshold:</Text>
              <Text style={styles.preferenceValue}>
                {preferencesLoaded ? alertPreferences.alertThreshold : 'Loading...'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.editPreferencesButton}
            onPress={onNavigateToAlertPreferences}
          >
            <Text style={styles.editPreferencesText}>Edit Alert Preferences</Text>
          </TouchableOpacity>
        </View>

        {/* Notification Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notification Settings</Text>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Push Notifications</Text>
            <Switch
              value={pushAlerts}
              onValueChange={(value) => handleSettingChange('push', value)}
              trackColor={{ false: colors.bgSecondary, true: colors.accentPositive }}
              thumbColor={pushAlerts ? colors.textPrimary : colors.textSecondary}
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Email Alerts</Text>
            <Switch
              value={emailAlerts}
              onValueChange={(value) => handleSettingChange('email', value)}
              trackColor={{ false: colors.bgSecondary, true: colors.accentPositive }}
              thumbColor={emailAlerts ? colors.textPrimary : colors.textSecondary}
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Price Alerts</Text>
            <Switch
              value={priceAlerts}
              onValueChange={(value) => handleSettingChange('price', value)}
              trackColor={{ false: colors.bgSecondary, true: colors.accentPositive }}
              thumbColor={priceAlerts ? colors.textPrimary : colors.textSecondary}
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>News Alerts</Text>
            <Switch
              value={newsAlerts}
              onValueChange={(value) => handleSettingChange('news', value)}
              trackColor={{ false: colors.bgSecondary, true: colors.accentPositive }}
              thumbColor={newsAlerts ? colors.textPrimary : colors.textSecondary}
            />
          </View>
        </View>

        {/* Recent Alerts - Real News */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <Text style={styles.sectionTitle}>Recent Alerts</Text>
            <TouchableOpacity onPress={loadDataAndAlerts} style={{ padding: 8 }}>
              <MaterialIcons name="refresh" size={20} color={colors.accentData} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>Loading news...</Text>
            </View>
          ) : alerts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>No matching alerts</Text>
              <Text style={styles.emptyStateSubtitle}>
                {preferencesLoaded && (alertPreferences.commodities?.length > 0 || alertPreferences.keywords?.length > 0)
                  ? 'No news matches your current preferences. Try broadening your filters.'
                  : 'Set up your alert preferences to see personalized news.'}
              </Text>
            </View>
          ) : (
            alerts.map((alert) => (
              <TouchableOpacity
                key={alert.id}
                style={[styles.alertItem, !alert.read && styles.unreadAlert]}
                onPress={() => handleAlertTap(alert)}
              >
                <View style={[styles.alertIcon, { backgroundColor: getSentimentColor(alert.sentiment) + '20' }]}>
                  <MaterialIcons
                    name={alert.sentiment === 'BULLISH' ? 'trending-up' : alert.sentiment === 'BEARISH' ? 'trending-down' : 'article'}
                    size={20}
                    color={getSentimentColor(alert.sentiment)}
                  />
                </View>
                <View style={styles.alertContent}>
                  <Text style={styles.alertTitle} numberOfLines={2}>{alert.title}</Text>
                  <Text style={styles.alertMessage} numberOfLines={2}>{alert.message}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <Text style={styles.alertSource}>{alert.source}</Text>
                    <Text style={styles.alertTime}>{alert.timeAgo}</Text>
                  </View>
                  {alert.matchedTags?.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                      {alert.matchedTags.slice(0, 3).map((tag, i) => (
                        <View key={i} style={styles.matchedTag}>
                          <Text style={styles.matchedTagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))
          )}
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => {
              const ordered = [...alerts].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              );
              setHistoryItems(ordered);
              setShowHistoryModal(true);
            }}
            disabled={alerts.length === 0}
          >
            <MaterialIcons
              name="history"
              size={20}
              color={alerts.length === 0 ? colors.textSecondary : colors.accentData}
            />
            <Text
              style={[
                styles.historyButtonText,
                alerts.length === 0 && { color: colors.textSecondary },
              ]}
            >
              View Alert History
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <Modal
        visible={showHistoryModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowHistoryModal(false)}
      >
        <View style={[styles.modalBackdrop, styles.centeredBackdrop]}>
          <View style={styles.historyModalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Alert History</Text>
                <Text style={styles.modalSubtitle}>Chronological list of alerts saved on this device</Text>
              </View>
              <TouchableOpacity onPress={() => setShowHistoryModal(false)}>
                <MaterialIcons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {historyItems.length === 0 ? (
              <View style={styles.historyEmptyState}>
                <Text style={styles.modalItemTitle}>No alerts configured</Text>
                <Text style={styles.modalItemSub}>Update your alert preferences to populate history.</Text>
              </View>
            ) : (
              <ScrollView style={styles.historyList}>
                {historyItems.map((alert) => (
                  <View key={alert.id} style={styles.modalItem}>
                    <Text style={styles.modalItemTitle}>{alert.title}</Text>
                    <Text style={styles.modalItemSub}>{alert.message}</Text>
                    <Text style={styles.modalItemTimestamp}>
                      {new Date(alert.createdAt).toLocaleString()}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
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
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 15,
  },
  preferencesContainer: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
  },
  preferenceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  preferenceLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
    flex: 1,
  },
  preferenceValue: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 2,
    textAlign: 'right',
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'right',
    flex: 2,
  },
  editPreferencesButton: {
    backgroundColor: colors.accentData,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  editPreferencesText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  settingLabel: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
  },
  unreadAlert: {
    backgroundColor: colors.bgTertiary,
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  alertMessage: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  alertTime: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accentPositive,
  },
  historyButton: {
    marginTop: 16,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bgSecondary,
  },
  historyButtonText: {
    fontSize: 15,
    color: colors.accentData,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 10, 0.75)',
  },
  centeredBackdrop: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  modalSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  modalList: {
    marginTop: 8,
  },
  historyModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.bgSecondary,
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 26,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 16,
  },
  historyList: {
    maxHeight: 420,
    marginTop: 8,
  },
  historyEmptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 6,
  },
  modalItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  modalItemTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  modalItemSub: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  modalItemTimestamp: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  // New alert styles
  alertSource: {
    fontSize: 12,
    color: colors.accentData,
    fontWeight: '500',
  },
  matchedTag: {
    backgroundColor: colors.accentPositive + '20',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  matchedTagText: {
    fontSize: 11,
    color: colors.accentPositive,
    fontWeight: '500',
  },
  sentimentBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sentimentBadgeText: {
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyStateTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});

export default AlertsScreen;
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

const deriveAlertsFromPreferences = (preferences = {}, previousAlerts = []) => {
  const {
    commodities = [],
    regions = [],
    currencies = [],
    keywords = [],
    websiteURLs = [],
    alertFrequency = 'Real-time',
    alertThreshold = 'Medium',
  } = preferences;

  const previousMap = new Map(previousAlerts.map((alert) => [alert.id, alert]));

  const frequencyLabel = alertFrequency === 'Real-time'
    ? 'real-time'
    : alertFrequency.toLowerCase();
  const thresholdLabel = alertThreshold.toLowerCase();

  const buildAlert = (id, title, body, type) => {
    const existing = previousMap.get(id);
    return {
      id,
      title,
      message: body,
      type,
      createdAt: existing?.createdAt || new Date().toISOString(),
      read: existing?.read ?? false,
      severity: thresholdLabel === 'high' ? 'high' : thresholdLabel === 'low' ? 'low' : 'medium',
    };
  };

  const alerts = [];

  commodities.forEach((commodity) => {
    const id = `commodity-${commodity}`;
    alerts.push(
      buildAlert(
        id,
        `${commodity} commodity updates`,
        `Monitoring ${commodity} news and price action with ${thresholdLabel} sensitivity (${frequencyLabel}).`,
        'commodity',
      ),
    );
  });

  regions.forEach((region) => {
    const id = `region-${region}`;
    alerts.push(
      buildAlert(
        id,
        `${region} regional coverage`,
        `Highlighting market shifts across ${region} as part of your watchlist.`,
        'region',
      ),
    );
  });

  currencies.forEach((currency) => {
    const id = `currency-${currency}`;
    alerts.push(
      buildAlert(
        id,
        `${currency} currency alerts`,
        `Keeping tabs on ${currency} developments in line with your preferences.`,
        'currency',
      ),
    );
  });

  keywords.forEach((keyword) => {
    const id = `keyword-${keyword}`;
    alerts.push(
      buildAlert(
        id,
        `Keyword: ${keyword}`,
        `Surfacing stories tagged with “${keyword}”.`,
        'keyword',
      ),
    );
  });

  websiteURLs.forEach((url) => {
    const id = `source-${url}`;
    alerts.push(
      buildAlert(
        id,
        `Source: ${url}`,
        `Pulling curated updates from ${url}.`,
        'source',
      ),
    );
  });

  return alerts;
};

const AlertsScreen = ({ onNavigateToAlertPreferences }) => {
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

  useEffect(() => {
    loadAlertPreferences();
    // Initialize push toggle from real notification settings
    (async () => {
      try {
        const hasPerm = await checkNotificationPermissions();
        const s = await getNotificationSettings();
        setPushAlerts(Boolean(s?.pushNotifications && hasPerm));
      } catch {}
    })();
  }, []);

  const loadAlertPreferences = async () => {
    try {
      const savedPreferences = await AsyncStorage.getItem('alert_preferences');
      if (savedPreferences) {
        const preferences = JSON.parse(savedPreferences);
        setAlertPreferences(preferences);
        setAlerts((prev) => deriveAlertsFromPreferences(preferences, prev));
      }
    } catch (error) {
      console.error('Error loading alert preferences:', error);
    } finally {
      setPreferencesLoaded(true);
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

  const handleAlertTap = (alertId) => {
    setAlerts((prev) =>
      prev.map((alert) =>
        alert.id === alertId ? { ...alert, read: true } : alert
      )
    );
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

        {/* Recent Alerts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Alerts</Text>
          {alerts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>No alerts yet</Text>
              <Text style={styles.emptyStateSubtitle}>Adjust your alert preferences to start tracking markets.</Text>
            </View>
          ) : (
            alerts.map((alert) => (
              <TouchableOpacity
                key={alert.id}
                style={[styles.alertItem, !alert.read && styles.unreadAlert]}
                onPress={() => handleAlertTap(alert.id)}
              >
                <View style={styles.alertIcon}>
                  <HollowCircularIcon
                    name={getTypeIcon(alert.type)}
                    size={20}
                    color={getSeverityColor(alert.severity)}
                    padding={4}
                  />
                </View>
                <View style={styles.alertContent}>
                  <Text style={styles.alertTitle}>{alert.title}</Text>
                  <Text style={styles.alertMessage}>{alert.message}</Text>
                  <Text style={styles.alertTime}>{formatRelativeTime(alert.createdAt)}</Text>
                </View>
                {!alert.read && <View style={styles.unreadDot} />}
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
});

export default AlertsScreen;
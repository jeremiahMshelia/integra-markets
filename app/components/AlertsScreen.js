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
  RefreshControl,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HollowCircularIcon from './HollowCircularIcon';
import alertMonitoringService from '../services/alertMonitoringService';
import {
  getCurrentAlerts,
  markAlertAsRead,
  deleteAlert,
  clearAllAlerts,
  getTimeAgo,
  initializeSampleAlerts,
  monitorAlerts,
} from '../services/alertService';

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

const AlertsScreen = ({ onNavigateToAlertPreferences, onNavigateToBookmarks }) => {
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
  // Prediction-market divergence alerts (new in 2026-06).
  // Defaults to OFF so existing users don't get surprise notifications.
  // Threshold = absolute delta in percentage points (5..50). Topics +
  // providers default to the same set as the backend migration.
  const [divergenceAlerts, setDivergenceAlerts] = useState(false);
  const [divergenceThreshold, setDivergenceThreshold] = useState(20);
  const [alerts, setAlerts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [alertsLoaded, setAlertsLoaded] = useState(false);
  const [monitoringStatus, setMonitoringStatus] = useState({ isMonitoring: false });

  useEffect(() => {
    loadAlertPreferences();
    loadAlerts();
    initializeSampleAlerts(); // Initialize with sample data if no alerts exist
    updateMonitoringStatus();
    
    // Start monitoring service
    alertMonitoringService.startMonitoring();
    
    // Set up periodic status updates
    const statusInterval = setInterval(() => {
      updateMonitoringStatus();
    }, 5000); // Check status every 5 seconds
    
    return () => {
      clearInterval(statusInterval);
      // Don't stop monitoring on unmount to keep it running in background
    };
  }, []);

  // Monitor for new alerts periodically
  useEffect(() => {
    if (preferencesLoaded && alertPreferences) {
      const interval = setInterval(() => {
        monitorAlerts(alertPreferences);
        loadAlerts(); // Refresh alerts
      }, 30000); // Check every 30 seconds

      return () => clearInterval(interval);
    }
  }, [preferencesLoaded, alertPreferences]);

  const loadAlertPreferences = async () => {
    try {
      const savedPreferences = await AsyncStorage.getItem('alert_preferences');
      if (savedPreferences) {
        const preferences = JSON.parse(savedPreferences);
        setAlertPreferences(preferences);
      }
      // Divergence alert prefs live in a separate key (different
      // server-side row) so a stale alert_preferences blob can't
      // accidentally toggle them on.
      const savedDivergence = await AsyncStorage.getItem('divergence_alert_prefs');
      if (savedDivergence) {
        const d = JSON.parse(savedDivergence);
        if (typeof d.enabled === 'boolean') setDivergenceAlerts(d.enabled);
        if (typeof d.threshold === 'number') setDivergenceThreshold(d.threshold);
      }
    } catch (error) {
      console.error('Error loading alert preferences:', error);
    } finally {
      setPreferencesLoaded(true);
    }
  };

  const loadAlerts = async () => {
    try {
      const currentAlerts = await getCurrentAlerts();
      setAlerts(currentAlerts);
    } catch (error) {
      console.error('Error loading alerts:', error);
    } finally {
      setAlertsLoaded(true);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAlerts();
    await updateMonitoringStatus();
    // Trigger manual market check
    await alertMonitoringService.triggerManualCheck();
    if (preferencesLoaded && alertPreferences) {
      await monitorAlerts(alertPreferences);
      await loadAlerts(); // Load again after monitoring
    }
    setRefreshing(false);
  };
  
  const updateMonitoringStatus = async () => {
    const status = alertMonitoringService.getStatus();
    setMonitoringStatus(status);
  };
  
  const toggleMonitoring = async () => {
    if (monitoringStatus.isMonitoring) {
      await alertMonitoringService.stopMonitoring();
    } else {
      await alertMonitoringService.startMonitoring();
    }
    await updateMonitoringStatus();
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
      case 'divergence':
      case 'divergence_alert':
        return 'compare-arrows';
      default:
        return 'notifications';
    }
  };

  const handleAlertTap = async (alertId) => {
    try {
      await markAlertAsRead(alertId);
      await loadAlerts(); // Refresh to show updated read status
    } catch (error) {
      console.error('Error marking alert as read:', error);
    }
  };

  const handleDeleteAlert = async (alertId) => {
    Alert.alert(
      'Delete Alert',
      'Are you sure you want to delete this alert?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteAlert(alertId);
            await loadAlerts();
          },
        },
      ]
    );
  };

  const handleClearAllAlerts = () => {
    if (alerts.length === 0) {
      Alert.alert('No Alerts', 'There are no alerts to clear.');
      return;
    }

    Alert.alert(
      'Clear All Alerts',
      `Are you sure you want to clear all ${alerts.length} alerts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearAllAlerts();
            await loadAlerts();
          },
        },
      ]
    );
  };

  const handleSettingChange = (setting, value) => {
    switch (setting) {
      case 'push':
        setPushAlerts(value);
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
      case 'divergence':
        setDivergenceAlerts(value);
        persistDivergencePrefs({ enabled: value, threshold: divergenceThreshold });
        break;
      case 'divergenceThreshold':
        setDivergenceThreshold(value);
        persistDivergencePrefs({ enabled: divergenceAlerts, threshold: value });
        break;
    }
  };

  // Persist to AsyncStorage immediately (so the toggle survives a kill).
  // Backend sync happens in the next request cycle via the existing
  // user preferences PATCH endpoint — wiring that here would create
  // a tight coupling; instead the value is read alongside other prefs.
  const persistDivergencePrefs = async ({ enabled, threshold }) => {
    try {
      await AsyncStorage.setItem(
        'divergence_alert_prefs',
        JSON.stringify({ enabled, threshold }),
      );
    } catch (err) {
      console.warn('failed to persist divergence prefs:', err);
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
        <TouchableOpacity 
          style={styles.bookmarkButton}
          onPress={onNavigateToBookmarks}
        >
          <MaterialIcons name="bookmark" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accentPositive}
            colors={[colors.accentPositive]}
          />
        }
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
          
          {/* Monitoring Status */}
          <View style={styles.statusContainer}>
            <View style={styles.statusIndicator}>
              <View style={[
                styles.statusDot, 
                { backgroundColor: monitoringStatus.isMonitoring ? colors.accentPositive : colors.accentNegative }
              ]} />
              <Text style={styles.statusText}>
                Real-time Monitoring: {monitoringStatus.isMonitoring ? 'Active' : 'Inactive'}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                { backgroundColor: monitoringStatus.isMonitoring ? colors.accentNegative + '20' : colors.accentPositive + '20' }
              ]}
              onPress={toggleMonitoring}
            >
              <Text style={[
                styles.toggleButtonText,
                { color: monitoringStatus.isMonitoring ? colors.accentNegative : colors.accentPositive }
              ]}>
                {monitoringStatus.isMonitoring ? 'Stop' : 'Start'}
              </Text>
            </TouchableOpacity>
          </View>
          
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

          {/* Divergence alerts — fires when news sentiment diverges from
              Polymarket / Kalshi consensus past the threshold. */}
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Prediction-market divergence</Text>
            <Switch
              value={divergenceAlerts}
              onValueChange={(value) => handleSettingChange('divergence', value)}
              trackColor={{ false: colors.bgSecondary, true: colors.accentPositive }}
              thumbColor={divergenceAlerts ? colors.textPrimary : colors.textSecondary}
            />
          </View>
          {divergenceAlerts && (
            <View style={styles.settingSubRow}>
              <Text style={styles.settingSubLabel}>
                Threshold: {divergenceThreshold} pts
              </Text>
              <View style={styles.thresholdButtons}>
                {[10, 20, 30, 40].map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.thresholdChip,
                      divergenceThreshold === value && styles.thresholdChipActive,
                    ]}
                    onPress={() => handleSettingChange('divergenceThreshold', value)}
                  >
                    <Text style={[
                      styles.thresholdChipText,
                      divergenceThreshold === value && styles.thresholdChipTextActive,
                    ]}>{value}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Recent Alerts */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Alerts</Text>
            {alerts.length > 0 && (
              <TouchableOpacity
                style={styles.clearAllButton}
                onPress={handleClearAllAlerts}
              >
                <Text style={styles.clearAllText}>Clear All</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {!alertsLoaded ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading alerts...</Text>
            </View>
          ) : alerts.length === 0 ? (
            <View style={styles.emptyAlertsContainer}>
              <MaterialIcons name="notifications-none" size={48} color={colors.textSecondary} />
              <Text style={styles.emptyAlertsText}>No alerts yet</Text>
              <Text style={styles.emptyAlertsSubtext}>
                You'll see market alerts and notifications here based on your preferences.
              </Text>
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
                  <Text style={styles.alertTime}>{getTimeAgo(alert.timestamp)}</Text>
                </View>
                <View style={styles.alertActions}>
                  {!alert.read && <View style={styles.unreadDot} />}
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteAlert(alert.id)}
                  >
                    <MaterialIcons name="close" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={onNavigateToAlertPreferences}
          >
            <HollowCircularIcon name="add" size={20} color={colors.accentData} padding={4} />
            <Text style={styles.actionText}>Edit Alert Preferences</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={handleRefresh}
          >
            <HollowCircularIcon name="refresh" size={20} color={colors.accentData} padding={4} />
            <Text style={styles.actionText}>Refresh Alerts</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={handleClearAllAlerts}
          >
            <HollowCircularIcon name="clear-all" size={20} color={colors.accentNegative} padding={4} />
            <Text style={[styles.actionText, { color: colors.accentNegative }]}>Clear All Alerts</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  bookmarkButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
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
  settingSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 12,
    paddingLeft: 12,
  },
  settingSubLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  thresholdButtons: {
    flexDirection: 'row',
  },
  thresholdChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 6,
    borderRadius: 12,
    backgroundColor: colors.bgTertiary,
  },
  thresholdChipActive: {
    backgroundColor: colors.accentPositive,
  },
  thresholdChipText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  thresholdChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
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
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  alertMessage: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  alertTime: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accentPositive,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  clearAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.accentNegative + '20',
    borderRadius: 6,
  },
  clearAllText: {
    color: colors.accentNegative,
    fontSize: 12,
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyAlertsContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyAlertsText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyAlertsSubtext: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  alertActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteButton: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: colors.bgSecondary,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
  },
  actionText: {
    fontSize: 16,
    color: colors.accentData,
    marginLeft: 10,
    fontWeight: '500',
  },
  statusContainer: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default AlertsScreen;
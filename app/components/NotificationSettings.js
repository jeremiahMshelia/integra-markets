import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  getNotificationSettings,
  saveNotificationSettings,
  registerForPushNotificationsAsync,
  getStoredPushToken,
  getScheduledNotifications,
  cancelAllNotifications,
  scheduleLocalNotification,
  checkNotificationPermissions,
  ensurePushEnabled,
  openSystemSettings,
} from '../services/notificationService';

// Use the same color palette as the main app
const colors = {
  bgPrimary: '#121212',
  bgSecondary: '#1E1E1E',
  textPrimary: '#ECECEC',
  textSecondary: '#A0A0A0',
  accentPositive: '#4ECCA3',
  accentPositiveBg: 'rgba(78, 204, 163, 0.1)',
  accentData: '#30A5FF',
  accentDataBg: 'rgba(48, 165, 255, 0.1)',
  accentNegative: '#F05454',
  divider: '#333333',
  cardBorder: '#333333',
};

const NotificationSettings = ({ onBack }) => {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [pushToken, setPushToken] = useState(null);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    loadSettings();
    loadPushToken();
    loadScheduledNotifications();
    checkPermissionStatus();
  }, []);

  const loadSettings = async () => {
    try {
      const currentSettings = await getNotificationSettings();
      setSettings(currentSettings);
    } catch (error) {
      console.error('Error loading notification settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPushToken = async () => {
    try {
      const token = await getStoredPushToken();
      setPushToken(token);
    } catch (error) {
      console.error('Error loading push token:', error);
    }
  };

  const loadScheduledNotifications = async () => {
    try {
      const scheduled = await getScheduledNotifications();
      setScheduledCount(scheduled.length);
    } catch (error) {
      console.error('Error loading scheduled notifications:', error);
    }
  };

  const checkPermissionStatus = async () => {
    try {
      const permissionGranted = await checkNotificationPermissions();
      setHasPermission(permissionGranted);
    } catch (error) {
      console.error('Error checking permission status:', error);
    }
  };

  const togglePushNotifications = async (value) => {
    if (value) {
      const enabled = await ensurePushEnabled();
      setHasPermission(enabled);
      if (enabled) {
        await handleSettingChange('pushNotifications', true);
        const token = await getStoredPushToken();
        if (!token) {
          await registerForPushNotificationsAsync({ silent: true });
          await loadPushToken();
        }
      } else {
        // Offer Settings if still disabled
        Alert.alert(
          'Enable Notifications',
          'Please allow notifications in system settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => openSystemSettings() },
          ]
        );
        await handleSettingChange('pushNotifications', false);
      }
    } else {
      await handleSettingChange('pushNotifications', false);
    }
  };

  const handleSettingChange = async (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    await saveNotificationSettings(newSettings);
  };

  const handleRegisterNotifications = async () => {
    const enabled = await ensurePushEnabled();
    if (enabled) {
      const token = await getStoredPushToken();
      if (!token) {
        const t2 = await registerForPushNotificationsAsync({ silent: true });
        if (t2) setPushToken(t2);
      } else {
        setPushToken(token);
      }
      setHasPermission(true);
      await handleSettingChange('pushNotifications', true);
    } else {
      Alert.alert(
        'Notifications Disabled',
        'Allow notifications in system settings to receive alerts.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => openSystemSettings() },
        ]
      );
    }
  };

  const handleTestNotification = async () => {
    Alert.alert(
      'Test Notification',
      'Send a test notification to verify your settings?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Test',
          onPress: async () => {
            await scheduleLocalNotification(
              'Test Notification',
              'This is a test notification from Integra Markets!',
              { type: 'test' }
            );
          },
        },
      ]
    );
  };

  const handleClearAllNotifications = async () => {
    Alert.alert(
      'Clear All Notifications',
      `This will cancel all ${scheduledCount} scheduled notifications. Are you sure?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            const success = await cancelAllNotifications();
            if (success) {
              setScheduledCount(0);
              Alert.alert('Success', 'All scheduled notifications have been cleared.');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bgPrimary} />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading notification settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgPrimary} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <MaterialIcons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.content}>
        
        {/* Push Notifications Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Push Notification Status</Text>
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <MaterialIcons 
                name={hasPermission ? "check-circle" : "error"} 
                size={24} 
                color={hasPermission ? colors.accentPositive : colors.accentNegative} 
              />
              <View style={styles.statusInfo}>
                <Text style={styles.statusText}>
                  {hasPermission ? 'Push Notifications Enabled' : 'Push Notifications Disabled'}
                </Text>
                <Text style={styles.statusSubtext}>
                  {hasPermission 
                    ? (pushToken ? 'Ready to receive alerts' : 'Registering device...')
                    : 'Tap to enable notifications'}
                </Text>
              </View>
              {!hasPermission && (
                <TouchableOpacity 
                  style={styles.enableButton} 
                  onPress={handleRegisterNotifications}
                >
                  <Text style={styles.enableButtonText}>Enable</Text>
                </TouchableOpacity>
              )}
            </View>
            {scheduledCount > 0 && (
              <View style={styles.scheduledInfo}>
                <Text style={styles.scheduledText}>
                  {scheduledCount} scheduled notification{scheduledCount !== 1 ? 's' : ''}
                </Text>
                <TouchableOpacity onPress={handleClearAllNotifications}>
                  <Text style={styles.clearLink}>Clear all</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Notification Types */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notification Types</Text>
          <View style={styles.settingsCard}>
            
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Push Notifications</Text>
                <Text style={styles.settingDescription}>
                  Enable all push notifications
                </Text>
              </View>
              <Switch
                value={settings.pushNotifications || false}
                onValueChange={togglePushNotifications}
                trackColor={{ false: colors.divider, true: colors.accentPositive }}
                thumbColor={colors.textPrimary}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Market Alerts</Text>
                <Text style={styles.settingDescription}>
                  Price changes and market movements
                </Text>
              </View>
              <Switch
                value={settings.marketAlerts || false}
                onValueChange={(value) => handleSettingChange('marketAlerts', value)}
                trackColor={{ false: colors.divider, true: colors.accentPositive }}
                thumbColor={colors.textPrimary}
                disabled={!settings.pushNotifications}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Breaking News</Text>
                <Text style={styles.settingDescription}>
                  Important market news and events
                </Text>
              </View>
              <Switch
                value={settings.breakingNews || false}
                onValueChange={(value) => handleSettingChange('breakingNews', value)}
                trackColor={{ false: colors.divider, true: colors.accentPositive }}
                thumbColor={colors.textPrimary}
                disabled={!settings.pushNotifications}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Price Alerts</Text>
                <Text style={styles.settingDescription}>
                  Commodity price threshold alerts
                </Text>
              </View>
              <Switch
                value={settings.priceAlerts || false}
                onValueChange={(value) => handleSettingChange('priceAlerts', value)}
                trackColor={{ false: colors.divider, true: colors.accentPositive }}
                thumbColor={colors.textPrimary}
                disabled={!settings.pushNotifications}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Weekend Updates</Text>
                <Text style={styles.settingDescription}>
                  Weekly market summaries
                </Text>
              </View>
              <Switch
                value={settings.weekendUpdates || false}
                onValueChange={(value) => handleSettingChange('weekendUpdates', value)}
                trackColor={{ false: colors.divider, true: colors.accentPositive }}
                thumbColor={colors.textPrimary}
                disabled={!settings.pushNotifications}
              />
            </View>

          </View>
        </View>

        {/* Notification Behavior */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notification Behavior</Text>
          <View style={styles.settingsCard}>
            
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Sound</Text>
                <Text style={styles.settingDescription}>
                  Play sound for notifications
                </Text>
              </View>
              <Switch
                value={settings.soundEnabled || false}
                onValueChange={(value) => handleSettingChange('soundEnabled', value)}
                trackColor={{ false: colors.divider, true: colors.accentPositive }}
                thumbColor={colors.textPrimary}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Vibration</Text>
                <Text style={styles.settingDescription}>
                  Vibrate for notifications
                </Text>
              </View>
              <Switch
                value={settings.vibrationEnabled || false}
                onValueChange={(value) => handleSettingChange('vibrationEnabled', value)}
                trackColor={{ false: colors.divider, true: colors.accentPositive }}
                thumbColor={colors.textPrimary}
              />
            </View>

          </View>
        </View>

        {/* Email Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Email Notifications</Text>
          <View style={styles.settingsCard}>
            
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Email Alerts</Text>
                <Text style={styles.settingDescription}>
                  Receive notifications via email
                </Text>
              </View>
              <Switch
                value={settings.emailAlerts || false}
                onValueChange={(value) => handleSettingChange('emailAlerts', value)}
                trackColor={{ false: colors.divider, true: colors.accentPositive }}
                thumbColor={colors.textPrimary}
              />
            </View>

          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.testButton} 
            onPress={handleTestNotification}
            disabled={!settings.pushNotifications}
          >
            <MaterialIcons name="notifications" size={20} color={colors.textPrimary} />
            <Text style={styles.testButtonText}>Send Test Notification</Text>
          </TouchableOpacity>
        </View>

        {/* Debug Info (Development only) */}
        {__DEV__ && pushToken && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Debug Information</Text>
            <View style={styles.debugCard}>
              <Text style={styles.debugLabel}>Push Token:</Text>
              <Text style={styles.debugValue} numberOfLines={2}>
                {pushToken}
              </Text>
            </View>
          </View>
        )}

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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 34,
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  statusCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusInfo: {
    flex: 1,
    marginLeft: 16,
  },
  statusText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  statusSubtext: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  enableButton: {
    backgroundColor: colors.accentPositive,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  enableButtonText: {
    color: colors.bgPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  scheduledInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  scheduledText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  clearLink: {
    color: colors.accentData,
    fontSize: 14,
    fontWeight: '500',
  },
  settingsCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  settingDescription: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentDataBg,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.accentData,
  },
  testButtonText: {
    color: colors.accentData,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  debugCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  debugLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '600',
  },
  debugValue: {
    color: colors.textPrimary,
    fontSize: 10,
    fontFamily: 'monospace',
  },
});

export default NotificationSettings;

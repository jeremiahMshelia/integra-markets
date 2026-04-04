import * as Notifications from 'expo-notifications';
import { Platform, Alert, Linking } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configure how notifications are handled when the app is running
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch (e) {
  console.warn('[Notifications] Failed to set handler:', e);
}

// Set up iOS notification categories for better Settings integration
if (Platform.OS === 'ios') {
  try {
    Notifications.setNotificationCategoryAsync('MARKET_ALERT', [
      {
        identifier: 'VIEW_DETAILS',
        buttonTitle: 'View Details',
        options: {
          opensAppToForeground: true,
        },
      },
      {
        identifier: 'DISMISS',
        buttonTitle: 'Dismiss',
        options: {
          isDestructive: true,
        },
      },
    ]);

    Notifications.setNotificationCategoryAsync('BREAKING_NEWS', [
      {
        identifier: 'READ_MORE',
        buttonTitle: 'Read More',
        options: {
          opensAppToForeground: true,
        },
      },
      {
        identifier: 'SHARE',
        buttonTitle: 'Share',
        options: {
          opensAppToForeground: false,
        },
      },
    ]);
  } catch (e) {
    console.warn('[Notifications] Failed to set categories:', e);
  }
}

// Keys for storing notification preferences
const NOTIFICATION_SETTINGS_KEY = '@notification_settings';
const PUSH_TOKEN_KEY = '@push_token';

// Default notification settings
const defaultNotificationSettings = {
  pushNotifications: true,
  emailAlerts: false,
  marketAlerts: true,
  breakingNews: true,
  priceAlerts: true,
  weekendUpdates: false,
  soundEnabled: true,
  vibrationEnabled: true,
};

// Helper: robustly determine if notifications are effectively enabled on iOS
const isPermEnabled = (perm) => {
  try {
    const iosStatus = perm?.ios?.status;
    const IOS = Notifications?.IosAuthorizationStatus || {};
    return (
      !!perm?.granted ||
      iosStatus === IOS?.PROVISIONAL ||
      iosStatus === IOS?.EPHEMERAL ||
      perm?.ios?.allowsAlert === true
    );
  } catch (_e) {
    return !!perm?.granted;
  }
};

/**
 * Register for push notifications and get push token
 */
export async function registerForPushNotificationsAsync(options = {}) {
  let token;
  const silent = !!(options && options.silent);

  try {
    // Set up notification channel for Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4ECCA3',
        sound: true,
      });

      // Create additional channels for different notification types
      await Notifications.setNotificationChannelAsync('market-alerts', {
        name: 'Market Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#F05454',
        sound: 'market_alert.wav',
      });

      await Notifications.setNotificationChannelAsync('breaking-news', {
        name: 'Breaking News',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#30A5FF',
        sound: 'breaking_news.wav',
      });
    }

    // Check existing permission status
    console.log('[Push] Step 1: Checking notification permissions...');
    const perm0 = await Notifications.getPermissionsAsync();
    let finalEnabled = isPermEnabled(perm0);
    console.log('[Push] Permission status:', finalEnabled ? 'GRANTED' : 'NOT GRANTED', JSON.stringify(perm0.status));

    // Request permission if not already granted
    if (!finalEnabled) {
      console.log('[Push] Step 2: Requesting notification permissions...');
      const perm1 = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true, allowProvisional: true } });
      finalEnabled = isPermEnabled(perm1);
      console.log('[Push] Permission after request:', finalEnabled ? 'GRANTED' : 'DENIED');
    }

    // If permission not granted, show user-friendly message
    if (!finalEnabled) {
      console.log('[Push] ❌ Notifications not permitted — aborting token registration');
      if (!silent) {
        Alert.alert('Notifications Disabled', 'Enable notifications in settings to receive market alerts');
      }
      return null;
    }

    // Get push token
    console.log('[Push] Step 3: Getting Expo push token...');
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId || Constants?.expoConfig?.projectId;
    console.log('[Push] Project ID:', projectId || 'none (will use default)');

    try {
      token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
      console.log('[Push] ✅ Got push token:', token?.data);
    } catch (tokenError) {
      console.error('[Push] ❌ Failed to get push token:', tokenError.message);
      console.log('[Push] This is expected on simulators. Push tokens only work on real devices.');
      return null;
    }

    // Store the token locally
    if (token?.data) {
      await AsyncStorage.setItem(PUSH_TOKEN_KEY, token.data);
      console.log('[Push] Token saved to AsyncStorage');
    }

    // Register token with backend if user is authenticated
    try {
      const authToken = await AsyncStorage.getItem('@auth_token');
      if (authToken) {
        const { api } = require('./api');
        api.setAuthToken(authToken);
        await api.post('/notifications/register-token', {
          token: token.data,
          device_type: Platform.OS
        });
        console.log('[Push] ✅ Token registered with backend API');
      } else {
        console.log('[Push] No auth token yet — skipping backend registration');
      }
    } catch (error) {
      console.error('[Push] ⚠️ Backend registration failed:', error.message);
    }

    // Also register token directly in Supabase push_tokens table
    // (used by the background notification scheduler)
    try {
      const { supabaseService } = require('./supabaseService');
      const result = await supabaseService.registerPushToken(token.data, Platform.OS);
      if (result.success) {
        if (result.local) {
          console.log('[Push] ⚠️ Token saved locally only (no user session yet)');
        } else {
          console.log('[Push] ✅ Token registered in Supabase push_tokens table!');
        }
      } else {
        console.error('[Push] ❌ Supabase registration failed:', result.error);
      }
    } catch (error) {
      console.error('[Push] ❌ Supabase registration error:', error.message);
    }

    console.log('[Push] ✅ Push notification setup complete. Token:', token?.data?.substring(0, 25) + '...');
    return token?.data ?? null;

  } catch (error) {
    console.error('[Push] ❌ Fatal error during push setup:', error.message);
    if (!silent) {
      Alert.alert('Notification Error', 'Failed to setup push notifications');
    }
    return null;
  }
}

/**
 * Get current notification settings
 */
export async function getNotificationSettings() {
  try {
    const settings = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    const parsedSettings = settings ? JSON.parse(settings) : defaultNotificationSettings;

    const perm = await Notifications.getPermissionsAsync();
    const hasPermission = isPermEnabled(perm);

    // Update pushNotifications based on actual permission status
    if (parsedSettings.pushNotifications !== hasPermission) {
      parsedSettings.pushNotifications = hasPermission;
      // Save the updated status
      await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(parsedSettings));
    }

    return parsedSettings;
  } catch (error) {
    console.error('Error getting notification settings:', error);
    return defaultNotificationSettings;
  }
}

/**
 * Save notification settings
 */
export async function saveNotificationSettings(settings) {
  try {
    await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
    Alert.alert('Settings Saved', 'Notification preferences updated');
    return true;
  } catch (error) {
    console.error('Error saving notification settings:', error);
    Alert.alert('Save Failed', 'Could not save notification settings');
    return false;
  }
}

/**
 * Get stored push token
 */
export async function getStoredPushToken() {
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  } catch (error) {
    console.error('Error getting stored push token:', error);
    return null;
  }
}

/**
 * Schedule a local notification
 */
export async function scheduleLocalNotification(title, body, data = {}, scheduledTime = null) {
  try {
    const settings = await getNotificationSettings();

    if (!settings.pushNotifications) {
      console.log('Push notifications disabled by user');
      return;
    }

    const notificationContent = {
      title,
      body,
      data,
      sound: settings.soundEnabled,
      vibrate: settings.vibrationEnabled ? [0, 250, 250, 250] : false,
    };

    let notificationId;
    if (scheduledTime) {
      // Schedule for later
      notificationId = await Notifications.scheduleNotificationAsync({
        content: notificationContent,
        trigger: { date: scheduledTime },
      });
    } else {
      // Show immediately
      notificationId = await Notifications.scheduleNotificationAsync({
        content: notificationContent,
        trigger: null,
      });
    }

    return notificationId;
  } catch (error) {
    console.error('Error scheduling local notification:', error);
    return null;
  }
}

/**
 * Cancel a scheduled notification
 */
export async function cancelNotification(notificationId) {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    return true;
  } catch (error) {
    console.error('Error canceling notification:', error);
    return false;
  }
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return true;
  } catch (error) {
    console.error('Error canceling all notifications:', error);
    return false;
  }
}

/**
 * Get all scheduled notifications
 */
export async function getScheduledNotifications() {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('Error getting scheduled notifications:', error);
    return [];
  }
}

// Set up notification listeners
let notificationListener;
let responseListener;

/**
 * Setup notification event listeners
 */
export function setupNotificationListeners(onNotificationReceived, onNotificationResponse) {
  // Listener for notifications received while app is running
  notificationListener = Notifications.addNotificationReceivedListener(notification => {
    console.log('Notification received:', notification);

    if (onNotificationReceived) {
      try {
        onNotificationReceived(notification);
      } catch (callbackError) {
        console.error('Error in notification received callback:', callbackError);
      }
    }
  });

  // Listener for when user taps on notification
  responseListener = Notifications.addNotificationResponseReceivedListener(response => {
    console.log('Notification response received:', response);

    if (onNotificationResponse) {
      try {
        onNotificationResponse(response);
      } catch (callbackError) {
        console.error('Error in notification response callback:', callbackError);
      }
    }
  });

  return { notificationListener, responseListener };
}

/**
 * Remove notification event listeners
 */
export function removeNotificationListeners() {
  if (notificationListener) {
    Notifications.removeNotificationSubscription(notificationListener);
  }
  if (responseListener) {
    Notifications.removeNotificationSubscription(responseListener);
  }
}

/**
 * Send notification for market alert
 */
export async function sendMarketAlert(commodity, change, price) {
  const settings = await getNotificationSettings();

  if (!settings.marketAlerts || !settings.pushNotifications) {
    return;
  }

  const title = `${commodity} Alert`;
  const body = `Price ${change > 0 ? 'increased' : 'decreased'} to $${price}`;

  return await scheduleLocalNotification(title, body, {
    type: 'market_alert',
    commodity,
    change,
    price,
  });
}

/**
 * Send notification for breaking news
 */
export async function sendBreakingNewsAlert(headline, source) {
  const settings = await getNotificationSettings();

  if (!settings.breakingNews || !settings.pushNotifications) {
    return;
  }

  const title = 'Breaking News';
  const body = headline;

  return await scheduleLocalNotification(title, body, {
    type: 'breaking_news',
    source,
  });
}

/**
 * Check if push notifications are enabled in iOS settings
 */
export async function checkNotificationPermissions() {
  try {
    const perm = await Notifications.getPermissionsAsync();
    return isPermEnabled(perm);
  } catch (error) {
    console.error('Error checking notification permissions:', error);
    return false;
  }
}

export default {
  registerForPushNotificationsAsync,
  getNotificationSettings,
  saveNotificationSettings,
  getStoredPushToken,
  scheduleLocalNotification,
  cancelNotification,
  cancelAllNotifications,
  getScheduledNotifications,
  setupNotificationListeners,
  removeNotificationListeners,
  sendMarketAlert,
  sendBreakingNewsAlert,
  checkNotificationPermissions,
};

/**
 * Open the system settings page for this app
 */
export async function openSystemSettings() {
  try {
    if (typeof Linking.openSettings === 'function') {
      await Linking.openSettings();
      return;
    }
    if (Platform.OS === 'ios') {
      const can = await Linking.canOpenURL('app-settings:');
      if (can) {
        await Linking.openURL('app-settings:');
        return;
      }
    }
  } catch (e) {
    try {
      if (Platform.OS === 'ios') {
        await Linking.openURL('app-settings:');
        return;
      }
    } catch (e2) {
      console.warn('Unable to open settings', e2);
    }
  }
}

/**
 * Ensure push notifications are enabled: request permission if needed,
 * and if still disabled, open Settings. Returns boolean enabled.
 */
export async function ensurePushEnabled() {
  const enabled0 = await checkNotificationPermissions();
  if (enabled0) return true;
  await registerForPushNotificationsAsync({ silent: true });
  const enabled1 = await checkNotificationPermissions();
  if (enabled1) return true;
  await openSystemSettings();
  // We cannot know result immediately; caller may re-check later
  return false;
}

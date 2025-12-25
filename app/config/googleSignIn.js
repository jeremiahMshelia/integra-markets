/**
 * Google Sign-In Configuration
 * 
 * To set up Google Sign-In:
 * 
 * 1. Go to https://console.cloud.google.com/
 * 2. Create a new project or select existing one
 * 3. Enable Google Sign-In API
 * 4. Create OAuth 2.0 credentials:
 *    - iOS: Create an iOS OAuth client ID (Bundle ID: com.centori.integramarkets)
 *    - Android: Create an Android OAuth client ID (Package: com.centori.integramarkets)
 *    - Web: Create a Web OAuth client ID (needed for ID tokens)
 * 
 * 5. For iOS:
 *    - Add the reversed client ID to your app's URL schemes
 *    - This is already configured in app.json plugins
 * 
 * 6. For Android:
 *    - Add your SHA-1 fingerprint to the Android OAuth client
 *    - Get SHA-1 with: keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey
 */

import Constants from 'expo-constants';

// Get config from Expo constants (reads from app.json extra or environment)
const extra = Constants.expoConfig?.extra || {};

export const googleSignInConfig = {
  // iOS OAuth client ID from Google Cloud Console
  iosClientId: extra.googleIosClientId || process.env.GOOGLE_IOS_CLIENT_ID || '',

  // Android OAuth client ID from Google Cloud Console
  androidClientId: extra.googleAndroidClientId || process.env.GOOGLE_ANDROID_CLIENT_ID || '',

  // Web OAuth client ID (needed for getting ID tokens)
  webClientId: extra.googleWebClientId || process.env.GOOGLE_WEB_CLIENT_ID || '',

  // Scopes to request from Google
  scopes: ['profile', 'email'],

  // Request offline access for refresh tokens
  offlineAccess: true,

  // Force account selection even if only one account
  forceCodeForRefreshToken: true,
};

// Helper to check if Google Sign-In is properly configured
export const isGoogleSignInConfigured = () => {
  const hasIosId = googleSignInConfig.iosClientId &&
    googleSignInConfig.iosClientId.length > 10 &&
    googleSignInConfig.iosClientId.includes('.apps.googleusercontent.com');
  const hasWebId = googleSignInConfig.webClientId &&
    googleSignInConfig.webClientId.length > 10 &&
    googleSignInConfig.webClientId.includes('.apps.googleusercontent.com');

  // For iOS, we need both iOS and Web client IDs
  return hasIosId && hasWebId;
};

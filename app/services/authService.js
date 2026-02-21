/**
 * Authentication Service
 * Handles Google and Apple Sign-In with Supabase
 */
// Safe imports with fallbacks to prevent crashes
let WebBrowser, AuthSession, AppleAuthentication, supabase, GoogleSignin;

try {
    WebBrowser = require('expo-web-browser');
} catch (e) {
    console.warn('expo-web-browser not available');
    WebBrowser = { maybeCompleteAuthSession: () => { }, openAuthSessionAsync: () => Promise.resolve({ type: 'cancel' }) };
}

try {
    AuthSession = require('expo-auth-session');
} catch (e) {
    console.warn('expo-auth-session not available');
    AuthSession = { makeRedirectUri: () => '', parseRedirectUrl: () => ({}) };
}

// Native Google Sign-In
try {
    const GoogleSignInModule = require('@react-native-google-signin/google-signin');
    GoogleSignin = GoogleSignInModule.GoogleSignin;
} catch (e) {
    console.warn('Native Google Sign-In not available, will use OAuth fallback');
    GoogleSignin = null;
}

// Apple Authentication removed to avoid provisioning profile issues

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { googleSignInConfig, isGoogleSignInConfigured } from '../config/googleSignIn';

try {
    const supabaseImport = require('../../lib/supabase');
    supabase = supabaseImport.supabase;
} catch (e) {
    console.warn('Supabase not available, using mock');
    supabase = {
        auth: {
            signInWithOAuth: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
            signInWithIdToken: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
            signInWithPassword: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
            signUp: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
            signOut: () => Promise.resolve({ error: null }),
            getSession: () => Promise.resolve({ data: { session: null }, error: null })
        }
    };
}

let api;
try {
    const apiImport = require('./apiClient');
    api = apiImport.api;
} catch (e) {
    console.log('API client not available (expected in development)');
    api = { get: () => Promise.reject(new Error('API not available')) };
}

// Complete auth session for web
WebBrowser.maybeCompleteAuthSession();

// Constants
const AUTH_TOKEN_KEY = '@auth_token';
const USER_DATA_KEY = '@user_data';

class AuthService {
    constructor() {
        this.currentUser = null;
        this.authToken = null;
        this.googleSignInConfigured = false;
    }

    /**
     * Initialize auth service and check stored session
     */
    async initialize() {
        try {
            // Configure Google Sign-In if available
            await this.configureGoogleSignIn();

            // Check for stored auth token
            const storedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
            const storedUser = await AsyncStorage.getItem(USER_DATA_KEY);

            if (storedToken && storedUser) {
                this.authToken = storedToken;
                this.currentUser = JSON.parse(storedUser);

                // Validate token with backend
                await this.validateToken();
            }

            return this.currentUser;
        } catch (error) {
            console.error('Auth initialization error:', error);
            return null;
        }
    }

    /**
     * Configure Google Sign-In
     */
    async configureGoogleSignIn() {
        if (!GoogleSignin) return;

        // Check if config has valid client IDs
        if (!isGoogleSignInConfigured()) {
            console.warn('Google Sign-In not configured: Missing client IDs in config/googleSignIn.js');
            this.googleSignInConfigured = false;
            return;
        }

        try {
            await GoogleSignin.configure({
                iosClientId: googleSignInConfig.iosClientId,
                androidClientId: googleSignInConfig.androidClientId,
                webClientId: googleSignInConfig.webClientId,
                offlineAccess: googleSignInConfig.offlineAccess,
                scopes: googleSignInConfig.scopes,
                forceCodeForRefreshToken: googleSignInConfig.forceCodeForRefreshToken,
            });
            this.googleSignInConfigured = true;
            console.log('Google Sign-In configured successfully');
        } catch (error) {
            console.warn('Failed to configure Google Sign-In:', error);
            this.googleSignInConfigured = false;
        }
    }

    /**
     * Sign in with Google using native SDK (with OAuth fallback)
     */
    async signInWithGoogle() {
        try {
            // Try native Google Sign-In first if configured
            if (GoogleSignin && this.googleSignInConfigured) {
                try {
                    // Check if device has Google Play Services (Android)
                    if (Platform.OS === 'android') {
                        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
                    }

                    // Sign in with Google
                    const userInfo = await GoogleSignin.signIn();

                    if (userInfo && userInfo.user) {
                        // Create user object from Google sign-in
                        const googleUser = {
                            id: userInfo.user.id,
                            email: userInfo.user.email,
                            full_name: userInfo.user.name || userInfo.user.givenName + ' ' + userInfo.user.familyName,
                            fullName: userInfo.user.name || userInfo.user.givenName + ' ' + userInfo.user.familyName,
                            avatar: userInfo.user.photo,
                            provider: 'google',
                            idToken: userInfo.idToken,
                        };

                        // Try to authenticate with Supabase using the ID token
                        if (supabase && userInfo.idToken) {
                            try {
                                const { data, error } = await supabase.auth.signInWithIdToken({
                                    provider: 'google',
                                    token: userInfo.idToken,
                                });

                                if (data?.session) {
                                    await this.handleAuthSuccess(data.session);
                                    return { success: true, user: this.currentUser };
                                }
                            } catch (supabaseError) {
                                console.warn('Supabase authentication failed, using local auth:', supabaseError);
                            }
                        }

                        // Store user data locally even if Supabase fails
                        this.currentUser = googleUser;
                        await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(googleUser));
                        await AsyncStorage.setItem(AUTH_TOKEN_KEY, userInfo.idToken || 'google_token_' + Date.now());

                        return { success: true, user: googleUser };
                    }
                } catch (nativeError) {
                    console.warn('Native Google Sign-In failed, trying OAuth fallback:', nativeError);
                    // Fall through to OAuth method
                }
            }

            // Fallback to OAuth flow if native sign-in is not available
            if (supabase && AuthSession && WebBrowser) {
                // Build redirect URI using the correct scheme from app.json
                const redirectUri = AuthSession.makeRedirectUri({
                    scheme: 'com.centori.integramarkets',
                    path: 'auth/callback'
                });

                console.log('[Auth] OAuth redirect URI:', redirectUri);

                // Use Supabase OAuth for Google
                const { data, error } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: redirectUri,
                        queryParams: {
                            access_type: 'offline',
                            prompt: 'consent',
                        },
                        skipBrowserRedirect: true, // We handle the browser ourselves
                    }
                });

                if (error) {
                    console.error('[Auth] OAuth signInWithOAuth error:', error.message);
                }

                if (!error && data?.url) {
                    console.log('[Auth] Opening browser for OAuth...');
                    const result = await WebBrowser.openAuthSessionAsync(
                        data.url,
                        redirectUri
                    );

                    console.log('[Auth] Browser result type:', result.type);

                    if (result.type === 'success' && result.url) {
                        console.log('[Auth] Got redirect URL, parsing tokens...');
                        // Parse tokens from URL fragment (Supabase returns them in hash)
                        const url = result.url;
                        const hashPart = url.includes('#') ? url.split('#')[1] : '';
                        const queryPart = url.includes('?') ? url.split('?')[1]?.split('#')[0] : '';

                        const params = new URLSearchParams(hashPart || queryPart);
                        const accessToken = params.get('access_token');
                        const refreshToken = params.get('refresh_token');

                        if (accessToken) {
                            // Set the session using the tokens from the redirect
                            const { data: tokenSessionData, error: tokenSessionError } = await supabase.auth.setSession({
                                access_token: accessToken,
                                refresh_token: refreshToken || '',
                            });

                            if (!tokenSessionError && tokenSessionData?.session) {
                                await this.handleAuthSuccess(tokenSessionData.session);
                                return { success: true, user: this.currentUser };
                            }
                            console.warn('[Auth] setSession failed:', tokenSessionError?.message);
                        }

                        // Fallback: try getting session directly
                        const { data: fallbackSession, error: fallbackError } = await supabase.auth.getSession();
                        if (!fallbackError && fallbackSession?.session) {
                            await this.handleAuthSuccess(fallbackSession.session);
                            return { success: true, user: this.currentUser };
                        }
                    } else if (result.type === 'cancel' || result.type === 'dismiss') {
                        return { success: false, error: 'Sign in was cancelled' };
                    }
                } else {
                    console.warn('[Auth] No OAuth URL returned. Data:', JSON.stringify(data));
                }
            }

            // No mock fallback - Google sign-in not available
            console.log('Google sign-in not available - OAuth not configured');
            return {
                success: false,
                error: 'Google sign-in is not available. Please use email login or check your configuration.'
            };

        } catch (error) {
            console.error('Google sign-in error:', error);
            return { success: false, error: error.message };
        }
    }

    // Apple Sign-In removed to eliminate provisioning profile dependencies

    /**
     * Sign in with email and password
     */
    async signInWithEmail(email, password) {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            if (data?.session) {
                await this.handleAuthSuccess(data.session);
                return { success: true, user: this.currentUser };
            }

            return { success: false, error: 'Failed to sign in' };
        } catch (error) {
            console.error('Email sign-in error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Sign up with email and password
     */
    async signUpWithEmail(email, password, fullName) {
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName,
                    }
                }
            });

            if (error) throw error;

            if (data?.session) {
                await this.handleAuthSuccess(data.session);
                return { success: true, user: this.currentUser };
            }

            // If email confirmation is required
            if (data?.user && !data.session) {
                return {
                    success: true,
                    requiresConfirmation: true,
                    message: 'Please check your email to confirm your account'
                };
            }

            return { success: false, error: 'Failed to sign up' };
        } catch (error) {
            console.error('Email sign-up error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle successful authentication
     */
    async handleAuthSuccess(session) {
        try {
            // Store auth token
            this.authToken = session.access_token;
            await AsyncStorage.setItem(AUTH_TOKEN_KEY, this.authToken);

            // Get user data from Supabase
            const { data: { user }, error } = await supabase.auth.getUser();

            if (error) throw error;

            // Create user object
            this.currentUser = {
                id: user.id,
                email: user.email,
                fullName: user.user_metadata?.full_name || user.email.split('@')[0],
                avatar: user.user_metadata?.avatar_url,
                provider: user.app_metadata?.provider || 'email',
            };

            // Store user data
            await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(this.currentUser));

            // Set user ID in supabaseService for database operations
            try {
                const { supabaseService } = require('./supabaseService');
                supabaseService.setUserId(user.id);
            } catch (e) {
                console.log('supabaseService not available');
            }

            // Register/update user in our backend
            await this.syncUserWithBackend();

            // Register push token if available
            await this.registerPushToken();
        } catch (error) {
            console.error('Error handling auth success:', error);
            throw error;
        }
    }

    /**
     * Sync user data with our backend
     */
    async syncUserWithBackend() {
        try {
            // Set auth header for API calls
            api.setAuthToken(this.authToken);

            // Check if user exists in our backend
            const response = await api.get('/auth/me');

            if (response.status === 404) {
                // Create user in our backend
                await api.post('/auth/sync', {
                    email: this.currentUser.email,
                    full_name: this.currentUser.fullName,
                    supabase_uid: this.currentUser.id,
                });
            }
        } catch (error) {
            console.error('Error syncing user with backend:', error);
        }
    }

    /**
     * Register push notification token
     */
    async registerPushToken() {
        try {
            const pushToken = await AsyncStorage.getItem('@push_token');
            if (pushToken && this.authToken) {
                await api.post('/notifications/register-token', {
                    token: pushToken,
                    device_type: Platform.OS,
                });
            }
        } catch (error) {
            console.error('Error registering push token:', error);
        }
    }

    /**
     * Validate stored token - be lenient to keep users logged in
     */
    async validateToken() {
        try {
            const { data: { session }, error } = await supabase.auth.getSession();

            if (session) {
                // Session is valid, update token if refreshed
                if (session.access_token !== this.authToken) {
                    this.authToken = session.access_token;
                    await AsyncStorage.setItem(AUTH_TOKEN_KEY, this.authToken);
                }
                return true;
            }

            // No session found - try to refresh it before giving up
            if (!session) {
                console.log('[Auth] No active session, attempting refresh...');
                const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

                if (refreshData?.session) {
                    console.log('[Auth] Session refreshed successfully');
                    this.authToken = refreshData.session.access_token;
                    await AsyncStorage.setItem(AUTH_TOKEN_KEY, this.authToken);
                    return true;
                }

                // Refresh failed - but DON'T sign out immediately
                // The stored user data in AsyncStorage is still valid for showing the UI
                // The user will be prompted to re-auth only when they try an action that requires it
                console.warn('[Auth] Session refresh failed:', refreshError?.message || 'unknown');
                console.log('[Auth] Keeping stored user data to avoid unnecessary logout');
                return false;
            }

            return true;
        } catch (error) {
            // Network errors, cold start timing issues, etc.
            // DON'T sign out - keep the user logged in with stored data
            console.error('[Auth] Token validation error (keeping user logged in):', error.message);
            return false;
        }
    }

    /**
     * Sign out the current user
     */
    async signOut() {
        try {
            // Sign out from Google if signed in
            if (GoogleSignin && this.googleSignInConfigured) {
                try {
                    const isSignedIn = await GoogleSignin.isSignedIn();
                    if (isSignedIn) {
                        await GoogleSignin.signOut();
                    }
                } catch (googleError) {
                    console.warn('Google sign-out error:', googleError);
                }
            }

            // Sign out from Supabase
            if (supabase) {
                await supabase.auth.signOut();
            }

            // Clear stored data
            await AsyncStorage.multiRemove([AUTH_TOKEN_KEY, USER_DATA_KEY]);

            // Clear instance data
            this.currentUser = null;
            this.authToken = null;

            // Clear API token
            if (api) {
                api.setAuthToken(null);
            }

            return { success: true };
        } catch (error) {
            console.error('Sign out error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get current user
     */
    getCurrentUser() {
        return this.currentUser;
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return !!this.currentUser && !!this.authToken;
    }

    /**
     * Get auth token
     */
    getAuthToken() {
        return this.authToken;
    }
}

// Export singleton instance
export const authService = new AuthService();

// Export convenience functions
export const signInWithGoogle = () => authService.signInWithGoogle();
export const signInWithEmail = (email, password) => authService.signInWithEmail(email, password);
export const signUpWithEmail = (email, password, fullName) => authService.signUpWithEmail(email, password, fullName);
export const signOut = () => authService.signOut();
export const getCurrentUser = () => authService.getCurrentUser();
export const isAuthenticated = () => authService.isAuthenticated();

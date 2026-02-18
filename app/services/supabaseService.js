/**
 * Supabase Database Service
 * Handles all database operations for the app
 */

import { supabase } from '../../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

class SupabaseService {
    constructor() {
        this.currentUserId = null;
        this.supabase = supabase; // Expose supabase client
    }

    /**
     * Set the current user ID (called after auth)
     */
    setUserId(userId) {
        this.currentUserId = userId;
        console.log('[SupabaseService] User ID set:', userId);
    }

    /**
     * Get the current user ID from Supabase session
     */
    async getCurrentUserId() {
        if (this.currentUserId) return this.currentUserId;

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.id) {
                this.currentUserId = session.user.id;
                return this.currentUserId;
            }
        } catch (error) {
            console.error('[SupabaseService] Error getting user ID:', error);
        }
        return null;
    }

    // ==========================================
    // USER PROFILE
    // ==========================================

    /**
     * Get user profile from database
     * @param {string} userId - Optional user ID. If not provided, uses current session user.
     */
    async getProfile(userId = null) {
        try {
            const targetUserId = userId || await this.getCurrentUserId();
            if (!targetUserId) {
                console.log('[SupabaseService] No user ID, returning null profile');
                return null;
            }

            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', targetUserId)
                .single();

            if (error) {
                console.error('[SupabaseService] Error fetching profile:', error);
                return null;
            }

            console.log('[SupabaseService] Profile fetched:', data?.email);
            return data;
        } catch (error) {
            console.error('[SupabaseService] getProfile error:', error);
            return null;
        }
    }

    /**
     * Update user profile
     */
    async updateProfile(updates) {
        try {
            const userId = await this.getCurrentUserId();
            if (!userId) {
                console.error('[SupabaseService] No user ID for profile update');
                return { success: false, error: 'Not authenticated' };
            }

            const { data, error } = await supabase
                .from('profiles')
                .upsert({
                    id: userId,
                    ...updates,
                    updated_at: new Date().toISOString(),
                })
                .select()
                .single();

            if (error) {
                console.error('[SupabaseService] Error updating profile:', error);
                return { success: false, error: error.message };
            }

            console.log('[SupabaseService] Profile updated');
            return { success: true, data };
        } catch (error) {
            console.error('[SupabaseService] updateProfile error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Upload avatar image
     */
    async uploadAvatar(imageUri) {
        try {
            const userId = await this.getCurrentUserId();
            if (!userId) {
                return { success: false, error: 'Not authenticated' };
            }

            // First, delete any existing avatars for this user
            try {
                const { data: existingFiles } = await supabase.storage
                    .from('avatars')
                    .list(userId);

                if (existingFiles && existingFiles.length > 0) {
                    const filesToDelete = existingFiles.map(file => `${userId}/${file.name}`);
                    await supabase.storage
                        .from('avatars')
                        .remove(filesToDelete);
                    console.log('[SupabaseService] Deleted old avatars:', filesToDelete.length);
                }
            } catch (deleteError) {
                console.log('[SupabaseService] No existing avatars to delete or error:', deleteError);
            }

            // Read the file as base64 - this works reliably in React Native
            const response = await fetch(imageUri);
            const arrayBuffer = await response.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            const fileName = `${userId}/avatar-${Date.now()}.jpg`;

            const { data, error } = await supabase.storage
                .from('avatars')
                .upload(fileName, uint8Array, {
                    contentType: 'image/jpeg',
                    upsert: true,
                });

            if (error) {
                console.error('[SupabaseService] Error uploading avatar:', error);
                return { success: false, error: error.message };
            }

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(fileName);

            // Update profile with new avatar URL
            await this.updateProfile({ avatar_url: publicUrl });

            console.log('[SupabaseService] Avatar uploaded:', publicUrl);
            return { success: true, url: publicUrl };
        } catch (error) {
            console.error('[SupabaseService] uploadAvatar error:', error);
            return { success: false, error: error.message };
        }
    }

    // ==========================================
    // ALERT PREFERENCES
    // ==========================================

    /**
     * Get user's alert preferences
     */
    async getAlertPreferences() {
        try {
            const userId = await this.getCurrentUserId();
            if (!userId) {
                // Fallback to AsyncStorage for non-authenticated users
                const stored = await AsyncStorage.getItem('alert_preferences');
                return stored ? JSON.parse(stored) : null;
            }

            const { data, error } = await supabase
                .from('alert_preferences')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
                console.error('[SupabaseService] Error fetching alert preferences:', error);
                return null;
            }

            console.log('[SupabaseService] Alert preferences fetched');
            return data;
        } catch (error) {
            console.error('[SupabaseService] getAlertPreferences error:', error);
            return null;
        }
    }

    /**
     * Save user's alert preferences
     */
    async saveAlertPreferences(preferences) {
        try {
            const userId = await this.getCurrentUserId();

            // Always save to AsyncStorage as backup
            await AsyncStorage.setItem('alert_preferences', JSON.stringify(preferences));

            if (!userId) {
                console.log('[SupabaseService] No user ID, saved preferences to AsyncStorage only');
                return { success: true, local: true };
            }

            const { data, error } = await supabase
                .from('alert_preferences')
                .upsert({
                    user_id: userId,
                    commodities: preferences.commodities || [],
                    regions: preferences.regions || [],
                    currencies: preferences.currencies || [],
                    keywords: preferences.keywords || [],
                    website_urls: preferences.websiteUrls || [],
                    alert_frequency: preferences.alertFrequency || 'Real-time',
                    alert_threshold: preferences.alertThreshold || 'Medium',
                    push_enabled: preferences.pushEnabled !== false,
                    email_enabled: preferences.emailEnabled || false,
                    onboarding_completed: true,
                    updated_at: new Date().toISOString(),
                }, {
                    onConflict: 'user_id',
                    ignoreDuplicates: false
                })
                .select()
                .single();

            if (error) {
                console.error('[SupabaseService] Error saving alert preferences:', error);
                return { success: false, error: error.message };
            }

            console.log('[SupabaseService] Alert preferences saved to database');
            return { success: true, data };
        } catch (error) {
            console.error('[SupabaseService] saveAlertPreferences error:', error);
            return { success: false, error: error.message };
        }
    }

    // ==========================================
    // SENTIMENT POLL VOTES
    // ==========================================

    /**
     * Submit a poll vote
     */
    async submitPollVote(articleId, articleTitle, vote) {
        try {
            const userId = await this.getCurrentUserId();
            if (!userId) {
                // Save locally for non-authenticated users
                const key = `poll_vote_${articleId}`;
                await AsyncStorage.setItem(key, vote);
                return { success: true, local: true };
            }

            const { data, error } = await supabase
                .from('sentiment_votes')
                .upsert({
                    user_id: userId,
                    article_id: articleId,
                    article_title: articleTitle,
                    vote: vote,
                    updated_at: new Date().toISOString(),
                })
                .select()
                .single();

            if (error) {
                console.error('[SupabaseService] Error submitting vote:', error);
                return { success: false, error: error.message };
            }

            console.log('[SupabaseService] Vote submitted:', vote);
            return { success: true, data };
        } catch (error) {
            console.error('[SupabaseService] submitPollVote error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get poll results for an article
     */
    async getPollResults(articleId) {
        try {
            // Use the database function we created
            const { data, error } = await supabase
                .rpc('get_poll_results', { p_article_id: articleId });

            if (error) {
                console.error('[SupabaseService] Error getting poll results:', error);
                return null;
            }

            if (data && data.length > 0) {
                const result = data[0];
                const total = Number(result.total_votes) || 0;
                return {
                    bullish: Number(result.bullish_count) || 0,
                    bearish: Number(result.bearish_count) || 0,
                    neutral: Number(result.neutral_count) || 0,
                    total: total,
                    bullishPercent: total > 0 ? Math.round((result.bullish_count / total) * 100) : 0,
                    bearishPercent: total > 0 ? Math.round((result.bearish_count / total) * 100) : 0,
                    neutralPercent: total > 0 ? Math.round((result.neutral_count / total) * 100) : 0,
                };
            }

            return {
                bullish: 0,
                bearish: 0,
                neutral: 0,
                total: 0,
                bullishPercent: 0,
                bearishPercent: 0,
                neutralPercent: 0
            };
        } catch (error) {
            console.error('[SupabaseService] getPollResults error:', error);
            return null;
        }
    }

    /**
     * Get user's vote for an article
     */
    async getUserVote(articleId) {
        try {
            const userId = await this.getCurrentUserId();
            if (!userId) {
                // Check local storage
                const key = `poll_vote_${articleId}`;
                return await AsyncStorage.getItem(key);
            }

            const { data, error } = await supabase
                .from('sentiment_votes')
                .select('vote')
                .eq('user_id', userId)
                .eq('article_id', articleId)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('[SupabaseService] Error getting user vote:', error);
                return null;
            }

            return data?.vote || null;
        } catch (error) {
            console.error('[SupabaseService] getUserVote error:', error);
            return null;
        }
    }

    // ==========================================
    // SAVED ANALYSES (BOOKMARKS)
    // ==========================================

    /**
     * Save an analysis
     */
    async saveAnalysis(analysis) {
        try {
            const userId = await this.getCurrentUserId();
            if (!userId) {
                // Save locally
                const stored = await AsyncStorage.getItem('saved_analyses');
                const analyses = stored ? JSON.parse(stored) : [];
                analyses.unshift({ ...analysis, id: Date.now().toString(), saved_at: new Date().toISOString() });
                await AsyncStorage.setItem('saved_analyses', JSON.stringify(analyses.slice(0, 50)));
                return { success: true, local: true };
            }

            const { data, error } = await supabase
                .from('saved_analyses')
                .insert({
                    user_id: userId,
                    title: analysis.title,
                    summary: analysis.summary,
                    source: analysis.source,
                    source_url: analysis.sourceUrl,
                    sentiment: analysis.sentiment,
                    sentiment_score: analysis.sentimentScore,
                    analysis_data: analysis,
                })
                .select()
                .single();

            if (error) {
                console.error('[SupabaseService] Error saving analysis:', error);
                return { success: false, error: error.message };
            }

            console.log('[SupabaseService] Analysis saved');
            return { success: true, data };
        } catch (error) {
            console.error('[SupabaseService] saveAnalysis error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get saved analyses
     */
    async getSavedAnalyses() {
        try {
            const userId = await this.getCurrentUserId();
            if (!userId) {
                const stored = await AsyncStorage.getItem('saved_analyses');
                return stored ? JSON.parse(stored) : [];
            }

            const { data, error } = await supabase
                .from('saved_analyses')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) {
                console.error('[SupabaseService] Error fetching saved analyses:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('[SupabaseService] getSavedAnalyses error:', error);
            return [];
        }
    }

    /**
     * Delete a saved analysis
     */
    async deleteAnalysis(analysisId) {
        try {
            const userId = await this.getCurrentUserId();
            if (!userId) {
                const stored = await AsyncStorage.getItem('saved_analyses');
                const analyses = stored ? JSON.parse(stored) : [];
                const filtered = analyses.filter(a => a.id !== analysisId);
                await AsyncStorage.setItem('saved_analyses', JSON.stringify(filtered));
                return { success: true };
            }

            const { error } = await supabase
                .from('saved_analyses')
                .delete()
                .eq('id', analysisId)
                .eq('user_id', userId);

            if (error) {
                console.error('[SupabaseService] Error deleting analysis:', error);
                return { success: false, error: error.message };
            }

            return { success: true };
        } catch (error) {
            console.error('[SupabaseService] deleteAnalysis error:', error);
            return { success: false, error: error.message };
        }
    }

    // ==========================================
    // PUSH TOKENS
    // ==========================================

    /**
     * Register push notification token
     */
    async registerPushToken(token, deviceType) {
        try {
            const userId = await this.getCurrentUserId();
            if (!userId) {
                // Save locally
                await AsyncStorage.setItem('@push_token', token);
                return { success: true, local: true };
            }

            const { error } = await supabase
                .from('push_tokens')
                .upsert({
                    user_id: userId,
                    expo_push_token: token,
                    device_type: deviceType,
                    is_active: true,
                    updated_at: new Date().toISOString(),
                }, {
                    onConflict: 'user_id',
                    ignoreDuplicates: false,
                });

            if (error) {
                console.error('[SupabaseService] Error registering push token:', error);
                return { success: false, error: error.message };
            }

            console.log('[SupabaseService] Push token registered');
            return { success: true };
        } catch (error) {
            console.error('[SupabaseService] registerPushToken error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Sign out the current user
     */
    async signOut() {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                console.error('[SupabaseService] Sign out error:', error);
                return { success: false, error: error.message };
            }
            this.currentUserId = null;
            console.log('[SupabaseService] User signed out');
            return { success: true };
        } catch (error) {
            console.error('[SupabaseService] signOut error:', error);
            return { success: false, error: error.message };
        }
    }
}

// Export singleton instance
export const supabaseService = new SupabaseService();
export default supabaseService;

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Get config from multiple sources (Expo constants, process.env, or direct)
const extra = Constants.expoConfig?.extra || {};

// Try multiple ways to get the Supabase URL
let supabaseUrl =
  extra.supabaseUrl ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://zhdcpiopihqwcmicjpca.supabase.co'; // Fallback

let supabaseAnonKey =
  extra.supabaseAnonKey ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoZGNwaW9waWhxd2NtaWNqcGNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NzA5OTcsImV4cCI6MjA4MjI0Njk5N30.0cY0mfJbRMmMuPnAH4kkxlZzlhgT0gt-RFl3ky40vfw'; // Fallback

// Clean the URL if it starts with $ (env var placeholder)
if (supabaseUrl.startsWith('$')) {
  supabaseUrl = 'https://zhdcpiopihqwcmicjpca.supabase.co';
}
if (supabaseAnonKey.startsWith('$')) {
  supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoZGNwaW9waWhxd2NtaWNqcGNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NzA5OTcsImV4cCI6MjA4MjI0Njk5N30.0cY0mfJbRMmMuPnAH4kkxlZzlhgT0gt-RFl3ky40vfw';
}

// Debug logging
console.log('[Supabase] URL:', supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'NOT SET');
console.log('[Supabase] Key present:', !!supabaseAnonKey && supabaseAnonKey.length > 10);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Test connection
supabase.auth.getSession().then(({ data, error }) => {
  if (error) {
    console.error('[Supabase] Connection test failed:', error.message);
  } else {
    console.log('[Supabase] Connection successful, session:', data.session ? 'Active' : 'None');
  }
});

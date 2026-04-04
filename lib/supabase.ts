import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Get config from Expo constants or environment
const extra = Constants.expoConfig?.extra || {};

// Get Supabase URL and anon key from environment
// Anon key is public by design (it's safe to expose)
const supabaseUrl =
  extra.supabaseUrl ||
  process.env.EXPO_PUBLIC_SUPABASE_URL;

const supabaseAnonKey =
  extra.supabaseAnonKey ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Validate config
if (!supabaseUrl || supabaseUrl.startsWith('$')) {
  console.warn('[Supabase] Warning: EXPO_PUBLIC_SUPABASE_URL is not set. Using fallback.');
}
if (!supabaseAnonKey || supabaseAnonKey.startsWith('$')) {
  console.warn('[Supabase] Warning: EXPO_PUBLIC_SUPABASE_ANON_KEY is not set. Using fallback.');
}

// Debug logging (redacted for security)
console.log('[Supabase] URL:', supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'NOT SET');
console.log('[Supabase] Key present:', !!supabaseAnonKey && supabaseAnonKey.length > 10);

let finalUrl = supabaseUrl;
if (!finalUrl || finalUrl.startsWith('$')) {
  finalUrl = 'https://zhdcpiopihqwcmicjpca.supabase.co';
}

let finalKey = supabaseAnonKey;
if (!finalKey || finalKey.startsWith('$')) {
  finalKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoZGNwaW9waWhxd2NtaWNqcGNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NzA5OTcsImV4cCI6MjA4MjI0Njk5N30.0cY0mfJbRMmMuPnAH4kkxlZzlhgT0gt-RFl3ky40vfw';
}

export const supabase = createClient(finalUrl, finalKey, {
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

-- RLS FIXES FOR INTEGRA MARKETS
-- Run these in Supabase SQL Editor

-- =====================================================
-- FIX 1: alert_history INSERT policy
-- Problem: Current policy allows inserting alerts for ANY user
-- Fix: Only allow users to insert their own alerts
-- =====================================================

-- Drop the existing insecure policy
DROP POLICY IF EXISTS "Users can manage own alerts" ON alert_history;
DROP POLICY IF EXISTS "Insert own alerts" ON alert_history;
DROP POLICY IF EXISTS "Users can only insert their own alerts" ON alert_history;
DROP POLICY IF EXISTS "Users can view own alerts" ON alert_history;
DROP POLICY IF EXISTS "Users can update own alerts" ON alert_history;

-- Create secure policies
CREATE POLICY "Users can only insert their own alerts" ON alert_history
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own alerts" ON alert_history
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own alerts" ON alert_history
FOR UPDATE USING (auth.uid() = user_id);

-- =====================================================
-- FIX 2: push_tokens backend access
-- Problem: Backend can't read all push tokens due to RLS
-- Fix: Backend uses SERVICE_ROLE_KEY which bypasses RLS
-- =====================================================

DROP POLICY IF EXISTS "Users can view own push tokens" ON push_tokens;

CREATE POLICY "Users can view own push tokens" ON push_tokens
FOR SELECT USING (auth.uid() = user_id);

-- Service role automatically bypasses RLS - no policy needed

-- =====================================================
-- FIX 3: avatars storage policy
-- Problem: Any authenticated user can upload to ANY user's folder
-- Fix: Only allow users to upload to their own folder
-- =====================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can only upload to their own avatar folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can only view their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can only delete their own avatars" ON storage.objects;

-- Create secure policy: users can only upload to their own folder
CREATE POLICY "Users can only upload to their own avatar folder" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can only view their own avatars" ON storage.objects
FOR SELECT USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can only delete their own avatars" ON storage.objects
FOR DELETE USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- =====================================================
-- FIX 4: Add missing DELETE policies
-- =====================================================

DROP POLICY IF EXISTS "Users can delete own alert preferences" ON alert_preferences;
DROP POLICY IF EXISTS "Users can delete own votes" ON sentiment_votes;

CREATE POLICY "Users can delete own alert preferences" ON alert_preferences
FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own votes" ON sentiment_votes
FOR DELETE USING (auth.uid() = user_id);

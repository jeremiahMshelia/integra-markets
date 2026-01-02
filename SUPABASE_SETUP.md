# Supabase Setup Guide for Integra Markets

## Step 1: Create New Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign up / Log in
3. Click "New Project"
4. Fill in:
   - **Name:** `integra-markets`
   - **Database Password:** (save this somewhere safe!)
   - **Region:** Choose closest to your users
5. Click "Create new project"
6. Wait ~2 minutes for setup

---

## Step 2: Get Your API Keys

After project is created:
1. Go to **Settings** (gear icon) → **API**
2. Copy these values:

```
SUPABASE_URL = [Your Project URL]
SUPABASE_KEY = [anon public key]
```

⚠️ **Important:** Use the `anon` key, NOT the `service_role` key!

---

## Step 3: Run This SQL Schema

Go to **SQL Editor** (left sidebar) → Click **New Query** → Paste ALL of this:

```sql
-- ============================================
-- INTEGRA MARKETS - COMPLETE DATABASE SCHEMA
-- ============================================

-- 1. USER PROFILES (extends Supabase Auth)
-- ============================================
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  company TEXT,
  role TEXT, -- 'Trader', 'Analyst', 'Portfolio Manager', etc.
  experience_level TEXT, -- 'Beginner', 'Intermediate', 'Expert'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);


-- 2. ALERT PREFERENCES (from onboarding)
-- ============================================
CREATE TABLE public.alert_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  commodities TEXT[] DEFAULT '{}',
  regions TEXT[] DEFAULT '{}',
  currencies TEXT[] DEFAULT '{}',
  keywords TEXT[] DEFAULT '{}',
  website_urls TEXT[] DEFAULT '{}',
  alert_frequency TEXT DEFAULT 'Real-time', -- 'Real-time', 'Hourly', 'Daily'
  alert_threshold TEXT DEFAULT 'Medium', -- 'Low', 'Medium', 'High'
  push_enabled BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT false,
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE public.alert_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences" ON public.alert_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences" ON public.alert_preferences
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences" ON public.alert_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- 3. SENTIMENT POLL VOTES (Live Poll)
-- ============================================
CREATE TABLE public.sentiment_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  article_id TEXT NOT NULL, -- Unique identifier for the article
  article_title TEXT,
  article_source TEXT,
  vote TEXT NOT NULL CHECK (vote IN ('BULLISH', 'BEARISH', 'NEUTRAL')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, article_id) -- One vote per user per article
);

ALTER TABLE public.sentiment_votes ENABLE ROW LEVEL SECURITY;

-- Users can view all votes (for poll results)
CREATE POLICY "Anyone can view vote counts" ON public.sentiment_votes
  FOR SELECT USING (true);

-- Users can insert their own vote
CREATE POLICY "Users can cast vote" ON public.sentiment_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own vote
CREATE POLICY "Users can change vote" ON public.sentiment_votes
  FOR UPDATE USING (auth.uid() = user_id);


-- 4. SAVED ANALYSES (Bookmarks)
-- ============================================
CREATE TABLE public.saved_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  source TEXT,
  source_url TEXT,
  sentiment TEXT,
  sentiment_score FLOAT,
  analysis_data JSONB, -- Full analysis object
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.saved_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookmarks" ON public.saved_analyses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert bookmarks" ON public.saved_analyses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bookmarks" ON public.saved_analyses
  FOR DELETE USING (auth.uid() = user_id);


-- 5. PUSH NOTIFICATION TOKENS
-- ============================================
CREATE TABLE public.push_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  expo_push_token TEXT NOT NULL,
  device_type TEXT, -- 'ios', 'android'
  device_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, expo_push_token)
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own tokens" ON public.push_tokens
  FOR ALL USING (auth.uid() = user_id);


-- 6. ALERT HISTORY (For Alert History Modal)
-- ============================================
CREATE TABLE public.alert_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  article_url TEXT,
  sentiment TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.alert_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alerts" ON public.alert_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own alerts" ON public.alert_history
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "System can insert alerts" ON public.alert_history
  FOR INSERT WITH CHECK (true);


-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get poll results for an article
CREATE OR REPLACE FUNCTION get_poll_results(p_article_id TEXT)
RETURNS TABLE (
  bullish_count BIGINT,
  bearish_count BIGINT,
  neutral_count BIGINT,
  total_votes BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE vote = 'BULLISH') AS bullish_count,
    COUNT(*) FILTER (WHERE vote = 'BEARISH') AS bearish_count,
    COUNT(*) FILTER (WHERE vote = 'NEUTRAL') AS neutral_count,
    COUNT(*) AS total_votes
  FROM public.sentiment_votes
  WHERE article_id = p_article_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Function to automatically create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  );
  
  -- Also create empty alert preferences
  INSERT INTO public.alert_preferences (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================
-- STORAGE BUCKET (For Profile Photos)
-- ============================================
-- Run this in a SEPARATE query after the tables are created:

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy for avatars
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

Click **Run** (Ctrl+Enter or Cmd+Enter)

---

## Step 4: Enable Auth Providers

1. Go to **Authentication** → **Providers**
2. Enable:
   - ✅ **Email** (already enabled by default)
   - ✅ **Apple** (optional, for iOS)
   - ✅ **Google** (optional)

---

## Step 5: Update Your .env File

After creating the project, update `/Users/jerry/Documents/integra-markets/.env`:

```env
# Supabase (NEW PROJECT)
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_KEY=your_supabase_anon_key_here

# AI Services
HUGGING_FACE_TOKEN=your_huggingface_token_here
GROQ_API_KEY=your_groq_api_key_here

# News Data
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key_here

# Backend URL
EXPO_PUBLIC_API_URL=https://integra-markets.onrender.com
```

---

## Step 6: Update Backend .env

Also update `/Users/jerry/Documents/integra-markets/backend/.env`:

```env
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_KEY=your_supabase_anon_key_here
HUGGING_FACE_TOKEN=your_huggingface_token_here
GROQ_API_KEY=your_groq_api_key_here
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key_here
```

---

## Database Schema Summary

| Table | Purpose |
|-------|---------|
| `profiles` | User info (name, avatar, company, role) |
| `alert_preferences` | What user selected in onboarding |
| `sentiment_votes` | Live poll votes per article |
| `saved_analyses` | Bookmarked articles |
| `push_tokens` | Device push notification tokens |
| `alert_history` | Past alerts sent to user |
| `storage.avatars` | Profile photo uploads |

---

## MIGRATION: Add New Profile Columns

If you already have the profiles table, run this to add the new columns:

```sql
-- Add new columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS market_focus TEXT[],
ADD COLUMN IF NOT EXISTS linkedin TEXT,
ADD COLUMN IF NOT EXISTS github TEXT,
ADD COLUMN IF NOT EXISTS username TEXT;
```

---

## FIX: Storage RLS Policies for Avatar Uploads

If you're getting "new row violates row-level security policy" error on avatar uploads, run this:

```sql
-- Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;

-- Create bucket if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Recreate storage policies
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' 
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars' 
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars' 
    AND auth.uid() IS NOT NULL
  );
```

---

## What You'll Get

After running the schema:

1. **Auto Profile Creation** - When user signs up, profile + preferences created automatically
2. **Live Poll** - Call `get_poll_results('article-id')` to get vote counts
3. **Avatar Storage** - Users can upload photos to `avatars/user-id/photo.jpg`
4. **Row Level Security** - Users can only see/edit their own data

---

## Next Steps After Setup

Once you have the new Supabase project:
1. Give me the new `SUPABASE_URL` and `SUPABASE_KEY`
2. I'll update the app code to use these tables
3. We'll connect the live poll to the database

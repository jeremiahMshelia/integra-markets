# Quick Start Guide

## 🔑 Environment Variables You Need

Your `.env` file should have these variables (based on the keys you've set up):

```env
# Supabase
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-anon-key

# For Expo/React Native app
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_API_URL=https://integra-markets.onrender.com

# AI Services
HUGGING_FACE_TOKEN=your-hf-token
GROQ_API_KEY=your-groq-key
EXPO_PUBLIC_GROQ_API_KEY=your-groq-key
EXPO_PUBLIC_HUGGING_FACE_TOKEN=your-hf-token

# News
ALPHA_VANTAGE_API_KEY=your-alpha-vantage-key
```

## 🚀 Deploy Backend to Fix UptimeRobot

The backend needs to be redeployed with the HEAD method support for health checks.

### Option 1: If using Git with Render
```bash
cd /Users/jerry/Documents/integra-markets
git add backend/main.py
git commit -m "Add HEAD support to health endpoint for UptimeRobot"
git push origin main
```
Render will auto-deploy.

### Option 2: Manual Redeploy on Render
1. Go to https://dashboard.render.com
2. Find your `integra-markets` service
3. Click "Manual Deploy" → "Deploy latest commit"

## 🔧 UptimeRobot Setup

After deployment, update UptimeRobot:
1. Monitor Type: **HTTP(s)** (not HTTP(s) - Keyword)
2. URL: `https://integra-markets.onrender.com/health`
3. HTTP Method: **GET** (HEAD is now also supported)
4. Monitoring Interval: **5 minutes**

## 📱 Google Sign-In is Ready!

Since you've enabled Google in Supabase with Client ID/Secret:
- The app already uses Supabase OAuth for Google sign-in
- No additional code changes needed
- Just make sure your Supabase Google provider is configured with:
  - Client ID
  - Client Secret
  - Authorized redirect URI (Supabase provides this)

## ✅ What's Working Now

1. **Health endpoint** - Now supports HEAD + GET methods
2. **Google Sign-In** - Uses Supabase OAuth (configured in Supabase)
3. **API Keys** - Removed from all .md files
4. **Supabase** - Ready with new project

## 📋 Next Steps

1. [ ] Deploy backend to Render (git push or manual deploy)
2. [ ] Verify UptimeRobot shows "UP" status
3. [ ] Test Google Sign-In in the app
4. [ ] Test email/password signup

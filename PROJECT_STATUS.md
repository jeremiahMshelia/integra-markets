# Integra Markets - Project Status & Completion Plan

**Last Updated:** December 25, 2024

---

## 🎯 Current Status

### ✅ What's Working
- **Today Dashboard** - News feed with AI sentiment analysis
- **AI Analysis Overlay** - Full analysis with sentiment, drivers, trade ideas
- **Alerts Screen** - Real news based on user preferences
- **Profile Screen** - User settings & preferences
- **Tour Guide** - First-time user onboarding
- **Backend API** - Deployed on Render (with cold start issues)

### ⚠️ Issues to Fix
1. **Render Cold Start** - 10+ minute delay after inactivity
2. **Backend Files Missing** - No Q-learning/ML processor files exist
3. **Supabase Auth** - Not fully integrated for user accounts
4. **Poll System** - Needs backend persistence
5. **Push Notifications** - Registration works but no backend to send

---

## 📁 Backend Files Analysis

### Files That **DO** Exist:
| File | Purpose | Status |
|------|---------|--------|
| `main.py` | Main API with sentiment, news, keywords | ✅ Working |
| `groq_ai_service.py` | Advanced AI with Llama 3.3 70B, tool use, reasoning | ✅ Available |
| `article_summarizer.py` | Article summarization | ✅ Available |
| `setup_nltk.py` | NLTK package downloader (VADER, punkt, POS tagger) | ✅ Working |
| `main_enhanced.py` | Enhanced API version | ⚠️ Not used |
| `main_simple_nlp.py` | Simple NLP version | ⚠️ Not used |

### Files That **DON'T** Exist:
These files were mentioned but are NOT in the backend:
- ❌ `response_preprocessor.py`
- ❌ `nlp_service.py`
- ❌ `sentiment.py`
- ❌ `keyword_ml_processor.py`
- ❌ `enhanced_sentiment.py`
- ❌ Any Q-learning/reinforcement learning files

### Current Sentiment Analysis Stack:
1. **FinBERT** (via HuggingFace API) - Primary: Financial BERT model
2. **GROQ Mixtral** - Fallback: LLM-based analysis
3. **Advanced Heuristic** - Fallback: Rule-based weighted terms
4. **NLTK VADER** - Available but not actively used

### Current Keyword Extraction:
1. **NLTK Noun Phrase Extractor** - POS tagging + chunking
2. **Concept Drivers** - Pattern matching (earnings, options flow, etc.)
3. **RAKE Algorithm** - Keyword extraction fallback

---

## 🔧 Render Cold Start Solutions

### Option 1: Cron Ping (Free)
Add a health check ping every 5-10 minutes:

```bash
# Using cron-job.org (free)
URL: https://integra-markets.onrender.com/health
Schedule: Every 5 minutes
```

### Option 2: UptimeRobot (Free)
- Create account at uptimerobot.com
- Add HTTP monitor for your Render URL
- Set check interval to 5 minutes

### Option 3: Upgrade Render Plan
- Render Starter ($7/mo) - No cold starts
- Background workers keep service warm

### Option 4: Self-Ping from Backend
Add to `main.py`:
```python
import threading
import time
import requests

def keep_alive():
    while True:
        time.sleep(300)  # 5 minutes
        try:
            requests.get("https://integra-markets.onrender.com/health")
        except: pass

threading.Thread(target=keep_alive, daemon=True).start()
```

---

## 🗄️ Supabase Setup Required

### Database Tables Needed:

#### 1. `users` (Auth handled by Supabase Auth)
```sql
-- Supabase Auth already handles this
```

#### 2. `user_preferences`
```sql
CREATE TABLE user_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  commodities TEXT[] DEFAULT '{}',
  regions TEXT[] DEFAULT '{}',
  currencies TEXT[] DEFAULT '{}',
  keywords TEXT[] DEFAULT '{}',
  website_urls TEXT[] DEFAULT '{}',
  alert_frequency TEXT DEFAULT 'Real-time',
  alert_threshold TEXT DEFAULT 'Medium',
  push_enabled BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);
```

#### 3. `sentiment_votes` (For Poll)
```sql
CREATE TABLE sentiment_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL,
  article_title TEXT,
  vote TEXT CHECK (vote IN ('BULLISH', 'BEARISH', 'NEUTRAL')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, article_id)
);
```

#### 4. `saved_analyses` (Bookmarks)
```sql
CREATE TABLE saved_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT,
  source TEXT,
  sentiment TEXT,
  sentiment_score FLOAT,
  analysis_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 5. `push_tokens`
```sql
CREATE TABLE push_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT, -- 'ios', 'android', 'web'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, token)
);
```

---

## 📋 Tasks to Complete

### Priority 1: Critical (App Won't Work Without)
- [ ] Fix Render cold start (add ping mechanism)
- [ ] Set up Supabase tables (run SQL above)
- [ ] Connect app to Supabase Auth
- [ ] Store user preferences in Supabase

### Priority 2: Important (Core Features)
- [ ] Implement poll voting with Supabase
- [ ] Store bookmarks in Supabase (not just AsyncStorage)
- [ ] Register push tokens to Supabase
- [ ] Improve NLTK keyword extraction

### Priority 3: Nice to Have (Polish)
- [ ] Add Q-learning for sentiment model improvement (complex)
- [ ] Implement email alerts
- [ ] Add price alerts (requires price data API)
- [ ] Dark/light theme toggle
- [ ] Offline mode improvements

### Priority 4: Production Ready
- [ ] Error tracking (Sentry)
- [ ] Analytics (Mixpanel/Amplitude)
- [ ] App Store submission prep
- [ ] Privacy policy & ToS pages
- [ ] Rate limiting on backend

---

## 🚀 Recommended Next Steps (In Order)

### Step 1: Fix Cold Start (Today)
1. Create free UptimeRobot account
2. Add health check monitor for Render URL
3. Set 5-minute interval

### Step 2: Supabase Tables (Today)
1. Go to Supabase dashboard
2. Run the SQL commands above
3. Enable Row Level Security (RLS)

### Step 3: Connect Auth (1-2 days)
1. Update app to use Supabase Auth
2. Link user preferences to user_id
3. Sync bookmarks to Supabase

### Step 4: Poll Backend (1 day)
1. Add /api/vote endpoint
2. Store votes in sentiment_votes table
3. Return aggregated results

### Step 5: Push Notifications (1-2 days)
1. Store tokens in push_tokens table
2. Set up Expo Push Notification service
3. Create backend job to send notifications

---

## 🔑 Environment Variables (All Present)

```env
SUPABASE_URL=<set in .env> ✅
SUPABASE_KEY=<set in .env> ✅
HUGGING_FACE_TOKEN=<set in .env> ✅
ALPHA_VANTAGE_API_KEY=<set in .env> ✅
GROQ_API_KEY=<set in .env> ✅
EXPO_PUBLIC_API_URL=https://integra-markets.onrender.com ✅
```

---

## ⏱️ Estimated Time to Completion

| Phase | Time | Description |
|-------|------|-------------|
| Cold Start Fix | 30 mins | UptimeRobot setup |
| Supabase Tables | 1 hour | Create tables + RLS |
| Auth Integration | 4-6 hours | Connect app to Supabase Auth |
| Poll Backend | 2-3 hours | Vote API + aggregation |
| Push Notifications | 4-6 hours | Full implementation |
| Testing & Polish | 4-6 hours | Bug fixes, edge cases |
| **Total** | **2-3 days** | Full feature complete |

---

## 📝 Notes

The backend does NOT have:
- Q-learning or reinforcement learning
- ML model training/improvement loops
- The files mentioned (nlp_service.py, etc.)

The sentiment analysis is using:
- Pre-trained FinBERT (external API)
- GROQ LLM (external API)
- Rule-based heuristics (local)

If you want ML model improvement, that would require:
1. Logging user feedback (vote corrections)
2. Storing in database
3. Periodic model fine-tuning (complex, requires infrastructure)

This is a significant undertaking and probably not needed for MVP.

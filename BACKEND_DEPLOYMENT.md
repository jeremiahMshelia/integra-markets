# Backend Deployment Guide

## Option 1: Render.com (Recommended - Free & Fast)

1. **Sign up at https://render.com**

2. **Create New Web Service:**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select your `integra-markets` repo

3. **Configure the service:**
   - Name: `integra-markets-api`
   - Environment: `Docker`
   - Region: Choose closest to you
   - Branch: `main`
   - Build Command: (leave empty - uses Dockerfile)
   - Start Command: (leave empty - uses Dockerfile)

4. **Add Environment Variables:**
   Click "Environment" and add these:
   ```
   SUPABASE_URL=your_supabase_url_here
   SUPABASE_KEY=your_supabase_anon_key_here
   HUGGING_FACE_TOKEN=your_huggingface_token_here
   GROQ_API_KEY=your_groq_api_key_here
   ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key_here
   ```

5. **Deploy:**
   - Click "Create Web Service"
   - Wait 10-15 minutes for first deployment
   - Your URL will be: `https://integra-markets-api.onrender.com`

## Option 2: Railway.app (Fast Alternative)

1. **Sign up at https://railway.app**

2. **Deploy from GitHub:**
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli
   
   # Login
   railway login
   
   # Initialize project
   railway init
   
   # Link to GitHub
   railway link
   
   # Add environment variables (use your actual keys from .env)
   railway variables set SUPABASE_URL=<from .env>
   railway variables set SUPABASE_KEY=<from .env>
   railway variables set HUGGING_FACE_TOKEN=<from .env>
   railway variables set GROQ_API_KEY=<from .env>
   
   # Deploy
   railway up
   ```

3. **Get your URL:**
   ```bash
   railway domain
   ```

## Option 3: Fly.io (More Control)

1. **Install Fly CLI:**
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Sign up and deploy:**
   ```bash
   fly auth signup
   fly launch
   # Set your secrets from .env values
   fly secrets set SUPABASE_URL="<from .env>"
   fly secrets set SUPABASE_KEY="<from .env>"
   fly secrets set HUGGING_FACE_TOKEN="<from .env>"
   fly secrets set GROQ_API_KEY="<from .env>"
   fly deploy
   ```

## Option 4: Local Ngrok (Immediate Testing)

For immediate testing while setting up a proper deployment:

1. **Start your backend locally:**
   ```bash
   cd /path/to/integra-markets/backend
   python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
   ```

2. **In another terminal, expose it with ngrok:**
   ```bash
   npm install -g ngrok
   ngrok http 8000
   ```

3. **Use the ngrok URL** (e.g., `https://abc123.ngrok.io`)

## After Deployment

Once deployed, update your `app.json`:

```json
"extra": {
  "apiUrl": "YOUR_BACKEND_URL_HERE",
  // ... other settings
}
```

Then rebuild your app for TestFlight.

## Testing Your Backend

Test that your backend is working:
```bash
curl YOUR_BACKEND_URL/health
```

Should return:
```json
{"status": "healthy", "supabase_connected": true}
```

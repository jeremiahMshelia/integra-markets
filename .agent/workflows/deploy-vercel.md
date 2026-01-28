---
description: Deploy web app to Vercel production
---

# Deploy to Vercel

Deploy the web directory to Vercel production.

## Steps

// turbo-all
1. Navigate to the web directory and deploy:
```bash
cd /Users/jerry/Documents/integra-markets/web && npx vercel --prod
```

2. Wait for deployment to complete. The output will show:
   - Build progress
   - Production URL: https://integramarkets.app

## Notes
- This deploys directly from local machine, not through GitHub
- Make sure to commit and push changes to GitHub first for backup
- The Vercel CLI will use the existing project configuration

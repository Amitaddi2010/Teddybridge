# Firebase Hosting Deployment Guide

This guide will help you deploy TeddyBridge to Firebase Hosting.

## Quick Start

1. **Install Firebase CLI**:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

2. **Update `.firebaserc`** with your Firebase project ID

3. **Set your backend API URL** (create `.env.production`):
   ```env
   VITE_API_URL=https://your-backend.onrender.com
   ```

4. **Build and deploy**:
   ```bash
   npm install
   npm run build
   firebase deploy --only hosting
   ```

That's it! Your app will be live at `https://your-project-id.web.app`

For detailed instructions, see below.

## Architecture Overview

For this full-stack application, we recommend a **hybrid deployment**:
- **Frontend (React)**: Deployed to Firebase Hosting
- **Backend (Express API)**: Deployed to Render or Firebase Cloud Run

This approach provides:
- ✅ Fast, global CDN for your frontend
- ✅ Persistent backend server (not serverless)
- ✅ Better support for WebSockets and long-running processes
- ✅ Easier database management

## Prerequisites

1. **Firebase CLI** installed:
   ```bash
   npm install -g firebase-tools
   ```

2. **Firebase Account**:
   - Go to https://console.firebase.google.com
   - Create a new project or use an existing one
   - Note your project ID

3. **Login to Firebase**:
   ```bash
   firebase login
   ```

## Step 1: Initialize Firebase Project

1. **Update `.firebaserc`** with your Firebase project ID:
   ```json
   {
     "projects": {
       "default": "your-actual-firebase-project-id"
     }
   }
   ```

2. **Verify Firebase configuration**:
   ```bash
   firebase projects:list
   ```

## Step 2: Build the Application

Build both the frontend and backend:

```bash
npm install
npm run build
```

This will:
- Build the React frontend to `dist/public/`
- Build the Express server to `dist/index.cjs`

## Step 3: Configure Backend API URL

Since your frontend will be on Firebase Hosting and your backend will be on a different domain, you need to configure the API URL.

### Option A: Environment Variable (Recommended)

The frontend code has been updated to support the `VITE_API_URL` environment variable. 

1. **Create `.env.production` file** in the root directory:
   ```env
   VITE_API_URL=https://your-backend.onrender.com
   ```
   Replace `https://your-backend.onrender.com` with your actual backend URL.

2. **Build with production environment**:
   ```bash
   npm run build
   ```
   The build process will automatically use `.env.production` and embed the API URL into the built files.

3. **If you don't set `VITE_API_URL`**, the frontend will use relative URLs (e.g., `/api/...`), which only works if your backend and frontend are on the same domain.

### Option B: Proxy Configuration

If you want to use the same domain, you can:
1. Deploy backend to Firebase Cloud Run
2. Use Firebase Hosting rewrites to proxy `/api/**` to Cloud Run

## Step 4: Deploy Frontend to Firebase Hosting

1. **Deploy**:
   ```bash
   firebase deploy --only hosting
   ```

2. **Your app will be live at**:
   ```
   https://your-project-id.web.app
   ```
   or
   ```
   https://your-project-id.firebaseapp.com
   ```

## Step 5: Deploy Backend (Choose One Option)

### Option A: Render (Recommended)

Keep your backend on Render as described in `DEPLOYMENT.md`. This is the simplest option and works well with your current setup.

**Important**: Update your frontend's API calls to point to your Render backend URL.

### Option B: Firebase Cloud Run

Deploy your Express backend to Cloud Run:

1. **Install Google Cloud SDK**:
   ```bash
   # Windows (PowerShell)
   (New-Object Net.WebClient).DownloadFile("https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe", "$env:Temp\GoogleCloudSDKInstaller.exe")
   & $env:Temp\GoogleCloudSDKInstaller.exe
   ```

2. **Create a Dockerfile** for Cloud Run:
   ```dockerfile
   FROM node:20-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   COPY dist ./dist
   EXPOSE 8080
   ENV PORT=8080
   CMD ["node", "dist/index.cjs"]
   ```

3. **Deploy to Cloud Run**:
   ```bash
   gcloud run deploy teddybridge-api \
     --source . \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated
   ```

4. **Update firebase.json** to proxy API calls:
   ```json
   {
     "hosting": {
       "rewrites": [
         {
           "source": "/api/**",
           "run": {
             "serviceId": "teddybridge-api",
             "region": "us-central1"
           }
         },
         {
           "source": "**",
           "destination": "/index.html"
         }
       ]
     }
   }
   ```

### Option C: Firebase Cloud Functions (Not Recommended)

Cloud Functions have limitations:
- ❌ 60-second timeout (can be extended to 9 minutes)
- ❌ Cold starts
- ❌ Complex WebSocket support
- ❌ Not ideal for persistent connections

Only use this if you need everything on Firebase and can work within these constraints.

## Step 6: Environment Variables

### Frontend Environment Variables

For Firebase Hosting, you'll need to set environment variables at build time. Create a `.env.production` file in the root directory:

```env
VITE_API_URL=https://your-backend.onrender.com
```

**Important**: 
- The `VITE_API_URL` must be set **before** running `npm run build`
- Environment variables starting with `VITE_` are embedded into the build at compile time
- After building, the API URL is baked into the JavaScript bundle
- If you change the backend URL, you must rebuild and redeploy

The frontend code automatically uses this environment variable. If not set, it falls back to relative URLs.

### Backend Environment Variables

Set these in your backend deployment (Render/Cloud Run):
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Random secret string
- `APP_URL` - Your frontend URL (Firebase Hosting URL)
- `TWILIO_ACCOUNT_SID` - (Optional)
- `TWILIO_AUTH_TOKEN` - (Optional)
- `TWILIO_PHONE_NUMBER` - (Optional)
- `ASSEMBLY_AI_API_KEY` - (Optional)
- `GROQ_API_KEY` - (Optional)
- `SENDGRID_API_KEY` - (Optional)
- `SENDGRID_FROM_EMAIL` - (Optional)

## Step 7: Configure CORS on Backend

Since your frontend (Firebase Hosting) and backend (Render/Cloud Run) will be on different domains, you need to configure CORS on your backend.

**Important**: The frontend uses `credentials: "include"` for API calls (to send cookies for authentication), so your backend must:

1. **Allow the frontend origin** in CORS headers
2. **Set `Access-Control-Allow-Credentials: true`**
3. **Set specific `Access-Control-Allow-Origin`** (not `*` when using credentials)

If you're using Render, add this middleware to your Express app (in `server/routes.ts` or `server/index.ts`):

```typescript
// Add CORS middleware (install: npm install cors @types/cors)
import cors from "cors";

app.use(cors({
  origin: process.env.FRONTEND_URL || "https://your-project-id.web.app",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
```

Or manually set headers:

```typescript
app.use((req, res, next) => {
  const frontendUrl = process.env.FRONTEND_URL || "https://your-project-id.web.app";
  res.header("Access-Control-Allow-Origin", frontendUrl);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
```

Set `FRONTEND_URL` environment variable in your backend deployment to your Firebase Hosting URL.

## Step 8: Update Twilio Webhooks

If you're using Twilio, update your webhook URLs to point to your backend:
- Status Callback: `https://your-backend.onrender.com/api/twilio/webhook/status`
- Recording Callback: `https://your-backend.onrender.com/api/twilio/webhook/recording`

## Step 9: Custom Domain (Optional)

1. Go to Firebase Console → Hosting
2. Click "Add custom domain"
3. Follow the DNS configuration instructions
4. Firebase will provide SSL certificates automatically

## Deployment Commands

### Deploy Frontend Only
```bash
npm run build
firebase deploy --only hosting
```

### Deploy Everything (if using Cloud Functions)
```bash
npm run build
firebase deploy
```

### Preview Before Deploying
```bash
firebase hosting:channel:deploy preview
```

## Troubleshooting

### Build Fails
- Ensure all dependencies are installed: `npm install`
- Check for TypeScript errors: `npm run check`
- Verify Node.js version (should be 18+)

### Frontend Can't Connect to Backend
- Check CORS settings in your backend
- Verify the API URL is correct
- Check browser console for errors
- Ensure backend is running and accessible

### 404 Errors on Refresh
- This is normal for SPAs - Firebase Hosting should handle this with the rewrite rule
- Verify `firebase.json` has the catch-all rewrite to `/index.html`

### Environment Variables Not Working
- Frontend env vars must start with `VITE_` to be accessible
- Rebuild after changing `.env` files
- Check that `.env.production` exists for production builds

## Continuous Deployment

### GitHub Actions (Recommended)

Create `.github/workflows/firebase-deploy.yml`:

```yaml
name: Deploy to Firebase

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm run build
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          channelId: live
          projectId: your-firebase-project-id
```

## Next Steps

1. ✅ Deploy frontend to Firebase Hosting
2. ✅ Keep backend on Render (or deploy to Cloud Run)
3. ✅ Update API URLs in frontend
4. ✅ Test all features
5. ✅ Set up custom domain (optional)
6. ✅ Configure CI/CD (optional)

## Support

For issues:
- Firebase Documentation: https://firebase.google.com/docs/hosting
- Firebase Console: https://console.firebase.google.com
- Check deployment logs: `firebase hosting:channel:list`


# Quick Deploy to Render

## ⚠️ Important: Database Schema

Your current schema is configured for **SQLite** (local development). For Render deployment, you need **PostgreSQL**.

## Two Options:

### Option 1: Quick Deploy (Recommended for Testing)

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **New +** → **Web Service**
3. **Connect GitHub** → Select `Amitaddi2010/Teddybridge`
4. **Settings**:
   - Name: `teddybridge`
   - Region: `Oregon` (or closest to you)
   - Branch: `main`
   - Root Directory: (leave empty)
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Node Version**: `20` (or leave default)

5. **Create PostgreSQL Database**:
   - **New +** → **PostgreSQL**
   - Name: `teddybridge-db`
   - Plan: `Free`
   - Note the **Internal Database URL**

6. **Add Environment Variables** in Web Service:
   - `DATABASE_URL` = (paste the Internal Database URL from step 5)
   - `NODE_ENV` = `production`
   - `SESSION_SECRET` = (click "Generate" or use a random string)
   - `PORT` = `10000` (Render sets this automatically, but good to have)

7. **Deploy**:
   - Click **Create Web Service**
   - Wait for build to complete (~5-10 minutes)

8. **Run Database Migrations**:
   - Once deployed, go to your service
   - Click **Shell** tab
   - Run: `npm run db:push`
   - This creates all tables

9. **Done!** Your app should be live at `https://your-app-name.onrender.com`

## ⚠️ Schema Conversion Needed

**Current Issue**: Your schema (`shared/schema.ts`) is SQLite-specific. For PostgreSQL on Render, you have two options:

### Option A: Convert Schema to PostgreSQL (Recommended)

I can help you convert the schema. The main changes:
- `sqliteTable` → `pgTable`
- `integer` with `mode: "timestamp"` → `timestamp`
- `integer` with `mode: "boolean"` → `boolean`
- `text` with `mode: "json"` → `jsonb`

### Option B: Use SQLite on Render (Not Recommended)

Render doesn't support persistent file storage well, so SQLite files can be lost.

## Next Steps After Deployment

1. ✅ Test your application
2. ✅ Add optional environment variables (SendGrid, Twilio) if needed
3. ✅ Set up custom domain (optional)
4. ✅ Monitor logs in Render dashboard

## Need Help?

- Render Docs: https://render.com/docs
- Check application logs if something fails
- Verify environment variables are set correctly


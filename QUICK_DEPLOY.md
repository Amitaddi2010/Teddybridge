# Quick Deploy to Render

## ✅ Database Support

Your application now supports both **SQLite** (local development) and **PostgreSQL** (production on Render). The database connection is automatically configured based on the `DATABASE_URL` environment variable.

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
   - `APP_URL` = `https://your-app-name.onrender.com` (replace with your actual Render URL - **Important for Twilio**)
   - `PORT` = `10000` (Render sets this automatically, but good to have)
   - (Optional) `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` for call functionality
   - (Optional) `REDCAP_SURVEY_LINK`, `REDCAP_API_KEY`, `REDCAP_API_URL` for survey integration

7. **Deploy**:
   - Click **Create Web Service**
   - Wait for build to complete (~5-10 minutes)

8. **Run Database Migrations**:
   - Once deployed, go to your service
   - Click **Shell** tab
   - Run: `npm run db:push`
   - This creates all tables

9. **Done!** Your app should be live at `https://your-app-name.onrender.com`

## ✅ Schema Support

Your schema (`shared/schema.ts`) is configured to work with both SQLite and PostgreSQL. The database connection logic in `server/db.ts` automatically detects the database type from the `DATABASE_URL` and uses the appropriate driver.

## Next Steps After Deployment

1. ✅ Test your application
2. ✅ Add optional environment variables (SendGrid, Twilio) if needed
3. ✅ Set up custom domain (optional)
4. ✅ Monitor logs in Render dashboard

## Need Help?

- Render Docs: https://render.com/docs
- Check application logs if something fails
- Verify environment variables are set correctly


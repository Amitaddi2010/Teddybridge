# Deployment Guide for TeddyBridge

## Recommended Platform: **Render**

Render is the best choice for this application because:
- ✅ Supports full-stack Express.js applications
- ✅ Built-in PostgreSQL database hosting
- ✅ Persistent services (not serverless)
- ✅ Free tier available
- ✅ Easy environment variable management
- ✅ Automatic HTTPS

## Prerequisites

1. GitHub account with your code pushed
2. Render account (sign up at https://render.com)

## Deployment Steps

### Option 1: Using render.yaml (Recommended)

1. **Create a Render Account**
   - Go to https://render.com
   - Sign up with your GitHub account

2. **Create a New Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository: `Amitaddi2010/Teddybridge`
   - Render will detect the `render.yaml` file automatically

3. **Configure the Service**
   - Name: `teddybridge` (or your preferred name)
   - Region: Choose closest to your users
   - Branch: `main`
   - Root Directory: (leave empty, it's the root)
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`

4. **Environment Variables**
   Render will automatically create a PostgreSQL database and set `DATABASE_URL`.
   You'll need to add these manually in the Render dashboard:
   - `SESSION_SECRET` - Generate a random string (Render can auto-generate)
   - `APP_URL` - Your Render service URL (e.g., `https://teddybridge.onrender.com`) - **Important for Twilio**
   - `SENDGRID_API_KEY` - (Optional) Your SendGrid API key
   - `SENDGRID_FROM_EMAIL` - (Optional) Your verified SendGrid email
   - `TWILIO_ACCOUNT_SID` - (Optional) Your Twilio account SID
   - `TWILIO_AUTH_TOKEN` - (Optional) Your Twilio auth token
   - `TWILIO_PHONE_NUMBER` - (Optional) Your Twilio phone number
   - `REDCAP_SURVEY_LINK` - (Optional) REDCap survey link
   - `REDCAP_API_KEY` - (Optional) REDCap API key
   - `REDCAP_API_URL` - (Optional) REDCap API URL

5. **Deploy**
   - Click "Create Web Service"
   - Render will build and deploy your application
   - Wait for deployment to complete (5-10 minutes)

6. **Run Database Migrations**
   - Once deployed, go to your service's shell/console
   - Run: `npm run db:push`
   - This will create all the database tables

### Option 2: Manual Setup

1. **Create PostgreSQL Database**
   - In Render dashboard: "New +" → "PostgreSQL"
   - Name: `teddybridge-db`
   - Plan: Free
   - Note the connection string

2. **Create Web Service**
   - "New +" → "Web Service"
   - Connect GitHub repo
   - Settings:
     - Build Command: `npm install && npm run build`
     - Start Command: `npm start`
   - Add Environment Variables:
     - `DATABASE_URL` - Your PostgreSQL connection string
     - `NODE_ENV=production`
     - `PORT=10000` (Render sets this automatically, but good to have)
     - `SESSION_SECRET` - Random secret string
     - Other optional variables as needed

3. **Deploy and Migrate**
   - Deploy the service
   - Run migrations in the shell: `npm run db:push`

## Post-Deployment

1. **Verify Database Tables**
   - Check that all tables are created
   - You can use Render's PostgreSQL dashboard to verify

2. **Test the Application**
   - Visit your Render URL (e.g., `https://teddybridge.onrender.com`)
   - Test signup, login, and core features

3. **Custom Domain (Optional)**
   - In Render dashboard → Settings → Custom Domains
   - Add your domain and configure DNS

## Troubleshooting

### Database Connection Issues
- Verify `DATABASE_URL` is set correctly
- Check that PostgreSQL service is running
- Ensure migrations have run: `npm run db:push`

### Build Failures
- Check build logs in Render dashboard
- Ensure all dependencies are in `package.json`
- Verify Node.js version (Render uses Node 18+ by default)

### Application Errors
- Check application logs in Render dashboard
- Verify all environment variables are set
- Check that the database schema matches your code

## Alternative: Vercel (Not Recommended)

Vercel is optimized for serverless functions and static sites. For this Express.js app:
- ❌ SQLite won't work (read-only filesystem)
- ❌ Would need to restructure as serverless functions
- ❌ More complex setup
- ✅ Better for frontend-only or Next.js apps

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (auto-set by Render) |
| `NODE_ENV` | Yes | Set to `production` |
| `PORT` | Auto | Render sets this automatically |
| `SESSION_SECRET` | Yes | Random secret for session encryption |
| `APP_URL` | Yes | Your Render service URL (e.g., `https://teddybridge.onrender.com`) - Required for Twilio |
| `SENDGRID_API_KEY` | No | For email functionality |
| `SENDGRID_FROM_EMAIL` | No | Verified sender email |
| `TWILIO_ACCOUNT_SID` | No | For voice calling |
| `TWILIO_AUTH_TOKEN` | No | Twilio authentication |
| `TWILIO_PHONE_NUMBER` | No | Twilio phone number |
| `REDCAP_SURVEY_LINK` | No | REDCap survey link |
| `REDCAP_API_KEY` | No | REDCap API key |
| `REDCAP_API_URL` | No | REDCap API URL |

## Support

For issues, check:
- Render documentation: https://render.com/docs
- Application logs in Render dashboard
- GitHub issues: https://github.com/Amitaddi2010/Teddybridge/issues


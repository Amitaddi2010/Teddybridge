# Call Recording and AI Summary Setup

This document explains how to set up automatic call recording, transcription, and AI-powered summary generation for doctor-to-doctor calls.

## Features Implemented

1. **Automatic Call Recording**: All doctor-to-doctor calls are automatically recorded via Twilio
2. **Transcription**: Recordings are transcribed using Assembly AI
3. **AI Summary Generation**: Transcripts are summarized using Groq AI
4. **Downloadable Reports**: Summaries can be downloaded as PDF or DOC files

## Environment Variables Required

Add these to your `.env` file:

```env
# Assembly AI (for transcription)
ASSEMBLY_AI_API_KEY=your_assembly_ai_api_key_here

# Groq AI (for summary generation)
GROQ_API_KEY=your_groq_api_key_here

# Twilio (already configured)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number

# App URL (for webhooks)
APP_URL=https://your-domain.com
```

## Getting API Keys

### Assembly AI
1. Sign up at https://www.assemblyai.com/
2. Get your API key from the dashboard
3. Add it to `.env` as `ASSEMBLY_AI_API_KEY`

### Groq AI
1. Sign up at https://console.groq.com/
2. Create an API key
3. Add it to `.env` as `GROQ_API_KEY`

## How It Works

### 1. Call Recording
- When a doctor initiates a call, Twilio automatically starts recording
- Recording is stored in Twilio's cloud storage
- When recording completes, Twilio sends a webhook to `/api/twilio/webhook/recording`

### 2. Transcription
- When the recording webhook is received, the system:
  - Extracts the call ID from the conference name
  - Submits the recording URL to Assembly AI for transcription
  - Waits for transcription to complete (up to 5 minutes)

### 3. Summary Generation
- Once transcription is complete, the system:
  - Sends the transcript to Groq AI with a prompt to generate:
    - Executive summary
    - Key points
    - Action items
  - Stores the summary in the database

### 4. Display and Download
- Summaries are displayed in the doctor dashboard under "Call History"
- Doctors can download summaries as:
  - PDF files (via `/api/doctor/call/:callId/download/pdf`)
  - DOC files (via `/api/doctor/call/:callId/download/doc`)
- Full transcripts are available in an expandable section

## API Endpoints

### Process Recording Manually
```
POST /api/doctor/call/:callId/process-recording
Body: { "recordingUrl": "https://..." }
```
Manually trigger transcription and summary generation for a call.

### Download PDF
```
GET /api/doctor/call/:callId/download/pdf
```
Download call summary as PDF.

### Download DOC
```
GET /api/doctor/call/:callId/download/doc
```
Download call summary as DOC.

## Webhook Configuration

Make sure your Twilio webhook is configured to send recording status updates to:
```
https://your-domain.com/api/twilio/webhook/recording
```

## Troubleshooting

### Recording Not Starting
- Check that Twilio account has recording enabled
- Verify `APP_URL` is set correctly (must be publicly accessible)
- Check Twilio console for recording status

### Transcription Failing
- Verify `ASSEMBLY_AI_API_KEY` is set correctly
- Check Assembly AI dashboard for API usage/quota
- Review server logs for error messages

### Summary Not Generating
- Verify `GROQ_API_KEY` is set correctly
- Check Groq API quota/limits
- Review server logs for error messages

### Webhook Not Receiving Events
- Ensure `APP_URL` is publicly accessible (use ngrok for local development)
- Verify webhook URL in Twilio console
- Check server logs for incoming webhook requests

## Local Development

For local development, use ngrok to expose your local server:

```bash
# Install ngrok
npm install -g ngrok

# Start your server
npm run dev

# In another terminal, expose port 5000
ngrok http 5000

# Update APP_URL in .env to the ngrok HTTPS URL
APP_URL=https://your-ngrok-url.ngrok.io
```

## Notes

- Recordings are processed automatically when calls end
- Processing may take a few minutes (transcription + summary generation)
- Summaries are stored in the database and persist across sessions
- Transcripts include speaker diarization (if available from Assembly AI)


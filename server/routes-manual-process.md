# Manual Recording Processing

If the automatic webhook didn't process your recording, you can manually trigger processing using the Recording SID.

## Using the API

### Option 1: Process by Call ID and Recording SID

```bash
POST /api/doctor/call/{callId}/process-recording
Body: {
  "recordingSid": "REb8ce0bf621382db7d32c4bb56bc59604"
}
```

### Option 2: Get Recording Info First

```bash
GET /api/doctor/call/{callId}/recording-info
```

This will show you available recordings for the call.

## Finding the Call ID

1. Go to the doctor dashboard
2. Navigate to the "Calls" tab
3. Find the call in the "Call History" section
4. The call ID is in the URL or you can inspect the call object

## Example

For your call with Recording SID `REb8ce0bf621382db7d32c4bb56bc59604`:

1. Find the call ID from the call history
2. Make a POST request to process it:
   ```bash
   curl -X POST http://localhost:5000/api/doctor/call/{callId}/process-recording \
     -H "Content-Type: application/json" \
     -H "Cookie: your-session-cookie" \
     -d '{"recordingSid": "REb8ce0bf621382db7d32c4bb56bc59604"}'
   ```

The system will:
1. Fetch the recording URL from Twilio
2. Submit it to Assembly AI for transcription
3. Generate a summary using Groq AI
4. Store the transcript and summary in the database


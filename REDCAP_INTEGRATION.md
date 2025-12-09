# Professional REDCap API Integration

This document describes the professional REDCap API integration implemented in TeddyBridge, based on REDCap API v2.11.4 capabilities.

## Overview

The REDCap integration provides comprehensive survey management, real-time status tracking, and automated data synchronization between TeddyBridge and REDCap.

## Features Implemented

### 1. **Real-Time Survey Completion Tracking**
- Automatically checks REDCap for survey completion status
- Updates survey status in database when completed
- Provides real-time completion status via API

**Endpoint:** `GET /api/redcap/survey/status/:id`

### 2. **Survey Response Export**
- Export complete survey responses from REDCap
- Get responses for individual surveys or all patient surveys
- Supports filtering by form, event, and record ID

**Endpoints:**
- `GET /api/redcap/survey/responses/:surveyId` - Get responses for a specific survey
- `GET /api/redcap/patient/:patientId/responses` - Get all responses for a patient

### 3. **Batch Status Synchronization**
- Sync multiple survey statuses from REDCap in one operation
- Automatically updates completed surveys
- Provides detailed sync results

**Endpoint:** `POST /api/redcap/sync-statuses`

### 4. **Project Information & Metadata**
- Get REDCap project details
- Export data dictionary (metadata)
- List available instruments (surveys/forms)
- Export events (for longitudinal projects)

**Endpoints:**
- `GET /api/redcap/project/info` - Get project information
- `GET /api/redcap/instruments` - List available instruments
- `GET /api/redcap/metadata` - Get data dictionary

### 5. **REDCap Service Class**

The `RedcapService` class (`server/services/redcap.ts`) provides a comprehensive interface to REDCap API:

#### Available Methods:

- `exportRecords()` - Export survey responses
- `importRecords()` - Create/update records in REDCap
- `exportMetadata()` - Get data dictionary
- `exportInstruments()` - List available surveys/forms
- `exportSurveyLink()` - Generate survey links dynamically
- `exportSurveyQueueLink()` - Generate survey queue links
- `exportSurveyParticipants()` - Get survey participant list
- `importSurveyParticipants()` - Invite participants to surveys
- `checkSurveyCompletion()` - Check if survey is completed
- `getSurveyResponse()` - Get survey response data
- `exportProjectInfo()` - Get project information
- `exportEvents()` - Get events (longitudinal projects)
- `exportReport()` - Export REDCap reports
- `exportFile()` - Download uploaded files
- `exportLogging()` - Get audit trail/logging data

## Environment Variables

Required REDCap configuration in `.env`:

```env
REDCAP_API_URL=https://your-redcap-instance.com/api/
REDCAP_API_KEY=your-redcap-api-token
REDCAP_PROJECT_ID=your-project-id (optional)
REDCAP_SURVEY_LINK=https://redcap.link/your-survey (fallback)
```

## Usage Examples

### 1. Check Survey Completion Status

```typescript
// Automatically checks REDCap and updates database
GET /api/redcap/survey/status/:surveyId

// Response includes real-time REDCap status
{
  "id": "survey-id",
  "status": "COMPLETED",
  "redcapStatus": {
    "completed": true,
    "completionTime": "2025-12-09T12:00:00Z"
  }
}
```

### 2. Export Survey Responses

```typescript
GET /api/redcap/survey/responses/:surveyId

// Returns complete survey response data from REDCap
{
  "survey": { ... },
  "responses": [
    {
      "record_id": "123",
      "field1": "value1",
      "field2": "value2",
      ...
    }
  ]
}
```

### 3. Sync All Survey Statuses

```typescript
POST /api/redcap/sync-statuses

// Syncs all pending/sent surveys for the doctor
{
  "synced": 5,
  "errors": 0,
  "details": {
    "synced": ["survey-id-1", "survey-id-2", ...],
    "errors": []
  }
}
```

### 4. Get Available Instruments

```typescript
GET /api/redcap/instruments

// Returns list of available surveys/forms
[
  {
    "instrument_name": "preop_survey",
    "instrument_label": "Pre-Operative Survey"
  },
  {
    "instrument_name": "postop_survey",
    "instrument_label": "Post-Operative Survey"
  }
]
```

## Professional Features

### Automated Status Updates
- Surveys are automatically checked for completion when status is requested
- Database is updated in real-time when surveys are completed
- No manual intervention required

### Data Quality
- All API calls include error handling
- Failed requests are logged for debugging
- Graceful fallback when REDCap API is unavailable

### Security
- All endpoints require authentication
- Doctor role required for most operations
- API keys stored securely in environment variables

### Performance
- Batch operations for multiple surveys
- Efficient API calls with proper filtering
- Caching considerations for frequently accessed data

## Future Enhancements

Based on REDCap API capabilities, future enhancements could include:

1. **Automated Reminders**
   - Schedule reminder emails for incomplete surveys
   - Use REDCap's survey queue functionality

2. **Data Validation**
   - Validate survey responses before submission
   - Check data quality rules

3. **Longitudinal Studies**
   - Support for multiple events/timepoints
   - Track surveys across study timeline

4. **File Management**
   - Upload/download files to/from REDCap
   - Manage file repository

5. **Reporting**
   - Generate REDCap reports
   - Export data in various formats (CSV, JSON, XML)

6. **Participant Management**
   - Automatically invite participants via REDCap API
   - Manage survey participant lists

7. **Webhooks**
   - Set up REDCap webhooks for real-time updates
   - Automatically sync when surveys are completed

## References

- [REDCap API Documentation](https://cran.r-project.org/web/packages/redcapAPI/redcapAPI.pdf)
- [REDCap API Guide](https://redcap.vanderbilt.edu/api/help/)
- [REDCap Project](https://projectredcap.org/)

## Support

For issues or questions about REDCap integration, please check:
1. REDCap API configuration in `.env`
2. Server logs for API errors
3. REDCap project permissions and API token validity


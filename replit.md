# TeddyBridge - Healthcare Coordination Platform

## Overview
TeddyBridge is a HIPAA-compliant healthcare coordination platform that connects joint replacement patients peer-to-peer and enables doctor-to-doctor collaboration. The platform features dual-role authentication, voice calling via Twilio, REDCap PROMS integration, QR-based doctor profile linking, and role-specific dashboards.

## Architecture

### Tech Stack
- **Frontend**: React 18 with TypeScript, Vite, TanStack Query, wouter routing
- **Backend**: Express.js with TypeScript, Passport.js authentication
- **Database**: PostgreSQL with Drizzle ORM
- **UI**: shadcn/ui components, Tailwind CSS, dark mode support
- **Integrations**: Twilio (voice), SendGrid (email), REDCap (PROMS surveys)

### Project Structure
```
├── client/
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   │   ├── ui/         # shadcn base components
│   │   │   ├── logo.tsx
│   │   │   ├── theme-toggle.tsx
│   │   │   ├── status-badge.tsx
│   │   │   ├── patient-card.tsx
│   │   │   ├── connection-request-card.tsx
│   │   │   ├── meeting-card.tsx
│   │   │   ├── call-view.tsx
│   │   │   ├── proms-table.tsx
│   │   │   ├── stats-card.tsx
│   │   │   ├── doctor-qr-card.tsx
│   │   │   ├── doctor-link-card.tsx
│   │   │   ├── invite-dialog.tsx
│   │   │   └── schedule-dialog.tsx
│   │   ├── pages/
│   │   │   ├── landing.tsx
│   │   │   ├── link.tsx
│   │   │   ├── auth/
│   │   │   │   ├── login.tsx
│   │   │   │   ├── signup-patient.tsx
│   │   │   │   └── signup-doctor.tsx
│   │   │   └── dashboard/
│   │   │       ├── patient.tsx
│   │   │       └── doctor.tsx
│   │   ├── lib/
│   │   │   ├── auth.tsx     # Auth context
│   │   │   ├── theme.tsx    # Theme provider
│   │   │   ├── queryClient.ts
│   │   │   └── utils.ts
│   │   └── App.tsx
├── server/
│   ├── index.ts             # Express server entry
│   ├── routes.ts            # All API routes
│   ├── storage.ts           # Database storage layer
│   └── db.ts                # Database connection
└── shared/
    └── schema.ts            # Drizzle schema + Zod validation
```

## Database Schema

### Core Tables
- **users**: Base user table (id, email, passwordHash, name, role)
- **patientProfiles**: Patient-specific data (phoneNumber, demographics)
- **doctorProfiles**: Doctor-specific data (phoneNumber, specialty, city)
- **patientConnections**: Peer-to-peer connection requests and status
- **surveyRequests**: PROMS survey tracking
- **surveyResponses**: Survey response data
- **doctorCalls**: Doctor-to-doctor call records with transcription
- **patientCalls**: Patient-to-patient call records
- **linkRecords**: QR code patient-doctor linking
- **auditLogs**: HIPAA-compliant audit trail

## API Routes

### Authentication
- POST `/api/auth/signup/patient` - Patient registration
- POST `/api/auth/signup/doctor` - Doctor registration
- POST `/api/auth/login` - User login
- POST `/api/auth/logout` - User logout
- GET `/api/auth/me` - Get current user with profile

### Patient Routes
- GET `/api/patient/available` - List available patients to connect with
- GET `/api/patient/connections` - Get user's connections
- POST `/api/patient/invite` - Send connection invitation
- POST `/api/patient/invite/accept` - Accept invitation
- POST `/api/patient/invite/decline` - Decline invitation
- POST `/api/patient/call/schedule` - Schedule a call
- POST `/api/patient/call/initiate` - Start a call

### Doctor Routes
- GET `/api/doctor/available` - List available doctors
- GET `/api/doctor/surveys` - Get PROMS surveys
- GET `/api/doctor/linked-patients` - Get linked patients

### QR Routes
- POST `/api/qr/create` - Generate QR code
- GET `/api/qr/my-code` - Get doctor's QR code
- GET `/api/qr/verify` - Verify QR token
- POST `/api/qr/link` - Link patient to doctor

### PROMS Routes
- POST `/api/redcap/survey/send` - Send survey to patient
- GET `/api/redcap/survey/status/:id` - Get survey status

### Twilio Routes
- POST `/api/twilio/call` - Initiate doctor call
- POST `/api/twilio/webhook/status` - Call status webhook
- POST `/api/twilio/webhook/transcription` - Transcription webhook

## User Roles

### Patients
- Can search and connect with other patients
- Send/receive peer connection requests
- Schedule and join voice calls
- Link to doctors via QR code
- Complete PROMS surveys

### Doctors
- Generate QR codes for patient linking
- View linked patients
- Send PROMS surveys to patients
- Make doctor-to-doctor calls with transcription
- Track patient outcomes

## Design Guidelines

Following design_guidelines.md:
- **Typography**: Inter (body), Plus Jakarta Sans (headlines)
- **Colors**: Professional healthcare blue palette with proper dark mode support
- **Layout**: Patient uses horizontal nav, Doctor uses sidebar
- **Components**: shadcn/ui with custom status badges and cards

## Development

### Running the App
```bash
npm run dev
```

### Database
```bash
npm run db:push    # Push schema changes
npm run db:studio  # Open Drizzle Studio
```

### Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption key
- `SENDGRID_API_KEY` - SendGrid for emails
- `SENDGRID_FROM_EMAIL` - Verified sender email
- `TWILIO_ACCOUNT_SID` - Twilio account SID
- `TWILIO_AUTH_TOKEN` - Twilio auth token
- `TWILIO_PHONE_NUMBER` - Twilio phone number

## Recent Changes
- Initial build with complete frontend and backend
- Implemented dual-role authentication (Patient/Doctor)
- Built comprehensive component library
- Created all dashboard pages with role-specific features
- Set up database schema with 10+ tables
- Integrated Twilio and SendGrid
- Added HIPAA-compliant audit logging

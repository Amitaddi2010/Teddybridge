# TeddyBridge Design Guidelines

## Design Approach

**Reference-Based Approach: SalesPatriot + Healthcare Refinement**

Primary visual reference: SalesPatriot's clean B2B SaaS aesthetic (professional, data-focused, trust-building)
Healthcare adaptations: Softer edges, reassuring color psychology, clear role differentiation, medical iconography

**Design Principles:**
- **Trust & Clarity**: Healthcare requires absolute clarity - no ambiguous states, explicit permissions, visible security indicators
- **Role Differentiation**: Patient and doctor interfaces must feel distinct while maintaining brand consistency
- **Scannable Data**: Dashboard-heavy application prioritizing quick information parsing
- **Guided Actions**: Clear CTAs, progressive disclosure, zero confusion about next steps

---

## Typography

**Font Stack** (via Google Fonts CDN):
- **Primary**: Inter (all weights 400-700) - body text, UI elements, data tables
- **Display**: Plus Jakarta Sans (600-800) - headlines, section headers, dashboard titles

**Hierarchy**:
- H1 (Page titles): text-4xl md:text-5xl font-bold tracking-tight
- H2 (Section headers): text-2xl md:text-3xl font-semibold
- H3 (Card titles): text-xl font-semibold
- Body: text-base leading-relaxed
- Small/Meta: text-sm text-gray-600
- Data/Stats: text-lg md:text-2xl font-bold (for metrics)

---

## Layout System

**Spacing Units**: Tailwind 2, 4, 6, 8, 12, 16, 20, 24 (maintain rhythm with multiples of 4)

**Grid Strategy**:
- Desktop dashboards: 3-column data displays (grid-cols-3)
- Patient lists: 1-column on mobile, 2-column on md+
- Doctor PROMS table: Full-width responsive table with horizontal scroll on mobile
- Forms: Single column max-w-md, centered

**Container Widths**:
- Dashboard content: max-w-7xl mx-auto px-6
- Forms/focused content: max-w-md mx-auto
- Full-width tables: w-full with inner container

---

## Component Library

### Navigation
**Patient Nav**: Horizontal top bar with Teddy logo, "Connections", "Meetings", "My Profile", profile avatar
**Doctor Nav**: Sidebar layout (left rail) with "Dashboard", "Patients", "PROMS", "Calls", "Settings"

### Data Display
**Patient List Row**: Avatar (48px rounded-full) + Name (font-semibold) + Status badge + Action buttons (right-aligned)
**PROMS Dashboard Cards**: White cards with shadow-sm, rounded-lg, p-6, displaying patient name, pre/post scores, status indicators
**Call History Table**: Striped rows, timestamp, participants, duration, transcript link

### Forms
**Input Fields**: Border-gray-300 rounded-md, focus:ring-2 ring-blue-500, h-11, px-4
**Buttons Primary**: bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-lg
**Buttons Secondary**: border-2 border-gray-300 hover:border-gray-400 bg-white px-6 py-2.5 rounded-lg

### Status Badges
- Pending: bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium
- Confirmed: bg-green-100 text-green-800
- Declined: bg-red-100 text-red-800
- Live Call: bg-blue-100 text-blue-800 with pulse animation

### Modals & Overlays
**Connection Request Modal**: Centered overlay (max-w-lg), white background, p-8, rounded-xl, shadow-2xl
**Call View**: Full-screen overlay during active calls, centered participant info, timer, mute/end controls

---

## Key Page Layouts

### Landing Page (Public - Not Logged In)
**Hero Section** (h-screen):
- Large hero image: Patient peer support scene (people connecting, medical environment, warm/reassuring)
- Overlay with blurred background buttons
- Center-aligned headline: "Connect with peers through your joint replacement journey"
- Two CTAs: "I'm a Patient" (primary), "I'm a Doctor" (secondary)
- Small trust indicators below: "HIPAA Compliant" badge, "Powered by CareBridge AI"

**Sections** (5 total):
1. How It Works (3-column grid: icons + descriptions)
2. For Patients (2-column: image left, benefits right)
3. For Doctors (2-column: benefits left, PROMS dashboard screenshot right)
4. Security & Compliance (centered, badges/certifications)
5. CTA Footer (centered signup prompt)

### Patient Dashboard
**Layout**: Full-width with left sidebar navigation

**Main Content** (3 tabs):
1. **Available Patients Tab**: Search bar (top), filter chips (status), patient list (cards in 2-column grid on lg+)
2. **My Connections Tab**: Outgoing requests list, incoming requests list, confirmed connections list
3. **Scheduled Meetings Tab**: Calendar view or list of upcoming/past meetings

**Right Sidebar**: Quick actions card, Teddy chat widget (collapsible)

### Doctor Dashboard
**Layout**: Sidebar navigation (left), main content area

**Main Dashboard View**:
- Stats row (4-column grid): Total Patients, Pending PROMS, Completed Surveys, Active Calls
- PROMS Table (full-width): Columns: Patient Name, Pre-Op Score, Post-Op Score, Status, Actions
- Quick Actions: Send Survey, Schedule Call, Generate Report

**PROMS Detail View**: Patient header card + Pre/Post score comparison charts + Billable codes section

### QR Link Page (`/link/[token]`)
**Layout**: Centered card (max-w-2xl)
- Doctor profile card: Avatar (128px), Name (text-3xl), Specialty, Office info (read-only)
- Primary CTA: "Link to Dr. [Name]" button (large, prominent)
- Info section: "What happens when I link?" expandable accordion
- No chat/call options (view-only)

### Call View (Active Call UI)
**Full-screen overlay** with dark semi-transparent background
- Center: Participant info, call timer (large text-4xl), connection status
- Bottom bar: Mute button (large icon), End Call button (red, prominent)
- For doctor calls: Live transcript sidebar (right), AI summary panel (updating in real-time)

---

## Images & Assets

**Hero Image**: 
- Full-width hero image showing diverse patients in supportive peer interaction (hospital or recovery setting)
- Image should convey warmth, trust, medical professionalism
- Placement: Landing page hero section, subtle overlay gradient for text readability

**Icon Library**: 
- Use Heroicons (CDN) for all UI icons
- Medical icons: stethoscope, heart-pulse, user-group, phone, qr-code, clipboard-check

**Teddy Mascot**:
- Small avatar/icon representation in chat widget and branding
- Not dominant but present as friendly guide

**Dashboard Screenshots**:
- Include PROMS dashboard mockup in "For Doctors" landing section
- Patient connection UI in "For Patients" section

**No Animations**: 
Minimal motion - only essential state transitions (button hovers, modal fades). No scroll animations or decorative motion.

---

## Accessibility & Security Indicators

- All forms maintain consistent ARIA labels and focus states
- HIPAA compliance badge visible in footer
- Lock icons on sensitive data tables
- Explicit consent checkboxes for connections/calls
- Clear role indicators (Patient/Doctor badges in navigation)
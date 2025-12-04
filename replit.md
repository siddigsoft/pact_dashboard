# PACT Workflow Platform

## Overview

The PACT (Planning, Approval, Coordination, and Tracking) Workflow Platform is a comprehensive field operations management system designed to streamline Monthly Monitoring Plans (MMPs), site visits, and field team coordination. Its core purpose is to enhance efficiency, transparency, and accountability in field operations. The platform offers multi-tier user management, robust role-based access control, real-time collaboration, detailed MMP and site visit workflows, real-time location sharing, advanced financial tracking (including transportation costs and down-payments), comprehensive reporting, and a mobile-responsive Mission Control Dashboard with role-aware navigation. This end-to-end solution provides significant market potential by optimizing field operations for various organizations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend, built with React 18, TypeScript, Tailwind CSS v3, and Shadcn UI, features a responsive, component-based design with dual-theme support and a custom color palette. It follows mobile-first design principles, including separate mobile/desktop components, touch-friendly UI, and PWA readiness.

### Technical Implementations
*   **Frontend:** Utilizes React Router DOM v6, Vite, and React Context API for global state. TanStack Query manages server state, and Supabase Realtime handles subscriptions. Data consistency between web and mobile is ensured via a shared Supabase database with real-time subscriptions and an offline queue for mobile.
*   **Backend:** Leverages PostgreSQL via Supabase, employing Row Level Security (RLS) and real-time subscriptions. Supabase Auth provides authentication with email/password, Google OAuth, session management, role-based access control, and TOTP-based Two-Factor Authentication (2FA). The database schema supports core entities like profiles, roles, projects, MMPs, site visits, budgets, wallets, and cost submissions, with audit logs for financial transactions and deletions.
*   **Mobile Offline Infrastructure:** Features IndexedDB for local storage, a Sync Manager for robust offline-to-online data synchronization, dedicated mobile UI components, a Service Worker for caching strategies, and integration for Android-specific functionalities like background location permissions and back button handling. Image compression is applied to photos before upload.

    **Offline-Capable Features (work fully offline, sync when connected):**
    - Site Visit Start/Complete: Full workflow stored in IndexedDB, synced on reconnect
    - GPS Location Capture: Locations queued locally with accuracy metadata
    - Photo Capture: Images compressed and queued for upload
    - Cost Submissions: Draft submissions stored locally
    - Settings/Preferences: Cached in IndexedDB
    - MMP List: Cached site data with TTL (60 minutes default)

    **Online-Only Features (require connectivity):**
    - Dashboard real-time stats and live updates
    - Wallet operations (balance, transactions, withdrawals)
    - Chat messaging (Supabase real-time)
    - Team live location map (viewing others' locations)
    - Reports generation and export
    - User management and approvals
    - Push notifications

    **Sync Mechanism:**
    - Automatic sync triggered on network restoration
    - Manual sync available via "Sync Now" button
    - Priority order: Site visits > Locations > Pending actions
    - Max 3 retries per failed sync action
    - Progress callbacks for UI feedback
    - Conflict resolution: Last-write-wins with server timestamp

    **Mobile Navigation Enhancements:**
    - Unified bottom navigation with offline/sync status indicator
    - Pending sync count badge on More menu
    - Offline mode banner when disconnected
    - Sync progress bar during synchronization
    - Offline capability indicators on menu items
*   **Android APK Build:** Capacitor-based mobile deployment with 9 native plugins (app, camera, device, filesystem, geolocation, local-notifications, network, push-notifications, status-bar). Supports deep linking via pact:// scheme and HTTPS URLs. MobileAppShell component handles app lifecycle, GPS tracking, push notifications, and network monitoring. Geofencing support with Haversine distance calculations for site proximity detection. Error boundaries with retry mechanisms and diagnostic logging.

### Feature Specifications
*   **Authorization System:** Resource-action based permission model (`mmp:read`, `site_visits:create`) with granular permissions and admin bypass, enforced across UI, route guards, and server-side RLS.
*   **File Processing:** MMP Upload Workflow for CSV files includes Zod validation, row-by-row parsing, and database insertion with rollback; includes duplicate MMP and same-site-same-month prevention.
*   **Real-Time Capabilities:** Live Dashboard with automatic data refresh and notifications via Supabase Realtime, and real-time GPS location sharing with privacy controls.
*   **Notification System:** Comprehensive browser push notifications with configurable settings.
*   **Financial Management:** Advanced transportation cost and down-payment system with a two-tier approval workflow and audit trails. Enumerator fees are calculated based on classification and stored atomically. Supervisors and admins have full visibility into team cost submissions with approval capabilities. The Finance Approval page displays real-time wallet balances for each withdrawal request, with color-coded insufficient balance warnings, shortfall amounts, receipt attachment support, and batch processing capabilities.
*   **Hub & Field Operations Structure:** Geographical management for hubs, states, and localities, with a master sites registry and interactive Leaflet maps. Supports a Hub-Based Supervision Model where supervisors manage multiple states within their assigned hub.
*   **Site Visits Enhancements:** Redesigned interface, data collector-specific view, geographic filtering, GPS-based proximity matching for enumerators using the Haversine formula, and a first-claim dispatch system utilizing an atomic PostgreSQL RPC function.
*   **Unified Site Management System:** Prevents duplicate site entries and enables GPS enrichment over time, with sites registered and matched during MMP upload.
*   **Tracker Preparation Plan:** Analyzes planned vs. actual site coverage, provides real-time updates, and facilitates invoice preparation with detailed cost breakdowns, multi-view analysis, and export capabilities.
*   **Visit Tracking:** Dedicated database columns `visit_started_at`, `visit_started_by`, `visit_completed_at`, `visit_completed_by` in `mmp_site_entries` for comprehensive tracking.
*   **GPS Accuracy Display:** Location accuracy is displayed across all team location views with color-coded indicators.
*   **Signature & Transaction Module:** Comprehensive digital signature system for wallet transactions and document signing:
    - **Transaction Signatures:** SHA-256 hashing for transaction integrity verification with cryptographically secure OTP generation
    - **Document Signatures:** Multi-method support (UUID, phone, email, handwriting) for contract signing
    - **Handwriting Signatures:** Canvas-based signature pad (SignaturePad.tsx, MobileSignaturePad.tsx) with touch support and image upload
    - **Signature Verification:** Built-in verification dialog with audit trail logging
    - **Mobile Support:** Optimized mobile components with gesture recognition and offline-capable signature capture
    - **Audit Logging:** Immutable SignatureAuditLog for compliance tracking and legal evidence
    - **Wallet Integration:** useSignature hook integrates with WalletContext for automatic transaction signing
    - **Notification Triggers:** Signature-related notifications with category persistence (transaction signed, signature verified, document signed, signature required, signature revoked)
    - **Security:** Web Crypto API with fallback, cryptographically secure OTP via crypto.getRandomValues, hash verification uses stored timestamps
    - **Phone/Email Pre-Verification:** VerificationEnforcementService enforces that phone/email must be verified in user profile before allowing those signature methods. Enforcement is integrated into generateDocumentSignature() to block unverified users.
    - **OTP Delivery Integration:** OTPDeliveryService provides mock delivery for development (logs OTP to console). Production deployment requires implementing a Supabase Edge Function for secure Twilio/SendGrid integration - see getProductionImplementationGuide() for template.
*   **Task-Level Budget Tracking:** Granular budget management at individual task/activity level:
    - **TaskBudget Interface:** Tracks allocated, spent, remaining budget with category breakdown (labor, transportation, materials, other)
    - **Variance Analysis:** Calculates budget variance percentage, Cost Performance Index (CPI), Schedule Performance Index (SPI), Estimate at Completion (EAC)
    - **Variance Status:** Automatic classification as under_budget, on_budget, over_budget, or critical based on configurable thresholds
    - **Trend Detection:** Tracks if budget trend is improving, stable, or worsening
    - **Spending Restrictions:** Blocks transactions that would exceed task budget, with escalation support
    - **80% Threshold Alerts:** Automatic notifications when task budget reaches 80% utilization
    - **Project Summary:** Aggregated variance analysis across all tasks with CPI, task counts by status

### Required Database Schema Changes
The following schema changes are required for full functionality of new features:

**Profiles Table - Phone/Email Verification Columns:**
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
```

**Handwriting Signatures Table:**
```sql
CREATE TABLE IF NOT EXISTS handwriting_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  signature_image TEXT NOT NULL,
  signature_type VARCHAR NOT NULL DEFAULT 'drawn',
  canvas_width INTEGER,
  canvas_height INTEGER,
  stroke_count INTEGER,
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_handwriting_signatures_user_id ON handwriting_signatures(user_id);
CREATE INDEX idx_handwriting_signatures_is_active ON handwriting_signatures(is_active);

ALTER TABLE handwriting_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own signatures"
  ON handwriting_signatures FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own signatures"
  ON handwriting_signatures FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own signatures"
  ON handwriting_signatures FOR UPDATE
  USING (auth.uid() = user_id);
```

**Task Budgets Table:**
```sql
CREATE TABLE IF NOT EXISTS task_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR NOT NULL,
  task_name VARCHAR NOT NULL,
  project_id UUID NOT NULL,
  mmp_file_id UUID,
  allocated_budget_cents BIGINT NOT NULL DEFAULT 0,
  spent_budget_cents BIGINT NOT NULL DEFAULT 0,
  remaining_budget_cents BIGINT NOT NULL DEFAULT 0,
  planned_start_date DATE,
  planned_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  estimated_hours INTEGER,
  actual_hours INTEGER,
  category_breakdown JSONB DEFAULT '{"labor": 0, "transportation": 0, "materials": 0, "other": 0}',
  variance JSONB,
  status VARCHAR NOT NULL DEFAULT 'draft',
  priority VARCHAR NOT NULL DEFAULT 'medium',
  assigned_to UUID,
  created_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  budget_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_budget_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_budget_id UUID NOT NULL REFERENCES task_budgets(id),
  transaction_type VARCHAR NOT NULL,
  amount_cents BIGINT NOT NULL,
  category VARCHAR,
  description TEXT,
  reference_id VARCHAR,
  balance_before_cents BIGINT,
  balance_after_cents BIGINT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### System Design Choices
The project utilizes a unified Supabase client for all Supabase interactions, ensuring consistent authentication and session management. The system integrates the complete Sudan administrative structure (18 states, 188 localities) based on official OCHA/WFP COD-AB data.

## External Dependencies

*   **Supabase:** PostgreSQL database, Authentication, Realtime subscriptions, Storage, Row Level Security.
*   **Shadcn UI Components:** Radix UI primitives.
*   **Recharts:** Data visualization.
*   **Lucide React:** Iconography.
*   **Vite:** Build tool.
*   **ESLint, TypeScript:** Code quality and typing.
*   **React Hook Form, Zod:** Form management and validation.
*   **date-fns, uuid, clsx/class-variance-authority:** Utilities.
*   **Leaflet:** Map components.
*   **jspdf, jspdf-autotable, xlsx:** PDF and Excel export.
*   **Replit:** Development environment.
*   **Vercel:** Production hosting.
*   **Capacitor:** Mobile deployment (iOS/Android builds, native API access).
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
*   **Project-Level Access Control:** Comprehensive project-based data isolation ensuring users only see data for projects they belong to. Implementation details:
    - **useUserProjects Hook** (`src/hooks/useUserProjects.ts`): Core hook providing `userProjectIds`, `userProjectTeamUserIds`, `isProjectMember()`, `hasProjectAccess()`, and `isAdminOrSuperUser` for filtering.
    - **Data Linkage Chain**: SiteVisit → MMP (via `mmpDetails.mmpId`) → Project (via `projectId`) enables proper filtering.
    - **Admin Bypass**: Admin, Super Admin, and ICT roles bypass all project filtering and see all data.
    - **Filtered Components**: SiteVisits.tsx, MMP.tsx, MMPManagementPage.tsx, FieldTeam.tsx, Budget.tsx, CostSubmission.tsx, Reports.tsx, and all Dashboard zones (FOMZone, OperationsZone, DataCollectorZone, PlanningZone, ComplianceZone, PerformanceZone).
    - **Pattern**: Check `isAdminOrSuperUser` first, then filter arrays using `userProjectIds` with MMP-to-project linkage for site visits.
    - **Project Manager Assignment**: Each project can have a designated Project Manager selected from the user list. The PM is displayed in project list cards and detail views with name and role.
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
*   **Documentation Export System:** Comprehensive user documentation with PDF and Word export capabilities. Features 23 content sections covering all platform features, workflow steps table, quick reference guides (role permissions, status colors, keyboard shortcuts, mobile gestures), and proper pagination. Accessible via /documentation route.

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
*   **docx, file-saver:** Word document export for documentation.
*   **Replit:** Development environment.
*   **Vercel:** Production hosting.
*   **Capacitor:** Mobile deployment (iOS/Android builds, native API access).
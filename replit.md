# PACT Command Center

## Overview
PACT Command Center is a centralized Field Operations Command Center for managing humanitarian and development field operations. It provides a unified interface for planning, coordinating, executing, and monitoring field activities, including Monthly Monitoring Plans (MMPs) and site visits. The platform aims to enhance efficiency, transparency, and accountability through multi-tier user management, robust role-based access control, real-time collaboration, detailed workflows, GPS location sharing, advanced financial tracking, comprehensive reporting, and a mobile-responsive Mission Control Dashboard. Key capabilities include IONOS SMTP email notifications, popup notifications, and complete offline mobile functionality.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18, TypeScript, Tailwind CSS v3, and Shadcn UI, featuring a responsive, component-based design with dual-theme support and a custom color palette. It adheres to mobile-first principles, including separate mobile/desktop components, touch-friendly UI, and PWA readiness.

### Technical Implementations
*   **Frontend:** Built with React Router DOM v6, Vite, and React Context API. It uses TanStack Query for server state management and Supabase Realtime for subscriptions. Data consistency between web and mobile is maintained via a shared Supabase database with real-time subscriptions and an offline queue for mobile.
*   **Backend:** Leverages PostgreSQL through Supabase, utilizing Row Level Security (RLS) and real-time subscriptions. Supabase Auth handles authentication (email/password, Google OAuth), session management, role-based access control, and TOTP-based 2FA. The database schema supports core entities like profiles, roles, projects, MMPs, site visits, budgets, wallets, and cost submissions, with audit logs for financial transactions and deletions.
*   **Mobile Offline Infrastructure:** Features IndexedDB for local storage, a Sync Manager for robust offline-to-online data synchronization with configurable conflict resolution, and a Service Worker for caching. Offline capabilities include site visit workflows, GPS/photo capture, cost submissions, and cached MMP lists. The Android APK is Capacitor-based with native plugins for enhanced push notifications and continuous GPS tracking.
*   **Authorization System:** Implements a resource-action based permission model with granular control enforced across the UI, route guards, and server-side RLS.
*   **File Processing:** Includes an MMP Upload Workflow for CSV files with Zod validation, parsing, database insertion, rollback, and duplicate prevention.
*   **Real-Time Capabilities:** Features a Live Dashboard with automatic data refresh and notifications via Supabase Realtime, and real-time GPS location sharing with privacy controls.
*   **Financial Management:** Provides an advanced transportation cost and down-payment system with a two-tier approval workflow and audit trails. Includes enumerator fee calculation and a Finance Approval page with real-time wallet balances, shortfall warnings, receipt support, and batch processing.
*   **Hub & Field Operations Structure:** Supports geographical management for hubs, states, and localities, a master sites registry, and interactive Leaflet maps, facilitating a Hub-Based Supervision Model.
*   **Site Visits Enhancements:** Redesigned interface with data collector-specific views, geographic filtering, GPS-based proximity matching, and a first-claim dispatch system.
*   **Unified Site Management System:** Prevents duplicate site entries and enables GPS enrichment.
*   **Signature & Transaction Module:** Comprehensive digital signature system for wallet transactions and document signing, supporting SHA-256 hashing, cryptographically secure OTP, handwriting signatures, and audit logging.
*   **Task-Level Budget Tracking:** Granular budget management at the individual task/activity level with variance analysis, status classification, spending restrictions, and utilization alerts.
*   **Password Management System:** Custom password reset with 6-digit OTP via email, password change with MFA, and admin password reset capabilities, all with bilingual support.
*   **Email Verification & Notification System:** Features email verification, admin manual email confirmation, IONOS SMTP integration for transactional emails, and bilingual email templates for various notifications.
*   **Comprehensive Email Tracking System:** Real-time tracking of all emails sent from the platform via the EmailTracking page, including delivery status, filtering, search, and statistics dashboard.
*   **Realtime Status Indicators:** Components provide visual feedback on connection and data freshness.
*   **Hub Management Notification System:** Centralized service for sending notifications to relevant management users for MMP forwarding, site operations, financial transactions, and activity milestones, with deduplication.
*   **Targeted Email Notification System:** Optimized to reduce email volume, sending notifications to specific recipients with Super Admin CC, and including a 2-second delay for multiple recipients.
*   **Multi-Tier MMP Recall System:** Implements a three-tier recall hierarchy with scope-based filtering and force recall for Super Admins/Admins. Includes a financial recovery system for transportation advances and an approval workflow, with comprehensive audit logging and bilingual notifications. Features an impact preview and enhanced approval queue and recovery dashboard.
*   **Visit Postponement System:** Allows data collectors and coordinators to request visit date changes with an approval workflow and historical tracking.
*   **Date Range Visit Support:** Enables multi-day visits with `visitDateFrom` and `visitDateTo` fields, special handling for DM/GFA activities, and deadline calculations based on the start date.
*   **Configurable Auto-Release System:** Administrators can configure auto-release timing, confirmation deadlines, and reminder frequency presets for site visits.
*   **MoDa Webhook Integration:** Supabase Edge Function (`moda-webhook`) receives real-time form submissions from MoDa/ODK, automatically registering sites with coordinates.
*   **Site Normalization System:** Centralized utility (`src/utils/siteNormalization.ts`) provides consistent state/locality/site matching across the application, including state/locality aliasing, state code lookup, fuzzy matching, and multi-level site matching.
*   **Smart Dispatch System:** Three-tier collector recommendation system (`src/services/collectorRecommendation.service.ts`) for optimal site assignment, prioritizing in-locality, neighboring, and state-wide collectors with a priority scoring mechanism.
*   **Coverage Gap Notification System:** Detects and notifies admins when dispatching to localities with insufficient collector coverage (`src/services/coverageGapNotification.service.ts`), providing critical and warning gap alerts.
*   **Flexible Locality Permit Requirement Workflow:** Streamlined locality permit verification process (`src/components/mmp/LocalityRequirementTriageDialog.tsx`, `src/pages/coordinator/CoordinatorSites.tsx`) with upfront locality triage, smart filtering, and auto-advancement of sites.
*   **MMP Verification Workflow:** Final verification step enabling MMP progression to approval/costing/dispatch (`src/context/mmp/hooks/useMMPStatusOperations.ts`) with role-based access, deep merge preservation of verification data, and status progression.
*   **Document Registry & Indexing System:** Persistent document management with comprehensive metadata indexing (`src/services/document-index.service.ts`, `src/pages/Documents.tsx`), including automatic indexing of uploaded permits, deduplication, cross-source merging, and comprehensive filtering.
*   **Security-Hardened Activity Tracking System:** Comprehensive user activity logging (`src/services/activity-tracking.service.ts`, `src/context/activity/ActivityTrackingContext.tsx`) with strict data minimization. Features central sanitization that strips query parameters, UUIDs, emails, phone numbers, and tokens from all logged data; allowlist-based metadata filtering (only operational fields like entityType, resultsCount, recordCount, format, duration, status, count); generic descriptions that avoid embedding user-provided text, filenames, URLs, or search queries; and localStorage buffering with batched sync to `user_activity_logs` table. All helper methods use prefixed underscore parameters for ignored sensitive inputs.

### System Design Choices
The project uses a unified Supabase client for all interactions, ensuring consistent authentication and session management, and integrates the complete Sudan administrative structure.

## External Dependencies
*   **Supabase:** PostgreSQL database, Authentication, Realtime, Storage, Row Level Security.
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
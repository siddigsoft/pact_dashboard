# PACT Command Center

## Overview
PACT Command Center is a centralized Field Operations Command Center designed to manage humanitarian and development field operations. It provides a unified platform for planning, coordinating, executing, and monitoring field activities, including Monthly Monitoring Plans (MMPs) and site visits. The project aims to enhance efficiency, transparency, and accountability through features like multi-tier user management, role-based access control, real-time collaboration, detailed workflows, GPS location sharing, advanced financial tracking, comprehensive reporting, and a mobile-responsive Mission Control Dashboard. Key capabilities include IONOS SMTP email notifications, popup notifications, and complete offline mobile functionality to support field staff.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend utilizes React 18, TypeScript, Tailwind CSS v3, and Shadcn UI, providing a responsive, component-based design with dual-theme support and a custom color palette. It adheres to mobile-first principles, incorporating separate mobile/desktop components, touch-friendly UI, and PWA readiness.

### Technical Implementations
*   **Frontend:** Built with React Router DOM v6, Vite, and React Context API. It uses TanStack Query for server state management and Supabase Realtime for subscriptions.
*   **Backend:** Leverages PostgreSQL through Supabase, utilizing Row Level Security (RLS) and real-time subscriptions. Supabase Auth handles authentication (email/password, Google OAuth), session management, role-based access control, and TOTP-based 2FA. The database schema supports core entities like profiles, roles, projects, MMPs, site visits, budgets, wallets, and cost submissions, with audit logs for financial transactions.
*   **Mobile Offline Infrastructure:** Features IndexedDB for local storage, a Sync Manager for robust offline-to-online data synchronization, and a Service Worker for caching. Offline capabilities include site visit workflows, GPS/photo capture, cost submissions, and cached MMP lists. The Android APK is Flutter-based with native plugins for enhanced push notifications and continuous GPS tracking.
*   **Authorization System:** Implements a resource-action based permission model with granular control enforced across the UI, route guards, and server-side RLS.
*   **File Processing:** Includes an MMP Upload Workflow for CSV files with Zod validation, parsing, database insertion, and duplicate prevention.
*   **Real-Time Capabilities:** Features a Live Dashboard with automatic data refresh and notifications via Supabase Realtime, and real-time GPS location sharing.
*   **Financial Management:** Provides an advanced transportation cost and down-payment system with a two-tier approval workflow and audit trails. Includes enumerator fee calculation and a Finance Approval page with real-time wallet balances and batch processing.
*   **Hub & Field Operations Structure:** Supports geographical management for hubs, states, and localities, a master sites registry, and interactive Leaflet maps.
*   **Site Visits Enhancements:** Redesigned interface with data collector-specific views, geographic filtering, GPS-based proximity matching, and a first-claim dispatch system.
*   **Unified Site Management System:** Prevents duplicate site entries and enables GPS enrichment.
*   **Signature & Transaction Module:** Comprehensive digital signature system for wallet transactions and document signing, supporting SHA-256 hashing, cryptographically secure OTP, and handwriting signatures.
*   **Task-Level Budget Tracking:** Granular budget management at the individual task/activity level with variance analysis and utilization alerts.
*   **Password Management System:** Custom password reset with 6-digit OTP via email, password change with MFA, and admin password reset capabilities, all with bilingual support.
*   **Email Verification & Notification System:** Features email verification, admin manual email confirmation, IONOS SMTP integration for transactional emails, and bilingual email templates.
*   **Comprehensive Email Tracking System:** Real-time tracking of all emails sent from the platform including delivery status, filtering, and statistics.
*   **Realtime Status Indicators:** Components provide visual feedback on connection and data freshness.
*   **Hub Management Notification System:** Centralized service for sending notifications to relevant management users for MMP forwarding, site operations, financial transactions, and activity milestones.
*   **Targeted Email Notification System:** Optimized to reduce email volume, sending notifications to specific recipients with Super Admin CC, and including a 2-second delay for multiple recipients.
*   **Multi-Tier MMP Recall System:** Implements a three-tier recall hierarchy with scope-based filtering and force recall for Super Admins/Admins. Includes a financial recovery system and an approval workflow.
*   **Visit Postponement System:** Allows data collectors and coordinators to request visit date changes with an approval workflow and historical tracking.
*   **Date Range Visit Support:** Enables multi-day visits with `visitDateFrom` and `visitDateTo` fields and deadline calculations.
*   **Configurable Auto-Release System:** Administrators can configure auto-release timing, confirmation deadlines, and reminder frequency presets for site visits.
*   **MoDa Webhook Integration:** Supabase Edge Function receives real-time form submissions from MoDa/ODK, automatically registering sites with coordinates.
*   **Site Normalization System:** Centralized utility provides consistent state/locality/site matching across the application, including aliasing, code lookup, and fuzzy matching.
*   **Smart Dispatch System:** Three-tier collector recommendation system for optimal site assignment, prioritizing in-locality, neighboring, and state-wide collectors.
*   **Coverage Gap Notification System:** Detects and notifies admins when dispatching to localities with insufficient collector coverage.
*   **Flexible Locality Permit Requirement Workflow:** Streamlined locality permit verification process with upfront locality triage, smart filtering, and auto-advancement of sites.
*   **MMP Verification Workflow:** Final verification step enabling MMP progression to approval/costing/dispatch with role-based access and status progression.
*   **Document Registry & Indexing System:** Persistent document management with comprehensive metadata indexing, including automatic indexing of uploaded permits, deduplication, and filtering.
*   **Security-Hardened Activity Tracking System:** Comprehensive user activity logging with strict data minimization, central sanitization, allowlist-based metadata filtering, and generic descriptions.
*   **Comprehensive Coverage Analytics Dashboard:** Enhanced Analytics Reports page with a professional gradient header, 4 main tabs (Overview, Productivity, Efficiency, Coverage Analytics), and MMP-style sub-tab navigation. Coverage Analytics features 4 sub-tabs with date range filtering and export functionality.
*   **Admin-Managed Support Contacts System:** Centralized support contact management shared between web and mobile platforms. Supports bilingual contact information and role-based access.
*   **Mobile Admin Dashboard:** Flutter-based admin screens with role-based navigation access. Provides support contacts CRUD, user approval management, system statistics, and complete user management with role changes and bulk operations.
*   **Enhanced Mobile Admin Screens:** Comprehensive admin management matching web application features including User Management (CRUD, filtering, approval), Role Management (display roles, user counts, permissions), Audit Logs (Super Admin only, activity tracking with filtering), and Email Tracking (Super Admin only, delivery monitoring). All implement Supabase Realtime for live data sync.
*   **Permission Handler Service:** Centralized permission management for requesting camera, microphone, location, storage, notification, phone, and bluetooth permissions with platform-specific handling.
*   **Comprehensive Help & Support System:** Mobile bilingual Help & Support screen with tabbed interface covering Getting Started, Troubleshooting, Field Operations, and Contact Support, featuring expandable FAQ sections.
*   **Unified Communications Screen:** Mobile Communications screen consolidating calls and messages into a single interface. Features real-time online presence indicators, WebRTC audio calls, and direct messaging.
*   **Enhanced WebRTC Call Features:** Comprehensive call enhancements including:
    - **Call Quality Monitoring:** Real-time packet loss, latency, and bitrate tracking with 5-bar quality indicator display.
    - **Auto-Reconnect:** Automatic reconnection attempts (max 5) when connection drops during active calls.
    - **Hold/Resume:** Pause and resume calls with remote user notification via signaling channel.
    - **Call Recording:** Framework for recording calls with status indicators (requires native implementation).
    - **Call Notes:** Take notes during or after calls with local storage and Supabase sync.
    - **Call History Service:** Persistent call logs stored in Hive (max 100 entries) with Supabase synchronization.
    - **Proximity Sensor:** Screen turns off when phone is near ear during audio calls to prevent accidental touches.
    - **Wakelock:** Screen stays on during calls to prevent timeout during active conversations.
    - **Haptic Feedback:** Vibration patterns for call start, connect, and end events.
    - **Noise Suppression:** Enhanced audio processing for clearer voice communication.
*   **Shorebird OTA Updates:** Integration with Shorebird code push for over-the-air updates. Settings screen and drawer menu display current version, build number, and patch number.
*   **Mobile Digital Signatures:** Flutter Digital Signatures screen with canvas-based signature drawing, PNG export, signature management, and signing history.
*   **Mobile Field Team Map:** Admin-only Field Team Map screen for monitoring field team locations in real-time. Features flutter_map integration, color-coded online status, auto-refresh, filtering, and direct call/message actions via WebRTC.
*   **Bilingual Notification Service:** Mobile notification service with comprehensive Arabic/English translations for all notification types.
*   **Mobile-Web Integration Pages:** Web admin pages for managing mobile features:
    - MobileSupportTickets: View/respond to support tickets from mobile users
    - MobileHelpArticles: Manage bilingual help articles for mobile app
    - MobileSignatureAdmin: View/verify digital signatures from mobile
    - MobileCallScheduling: Monitor scheduled calls from mobile users
    - MobileDocumentSync: Track document sync status from mobile devices

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
# PACT Command Center

## Overview
PACT Command Center is a centralized Field Operations Command Center designed to manage humanitarian and development field operations. It provides a unified platform for planning, coordinating, executing, and monitoring field activities, including Monthly Monitoring Plans (MMPs) and site visits. The project aims to enhance efficiency, transparency, and accountability through features like multi-tier user management, role-based access control, real-time collaboration, detailed workflows, GPS location sharing, advanced financial tracking, comprehensive reporting, and a mobile-responsive Mission Control Dashboard. Key capabilities include email notifications, popup notifications, and complete offline mobile functionality to support field staff.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18, TypeScript, Tailwind CSS v3, and Shadcn UI for a responsive, component-based design with dual-theme support and a custom color palette. It adheres to mobile-first principles with separate mobile/desktop components, touch-friendly UI, and PWA readiness.

### Technical Implementations
*   **Frontend:** Built with React Router DOM v6, Vite, and React Context API. It uses TanStack Query for server state management and Supabase Realtime for subscriptions.
*   **Backend:** Leverages PostgreSQL through Supabase, utilizing Row Level Security (RLS) and real-time subscriptions. Supabase Auth handles authentication, session management, role-based access control, and TOTP-based 2FA. The database schema supports core entities like profiles, roles, projects, MMPs, site visits, budgets, wallets, and cost submissions, with audit logs for financial transactions.
*   **Mobile Offline Infrastructure:** Features IndexedDB for local storage, a Sync Manager for robust offline-to-online data synchronization, and a Service Worker for caching. Offline capabilities include site visit workflows, GPS/photo capture, cost submissions, and cached MMP lists. The Android APK is Flutter-based with native plugins.
*   **Authorization System:** Implements a resource-action based permission model with granular control enforced across the UI, route guards, and server-side RLS.
*   **File Processing:** Includes an MMP Upload Workflow for CSV files with Zod validation, parsing, database insertion, and duplicate prevention.
*   **Real-Time Capabilities:** Features a Live Dashboard with automatic data refresh and notifications via Supabase Realtime, and real-time GPS location sharing.
*   **Financial Management:** Provides an advanced transportation cost and down-payment system with a two-tier approval workflow and audit trails. Includes enumerator fee calculation and a Finance Approval page with real-time wallet balances and batch processing. A dedicated operational cost submission system covers 9 expense categories with a two-tier approval workflow.
*   **User Roles:** Includes a Country Director role for senior leadership oversight with read-only access and an Admin/Super Admin approval workflow for operational costs. A Data Team role focuses on analytics and reporting with read access to key data.
*   **Hub & Field Operations Structure:** Supports geographical management for hubs, states, and localities, a master sites registry, and interactive Leaflet maps.
*   **Site Visits Enhancements:** Redesigned interface with data collector-specific views, geographic filtering, GPS-based proximity matching, and a first-claim dispatch system. A Unified Site Management System prevents duplicate entries and enables GPS enrichment.
*   **Signature & Transaction Module:** Comprehensive digital signature system for wallet transactions and document signing, supporting SHA-256 hashing, cryptographically secure OTP, and handwriting signatures.
*   **Task-Level Budget Tracking:** Granular budget management at the individual task/activity level with variance analysis and utilization alerts.
*   **Communication Systems:** Custom password management with OTP, email verification and notification system via IONOS SMTP with bilingual templates, and comprehensive email tracking. Realtime status indicators provide visual feedback. A Hub Management Notification System and Targeted Email Notification System manage notifications efficiently.
*   **MMP and Visit Management:** A multi-tier MMP Recall System with financial recovery and approval workflow. A Visit Postponement System with approval workflow and historical tracking. Date Range Visit Support for multi-day visits. A configurable Auto-Release System for site visits.
*   **Site Integration & Normalization:** MoDa Webhook Integration via Supabase Edge Function for real-time form submissions and automatic site registration. A Site Normalization System ensures consistent state/locality/site matching.
*   **Dispatch & Coverage:** A Smart Dispatch System for optimal collector assignment and a Coverage Gap Notification System to alert admins about insufficient coverage.
*   **Workflow Management:** Flexible Locality Permit Requirement Workflow for streamlined permit verification. An MMP Verification Workflow for progression to approval/costing/dispatch.
*   **Document Management:** A Document Registry & Indexing System with metadata indexing, deduplication, and filtering.
*   **Security & Tracking:** A Security-Hardened Activity Tracking System for comprehensive user activity logging with data minimization.
*   **Reporting & Analytics:** A Comprehensive Coverage Analytics Dashboard with various reports and export functionality.
*   **Mobile Specific Features:**
    *   **Admin-Managed Support Contacts System:** Centralized bilingual support contact management.
    *   **Mobile Admin Dashboard:** Flutter-based admin screens for user, role, audit log, and email tracking management with Supabase Realtime sync.
    *   **Permission Handler Service:** Centralized permission management for device features.
    *   **Help & Support System:** Mobile bilingual screen with FAQ and contact support.
    *   **Unified Communications Screen:** Consolidates calls and messages, featuring real-time online presence, WebRTC audio calls, and Jitsi Meet video calls. Enhanced WebRTC call features include quality monitoring, auto-reconnect, hold/resume, call recording framework, call notes, call history, proximity sensor, wakelock, haptic feedback, and noise suppression.
    *   **Shorebird OTA Updates:** Integration for over-the-air updates.
    *   **Mobile Digital Signatures:** Canvas-based signature drawing with performance optimizations.
    *   **Mobile Field Team Map:** Admin-only real-time field team location monitoring with flutter_map integration.
    *   **Bilingual Notification Service:** Comprehensive Arabic/English translations for all notifications.
    *   **Mobile Support Ticket System:** In-app ticket management with categories, priorities, status tracking, and email fallback.
    *   **Mobile Operational Cost Submission System:** Complete expense tracking with 10 categories, 2 funding types, 4-tab interface, multi-tier approval workflow, and reconciliation system.
    *   **Mobile Advance Requests Report:** Transportation advance cost analytics with 6 grouping views (All, Team, Hub, Status, State, Project), gradient SliverAppBar, stat cards, CSV export via share_plus, and comprehensive role-based access control.
*   **Mobile-Web Integration Pages:** Web admin pages for managing mobile support tickets, help articles, digital signatures, call scheduling, and document sync.

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
*   **Flutter Mobile (APK v1.0.6+9):** Dart/Flutter framework with Supabase Flutter, flutter_webrtc, jitsi_meet_flutter_sdk, Hive for offline storage, flutter_map, Google Fonts, and Shorebird for OTA updates.

## Known Build Issues
*   **WebRTC Duplicate Class Conflict:** When building APK with both flutter_webrtc and jitsi_meet_flutter_sdk, exclude duplicate WebRTC classes in `android/app/build.gradle`:
    ```gradle
    configurations.all {
        resolutionStrategy { force 'org.jitsi:webrtc:124.0.0' }
        exclude group: 'io.github.webrtc-sdk', module: 'android'
    }
    ```

## Mobile Flutter File Structure
Key files in `mobile_flutter/PACT_mobile-PACT-MAIN-shorebird/lib/`:
*   **Models:** `operational_cost_submission.dart` (cost submission data model with CostSubmissionPermissions class), `advance_request_report.dart` (report data models with AdvanceRequestData, ReportGroupData, ReportStats, StatusBadgeInfo)
*   **Services:** `operational_cost_service.dart`, `help_enhancements_service.dart`, `webrtc_service.dart`, `jitsi_service.dart`, `advance_report_service.dart` (advance request report data fetching and grouping)
*   **Screens:** `cost_submission_screen.dart`, `support_screen.dart`, `help_support_screen.dart`, `digital_signatures_screen.dart`, `communications_screen.dart`, `advance_requests_report_screen.dart` (6-tab report with CSV export)
*   **Widgets:** `cost_submission/` folder with `cost_submit_tab.dart`, `cost_history_tab.dart`, `cost_outstanding_tab.dart`, `cost_reconciliation_tab.dart`, `cost_stats_cards.dart`
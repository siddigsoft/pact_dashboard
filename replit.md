# PACT Command Center

## Overview
PACT Command Center is a centralized platform for managing humanitarian and development field operations, specifically Monthly Monitoring Plans (MMPs) and site visits. It aims to enhance efficiency, transparency, and accountability through tools for planning, coordination, execution, and monitoring. Key features include multi-tier user management, role-based access control, real-time collaboration, detailed workflows, GPS location sharing, advanced financial tracking, comprehensive reporting, and a mobile-responsive Mission Control Dashboard with full offline functionality and notifications. The project's ambition is to streamline field operations and improve humanitarian aid delivery.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is built with React 18, TypeScript, Tailwind CSS v3, and Shadcn UI, adhering to mobile-first and responsive design principles. It features a component-based structure, dual-theme support, a custom color palette, touch-friendly UI, and PWA readiness.

### Technical Implementations
*   **Frontend:** React 18, React Router DOM v6, Vite, React Context API, TanStack Query, and Supabase Realtime.
*   **Backend:** PostgreSQL via Supabase with Row Level Security (RLS) and real-time capabilities. Supabase Auth for authentication, sessions, role-based access control, and TOTP-based 2FA.
*   **Mobile Offline Infrastructure:** IndexedDB, Sync Manager, and Service Worker for offline workflows. The Android app is Flutter-based.
*   **Authorization System:** Resource-action based permission model with various user roles.
*   **File Processing:** MMP Upload Workflow with Zod validation, Excel Upload Parser, and Partial MMP Update system.
*   **Real-Time Capabilities:** Live Dashboard, notifications via Supabase Realtime, and real-time GPS location sharing.
*   **Financial Management:** Advanced transportation cost and down-payment systems with two-tier approval. Operational cost submission with nine expense categories, two-tier approval, digital signatures, PDF certificate generation, aging reports, budget vs. actual comparison, duplicate payment detection, cash flow forecasting, financial period close, and reconciliation dashboard. Automated deduction of transportation advances. Fund Receipt Confirmation system. Reclaim Financial Gap System for tracking advances affected by site reclaims, including write-off workflows and comprehensive reporting.
*   **Hub & Field Operations Structure:** Management of geographical structures, master sites registry, and interactive Leaflet maps.
*   **Site Visits Enhancements:** Redesigned interface, data collector-specific views, geographic filtering, GPS proximity matching, first-claim dispatch, and Unified Site Management System.
*   **Signature & Transaction Module:** Digital signature system for wallet transactions and documents.
*   **Task-Level Budget Tracking:** Granular budget management with variance analysis and utilization alerts.
*   **Communication Systems:** Custom password management with OTP, email verification and notification system via IONOS SMTP.
*   **MMP and Visit Management:** Multi-tier MMP Recall System, MMP Reclaim from Coordinators System, Visit Postponement System, Date Range Visits, and Auto-Release System for site visits. Includes auto-flagging uncovered sites, daily reminders, cycle comparison, follow-up action tracking, cycle close approval, and predictive coverage alerts.
*   **Site Integration & Normalization:** MoDa Webhook Integration and Site Normalization System.
*   **Dispatch & Coverage:** Smart Dispatch System and Coverage Gap Notification System.
*   **Workflow Management:** Flexible Locality Permit Requirement Workflow and MMP Verification Workflow.
*   **Document Management:** Document Registry & Indexing System.
*   **Super Admin Data Management Center:** Interface for managing site visits, wallets, transactions, and MMPs, with advanced search and audit logging. Includes a Role Perspective Viewer.
*   **Super Admin System Monitoring Dashboard (`/admin/monitoring`):** Single-page Super Admin-only dashboard that aggregates all pending and historical actions across all 9 system modules (MMP Lifecycle, MMP Site Entries, Site Visits, Cost Reimbursements, Operational Costs, Advance Payments, Wallet Withdrawals, Feedback, Role/Resource Changes). Features: summary stat cards, filter bar (category/status/date/sender), bulk action bar for bulk Acted/Ignored marking, collapsible category accordion with expandable row detail panels, per-type workflow controls (Approve/Reject/etc.) that directly update source table records, dual status badges (native + dashboard awareness), CSV and PDF audit report exports, and immutable audit logging of all actions. Requires two new Supabase tables: `action_status_overrides` and `dashboard_query_log` (schema in `supabase/monitoring-dashboard-schema.sql`).
*   **Security & Tracking:** Security-Hardened Activity Tracking System.
*   **Dashboard Global MMP Filter:** Persistent multi-select MMP filter.
*   **Reporting & Analytics:** Comprehensive Coverage Analytics Dashboard, Site Visit Quality Scoring analytics, and Data Export Center.
*   **Mobile Specific Features:** Bilingual welcome screen, Admin-Managed Support Contacts, Mobile Admin Dashboard, Help & Support System, Unified Communications Screen (WebRTC), Shorebird OTA Updates, Mobile Digital Signatures, Mobile Field Team Map, and Mobile Operational Cost Submission System.
*   **Cross-Platform Feature Parity (Web ↔ Mobile):** Both platforms now reflect identical feature sets. Web added: Safety Hub (SOS alerts, emergency contacts, safety checklist), Incident Reports (CRUD with severity/status tracking), Equipment Tracking (inventory management), Comprehensive Monitoring Form (3-step AM/DM/PDM form), and Helpline (emergency contacts management). Mobile added full navigation expansion (5-tab bottom nav + "More" grid) with all 14 new screens fully upgraded: mounted safety guards on every `await`, shimmer skeleton loaders (`ShimmerBody`/`ShimmerBox`), paginated lists (20 items/page, load-more on scroll), Hive offline caching with `OfflineBanner`. More screen restructured into 5 role-gated categories (Field Operations / Finance / Reports & Data / Administration / Account) with live search filter. Role-based visibility driven by `_userRole` string from `user_profile_cache`. Riverpod providers added at `lib/providers/app_providers.dart`: `userProfileProvider`, `userRoleProvider`, `isAdminProvider`, `connectivityProvider`, `isOnlineProvider`. `site_verification_screen.dart` split from 10,634 lines into 9 part files (main: 1,204 lines) using Dart `part`/`part of` with extension methods on `_SiteVerificationScreenState`.
*   **Project Flow Engine UI (Task #4 DONE):** Full lifecycle UI for all 10 project types. Components: `FlowStrip` (horizontal stepper), `FlowTab` (stage cards + advance dialog + stage editing/reordering dialog), `FlowStageBanner` (compact context strip shown in Activities/Team/Costs/Budget tabs). ProjectDetail: FlowStrip above tabs, 6th "Flow" tab. ProjectList: stage indicator on cards, type filter updated to all 10 types. ProjectForm: collapsible type-preview panel listing all flow stages. Stage advance sends in-app notifications to all team members via Supabase. Stage editing allows per-project reordering (up/down arrows) and skip-toggling, stored as `custom_flow_stages` JSONB on projects table. All changes in `src/components/project/flow/`, `src/hooks/useProjectFlow.ts`, `src/config/projectFlows.ts`, and migration `20260331_project_flow.sql`.
*   **Transaction Screenshot Scanner:** AI-powered OCR tool — now routes through a Supabase Edge Function (`supabase/functions/scan-transaction/index.ts`) so no API keys are stored on device. Uses Gemini 2.0 Flash with Groq fallback.
*   **Staff Directory:** Admin page with staff profiles, bank accounts, capacity, and online status.
*   **Sidebar Favorites System:** User-customizable sidebar.
*   **Retainer Management System:** Retainer payment tracking and processing.
*   **Payments & Finance Organization:** Unified section with collapsible sub-categories.
*   **Financial System Enhancements:** Period Close management, budget page project selector, shared exchange rate service, Consolidated Statement, Approval Audit Summary, Wallet Reports pagination, financial trend indicators, reconciliation auto-matching, and Unified Financial Alerts center.
*   **Notification System:** Robust system with in-app, WhatsApp-style, and persistent notifications. Email notifications via IONOS SMTP. Includes Broadcast Center for admin announcements.
*   **Daily Coordinator Digest (Enhanced):** Fully rewritten `use-daily-coordinator-digest` hook and `daily-digest-cron` Supabase Edge Function. DB de-duplication only (no localStorage). Covers: site verification backlog, down payments pending supervisor/admin, operational cost approvals, stale MMPs not accepted by coordinator, returned site entries older than 3 days, fund receipt confirmations pending, coordinator's own submitted DP status, escalation tier for 7+ day inactive coordinators (FCM push to FOM/admin), hub names resolved from DB, action_url deep-links on every notification, weekly summary every Sunday for FOM/Admin, fully bilingual EN+AR throughout.

### System Design Choices
The project uses a unified Supabase client. It integrates the complete Sudan administrative structure. Multiple concurrent sessions are supported for the same user across devices/browsers.

## External Dependencies
*   **Supabase:** PostgreSQL database, Authentication, Realtime, Storage, Row Level Security.
*   **Shadcn UI Components:** Built on Radix UI primitives.
*   **Recharts:** For data visualization.
*   **Lucide React:** For iconography.
*   **Vite:** Build tool.
*   **ESLint, TypeScript:** For code quality and typing.
*   **React Hook Form, Zod:** For form management and validation.
*   **date-fns, uuid, clsx/class-variance-authority:** Utility libraries.
*   **Leaflet:** For map components.
*   **jspdf, jspdf-autotable, xlsx:** For PDF and Excel export functionalities.
*   **Vercel:** Production hosting.
*   **Capacitor:** For mobile deployment.
*   **Flutter Mobile:** Dart/Flutter framework with Supabase Flutter, flutter_webrtc, Hive, flutter_map, Google Fonts, and Shorebird for OTA updates.
*   **Firebase Cloud Messaging (FCM):** Push notification delivery to mobile devices.
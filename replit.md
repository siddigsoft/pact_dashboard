# PACT Command Center

## Overview
PACT Command Center is a centralized platform for managing humanitarian and development field operations, specifically Monthly Monitoring Plans (MMPs) and site visits. It aims to enhance efficiency, transparency, and accountability through tools for planning, coordination, execution, and monitoring. Key features include multi-tier user management, role-based access control, real-time collaboration, detailed workflows, GPS location sharing, advanced financial tracking, comprehensive reporting, and a mobile-responsive Mission Control Dashboard with full offline functionality and notifications. The project's ambition is to streamline field operations and improve humanitarian aid delivery.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is built with React 18, TypeScript, Tailwind CSS v3, and Shadcn UI, adhering to mobile-first and responsive design principles. It features a component-based structure, dual-theme support, a custom color palette, touch-friendly UI, and PWA readiness.

### Technical Implementations
*   **Frontend:** Uses React Router DOM v6, Vite, React Context API, TanStack Query for server state, and Supabase Realtime for subscriptions. `SessionGuard` ensures session resilience.
*   **Backend:** Leverages PostgreSQL via Supabase, including Row Level Security (RLS) and real-time capabilities. Supabase Auth manages authentication, sessions, role-based access control, and TOTP-based 2FA. The database includes audit logs.
*   **Mobile Offline Infrastructure:** Utilizes IndexedDB, Sync Manager, and a Service Worker for offline workflows (site visits, GPS/photo capture, cost submissions, cached MMPs). The Android app is Flutter-based.
*   **Authorization System:** Implements a resource-action based permission model with various user roles (Country Director, Admin, Data Team, Financial Auditor).
*   **File Processing:** Includes an MMP Upload Workflow with Zod validation, an Excel Upload Parser for bulk expense item import, and a Partial MMP Update system for selectively updating/correcting sites by state or locality without affecting other areas.
*   **Real-Time Capabilities:** Features a Live Dashboard, notifications via Supabase Realtime, and real-time GPS location sharing.
*   **Financial Management:** Provides advanced transportation cost and down-payment systems with two-tier approval workflows and audit trails. An operational cost submission system supports nine expense categories with two-tier approval, digital signatures, PDF certificate generation, aging reports, budget vs. actual comparison, duplicate payment detection, cash flow forecasting, financial period close, and a reconciliation dashboard. Automated deduction of transportation advances from site visit fees is also supported.
*   **Hub & Field Operations Structure:** Manages geographical structures, a master sites registry, and interactive Leaflet maps.
*   **Site Visits Enhancements:** Includes a redesigned interface with data collector-specific views, geographic filtering, GPS proximity matching, a first-claim dispatch system, and a Unified Site Management System.
*   **Signature & Transaction Module:** Comprehensive digital signature system for wallet transactions and documents, supporting SHA-256 hashing, OTP, and handwriting signatures.
*   **Task-Level Budget Tracking:** Granular budget management with variance analysis and utilization alerts.
*   **Communication Systems:** Custom password management with OTP, email verification and notification system via IONOS SMTP with bilingual templates, and real-time status indicators.
*   **MMP and Visit Management:** Multi-tier MMP Recall System, MMP Reclaim from Coordinators System (allows FOM/Admin to reclaim forwarded MMPs with predefined reasons: Permit Issue, Timeline Not Enough, WFP Changes, CP Not Distributing, Security Concerns, Staff Unavailable, Data Correction, Reassignment, Other - with bilingual labels, audit logging, and notifications), Visit Postponement System, Date Range Visits, and an Auto-Release System for site visits. Features like auto-flagging uncovered sites, daily reminders, cycle comparison, follow-up action tracking, cycle close approval workflow, per-hub performance scorecards, and predictive coverage alerts are integrated.
*   **Site Integration & Normalization:** MoDa Webhook Integration via Supabase Edge Function and a Site Normalization System.
*   **Dispatch & Coverage:** Smart Dispatch System and Coverage Gap Notification System.
*   **Workflow Management:** Flexible Locality Permit Requirement Workflow and an MMP Verification Workflow.
*   **Document Management:** Document Registry & Indexing System with metadata indexing and deduplication.
*   **Super Admin Data Management Center:** Comprehensive interface for managing site visits, wallets, transactions, and MMPs, with advanced search and full audit logging. A Role Perspective Viewer allows simulating user permissions.
*   **Security & Tracking:** Security-Hardened Activity Tracking System for user activity logging.
*   **Dashboard Global MMP Filter:** A persistent multi-select MMP filter for dashboard navigation.
*   **Reporting & Analytics:** Comprehensive Coverage Analytics Dashboard with various reports and export functionality. Includes Site Visit Quality Scoring analytics and a Data Export Center for bulk exports.
*   **Mobile Specific Features:** Bilingual welcome screen, Admin-Managed Support Contacts, Mobile Admin Dashboard, Help & Support System, Unified Communications Screen (WebRTC), Shorebird OTA Updates, Mobile Digital Signatures, Mobile Field Team Map, and Mobile Operational Cost Submission System. A dedicated bilingual mobile user manual is available at `/mobile-documentation`, complemented by web admin pages for managing mobile support.
*   **Sidebar Favorites System:** User-customizable sidebar with drag & drop reordering.
*   **Retainer Management System:** Comprehensive retainer payment tracking and processing at `/retainer-management`.
*   **Payments & Finance Organization:** Unified "Payments & Finance" parent section with collapsible sub-categories and a reusable `PageInfoBanner` component.
*   **Financial System Enhancements:** Period Close management, budget page project selector, shared exchange rate service with caching, enhanced Consolidated Statement, Approval Audit Summary, Wallet Reports pagination, financial trend indicators, reconciliation auto-matching, and a Unified Financial Alerts center.
*   **Notification System:** A robust system integrating `NotificationTriggerService` with Supabase Realtime for in-app bell dropdown notifications, WhatsApp-style toasts, and persistent notifications. Email notifications are handled by `EmailNotificationService` via IONOS SMTP with bilingual templates, and a `NotificationDigestService` generates daily/weekly email summaries. Specialized services like `BudgetNotificationService`, `CoverageGapNotificationService`, and `VerificationReminderService` provide domain-specific alerts. The `VerificationReminderService` sends daily state-based verification follow-up notifications to super admins, data team, supervisors, and state team members for pending/unverified coordinator assignments. Site claim/accept actions trigger enhanced notifications to supervisors, data team, and super admins with bilingual support and email delivery. Notifications are categorized, grouped, support quick actions, and feature browser badge updates. Read receipts and auto-cleanup mechanisms are implemented.

### System Design Choices
The project utilizes a unified Supabase client for all interactions, ensuring consistent authentication and session management. It integrates the complete Sudan administrative structure. Multiple concurrent sessions are supported for the same user across devices/browsers — all `signOut()` calls use `scope: 'local'` to only end the current session without invalidating sessions on other devices.

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
*   **Capacitor:** For mobile deployment (iOS/Android builds, native API access).
*   **Flutter Mobile:** Dart/Flutter framework with Supabase Flutter, flutter_webrtc, Hive, flutter_map, Google Fonts, and Shorebird for OTA updates.
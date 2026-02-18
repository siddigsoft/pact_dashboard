# PACT Command Center

## Overview
PACT Command Center is a centralized platform for managing humanitarian and development field operations, specifically Monthly Monitoring Plans (MMPs) and site visits. It aims to enhance efficiency, transparency, and accountability through tools for planning, coordination, execution, and monitoring. Key features include multi-tier user management, role-based access control, real-time collaboration, detailed workflows, GPS location sharing, advanced financial tracking, comprehensive reporting, and a mobile-responsive Mission Control Dashboard. The system supports full offline mobile functionality and provides email/popup notifications to effectively support field staff.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18, TypeScript, Tailwind CSS v3, and Shadcn UI, following mobile-first principles. It features a responsive, component-based design with dual-theme support, a custom color palette, touch-friendly UI, and PWA readiness.

### Technical Implementations
*   **Frontend:** Built with React Router DOM v6, Vite, and React Context API. It utilizes TanStack Query for server state management and Supabase Realtime for subscriptions, with `SessionGuard` for session resilience.
*   **Backend:** Powered by PostgreSQL via Supabase, including Row Level Security (RLS) and real-time subscriptions. Supabase Auth handles authentication, sessions, role-based access control, and TOTP-based 2FA. The database schema includes audit logs for financial transactions.
*   **Mobile Offline Infrastructure:** Leverages IndexedDB, a Sync Manager, and a Service Worker for offline site visit workflows, GPS/photo capture, cost submissions, and cached MMP lists. The Android application is Flutter-based.
*   **Authorization System:** Implements a resource-action based permission model.
*   **File Processing:** Includes an MMP Upload Workflow with Zod validation and an Excel Upload Parser for bulk expense item import.
*   **Real-Time Capabilities:** Features a Live Dashboard with automatic data refresh, notifications via Supabase Realtime, and real-time GPS location sharing.
*   **Financial Management:** Provides advanced transportation cost and down-payment systems with two-tier approval workflows and audit trails. An operational cost submission system supports nine expense categories with two-tier approval, digital signatures, and PDF certificate generation. Enhancements include aging reports, budget vs. actual comparison, duplicate payment detection, cash flow forecasting, financial period close, and a reconciliation dashboard.
*   **User Roles:** Supports various roles including Country Director, Admin/Super Admin, Data Team, and Financial Auditor.
*   **Hub & Field Operations Structure:** Manages geographical structures, a master sites registry, and interactive Leaflet maps.
*   **Site Visits Enhancements:** Redesigned interface with data collector-specific views, geographic filtering, GPS proximity matching, a first-claim dispatch system, and a Unified Site Management System.
*   **Signature & Transaction Module:** Comprehensive digital signature system for wallet transactions and documents, supporting SHA-256 hashing, OTP, and handwriting signatures.
*   **Task-Level Budget Tracking:** Granular budget management with variance analysis and utilization alerts.
*   **Communication Systems:** Custom password management with OTP, email verification and notification system via IONOS SMTP with bilingual templates, and real-time status indicators.
*   **MMP and Visit Management:** Multi-tier MMP Recall System, Visit Postponement System, Date Range Visits, and an Auto-Release System for site visits.
*   **Site Integration & Normalization:** MoDa Webhook Integration via Supabase Edge Function and a Site Normalization System.
*   **Dispatch & Coverage:** Smart Dispatch System and Coverage Gap Notification System.
*   **Workflow Management:** Flexible Locality Permit Requirement Workflow and an MMP Verification Workflow.
*   **Document Management:** Document Registry & Indexing System with metadata indexing and deduplication.
*   **Super Admin Data Management Center:** Comprehensive interface for managing site visits, wallets, transactions, and MMPs, with advanced search and full audit logging.
*   **Security & Tracking:** Security-Hardened Activity Tracking System for user activity logging.
*   **Dashboard Global MMP Filter:** A persistent multi-select MMP filter for dashboard navigation.
*   **Reporting & Analytics:** Comprehensive Coverage Analytics Dashboard with various reports and export functionality.
*   **Mobile Specific Features:** Includes a bilingual welcome screen, Admin-Managed Support Contacts, Mobile Admin Dashboard, Help & Support System, Unified Communications Screen (WebRTC), Shorebird OTA Updates, Mobile Digital Signatures, Mobile Field Team Map, and Mobile Operational Cost Submission System.
*   **Mobile User Manual:** A dedicated bilingual mobile user manual at `/mobile-documentation`.
*   **Mobile-Web Integration Pages:** Web admin pages for managing mobile support tickets, help articles, and call scheduling.
*   **Sidebar Favorites System:** User-customizable sidebar with drag & drop reordering.
*   **Retainer Management System:** Comprehensive retainer payment tracking and processing at `/retainer-management`.
*   **Payments & Finance Sidebar Organization:** Unified "Payments & Finance" parent section with collapsible sub-categories.
*   **PageInfoBanner System:** Reusable `PageInfoBanner` component for financial pages.
*   **Wallet-Advance Integration:** Automated deduction of transportation advances from site visit fees, with reconciliation and monthly statement features.
*   **Role Perspective Viewer:** A Super Admin tool at `/role-perspective` to simulate user and role permissions.
*   **Advance Receipt Confirmation:** Digital signature-based receipt confirmation for transportation advances.
*   **Financial System Enhancements:** Period Close management, budget page project selector, shared exchange rate service with caching, enhanced Consolidated Statement, Approval Audit Summary, Wallet Reports pagination, financial trend indicators, reconciliation auto-matching, and a Unified Financial Alerts center.
*   **Notification System Consolidation:** Normalized priority values, expanded `NotificationCategory` and `relatedEntityType`, added comprehensive bilingual notification triggers for various financial and operational events.

### Notification Architecture
*   **Data Flow:** `NotificationTriggerService` populates the Supabase `notifications` table, which is subscribed to via Supabase Realtime for the bell dropdown.
*   **Notification Contexts:** Root `src/context/NotificationContext.tsx` handles WhatsApp-style toasts and persistent notifications, while `src/context/notifications/NotificationContext.tsx` manages the bell dropdown with Realtime updates.
*   **Email Notifications:** `EmailNotificationService` handles SMTP delivery with retry logic and bilingual templates via Supabase Edge Function.
*   **Digest Service:** `NotificationDigestService` generates daily/weekly bilingual email summaries of unread notifications.
*   **Specialized Services:** `BudgetNotificationService` and `CoverageGapNotificationService` provide domain-specific alerts.
*   **Priority Levels:** Standardized as `normal`, `high`, `urgent`.
*   **Categories:** assignments, approvals, financial, team, system, signatures, calls, messages, recall, wallet, retainer, account.
*   **Category Filtering:** Dropdown supports filtering by various categories with dynamic counts.
*   **Notification Grouping:** Similar notifications are bundled with expand/collapse.
*   **Quick Actions:** Inline approve/reject buttons and acknowledge buttons for urgent/critical notifications.
*   **Browser Badge:** Tab title shows unread count via `useNotificationBadge` hook, with PWA badge API support.
*   **Read Receipts:** `useNotificationReceipts` tracks acknowledgment of urgent notifications with browser reminders.
*   **Auto-Cleanup:** `useNotificationCleanup` cleans read notifications based on user-configured thresholds and age.

### System Design Choices
The project uses a unified Supabase client for all interactions, ensuring consistent authentication and session management, and integrates the complete Sudan administrative structure.

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
*   **Questionnaire Analytics Enhancements (Feb 2026):** Reports tab with narrative summary (team overview grouped by supervisor, coverage summary, data quality report with quality score, detailed issues with collapsible sections). Enhanced Excel exports with comprehensive Summary sheets including team roster, coverage totals, and month information in both cleaned and review files. Email Compose dialog with bilingual template preview, role-based CC selection (fetches approved users from Supabase profiles), attachment selection for review/cleaned files as base64, and send via EmailNotificationService/Supabase Edge Function. Data cleaning with PDM exception, duplicate selection UI, dynamic counts, color-coded review Excel with ExcelJS, and responsive dialog layout.
*   **Mobile Cost Submission Feature Parity (Feb 2026):** Complete 3-tier approval workflow for coordinator submissions (Supervisor→CountryDirector→Admin) with automatic tier routing. Signature confirmation dialog with optional digital signature embedding (OTP hash). Email notification triggers via Supabase notifications table for all approval/rejection/payment events with bilingual content. Approval timeline visualization in submission details bottom sheet. Certificate preview bottom sheet with approval details. CSV export for individual and bulk submissions with bilingual headers. Enhanced `CostSubmissionPermissions` model with `canApproveTier3` method. Updated `OperationalCostService` with `tier3Review`, `notifyApprovalAction`, `notifyPaymentRecorded`, and `exportToCsv` methods. Updated `OperationalCostSubmission` model with tier3 fields (`tier3_reviewed_by`, `tier3_reviewed_at`, `tier3_notes`, `tier3_status`), `hasThreeTiers`, `isFullyApproved`, and `hasSignature` computed properties.
*   **Mobile-Web Feature Alignment (Feb 2026):** All 4 Flutter cost submission screens migrated from legacy `cost_submission.dart` to `operational_cost_submission.dart` model with 10 expense categories (permits, incentives, communications, training, transport, equipment, printing, meetings, officeAdmin, other). Wallet screen enhanced with full bilingual labels, advance-wallet reconciliation section, and deduction tracking. Advance requests report updated with receipt signature method display, confirmation timestamp, and expanded CSV export columns. Complete English/Arabic bilingual support across cost approvals (3-tier progress, OTP signature), cost details (approval timeline), cost form (category chips, funding types), cost history (status filters), wallet (all stat cards/tabs/sections), and advance reports (stats, filters, empty states).
*   **MMP Cycle Close Enhancements (Feb 2026):** Auto-flag uncovered sites on cycle close start. Automated daily supervisor reminders via `cycleReminderService.ts` with 24-hour dedup. Cycle Comparison tab for side-by-side analysis of two closed cycles. Follow-up action tracking for high-priority reasons (security, access, staffing). Cycle close approval workflow with FOM/Country Director sign-off (pending_approval status). Per-hub Performance Scorecard tab with coverage trends and gap pattern analysis. Predictive Coverage Alerts showing projected coverage shortfall mid-cycle. Site Visit Quality Scoring analytics (quality_score/quality_notes fields). Mobile push notifications via existing Supabase notification pipeline. Data Export Center page at `/data-export-center` for bulk exports (Cycle Reports, Site Visits, Coverage Analytics, All MMPs) in CSV/Excel formats. MMPCycleClose refactored into modular components under `src/components/cycle/` (CycleMMPCard, CycleCoveragePredictor, CycleReportsTab, CycleComparisonTab, CycleScorecardTab). Enhanced MMP cards with site coverage breakdown, project names, and hub info. Dashboard OperationsZone includes MMP Cycle Status summary widget with Active/Closing/Pending/Closed counts.
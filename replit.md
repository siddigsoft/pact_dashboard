# PACT Command Center

## Overview
PACT Command Center is a centralized Field Operations Command Center for managing humanitarian and development field operations. It unifies planning, coordination, execution, and monitoring of field activities, including Monthly Monitoring Plans (MMPs) and site visits. The project aims to boost efficiency, transparency, and accountability through features like multi-tier user management, role-based access control, real-time collaboration, detailed workflows, GPS location sharing, advanced financial tracking, comprehensive reporting, and a mobile-responsive Mission Control Dashboard. It includes email/popup notifications and full offline mobile functionality to support field staff.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18, TypeScript, Tailwind CSS v3, and Shadcn UI for a responsive, component-based design with dual-theme support and a custom color palette. It follows mobile-first principles with distinct mobile/desktop components, touch-friendly UI, and PWA readiness.

### Technical Implementations
*   **Frontend:** Built with React Router DOM v6, Vite, and React Context API. Utilizes TanStack Query for server state management and Supabase Realtime for subscriptions.
*   **Backend:** Uses PostgreSQL via Supabase, incorporating Row Level Security (RLS) and real-time subscriptions. Supabase Auth manages authentication, sessions, role-based access control, and TOTP-based 2FA. The database schema supports core entities like profiles, roles, projects, MMPs, site visits, budgets, wallets, and cost submissions, with audit logs for financial transactions.
*   **Mobile Offline Infrastructure:** Employs IndexedDB for local storage, a Sync Manager for robust offline-to-online data synchronization, and a Service Worker for caching. Offline capabilities include site visit workflows, GPS/photo capture, cost submissions, and cached MMP lists. The Android APK is Flutter-based with native plugins.
*   **Authorization System:** Implements a resource-action based permission model with granular control enforced across the UI, route guards, and server-side RLS.
*   **File Processing:** Includes an MMP Upload Workflow for CSV files with Zod validation, parsing, database insertion, and duplicate prevention. Cost Submission Excel Upload feature (`ExcelUploadParser`) allows bulk import of expense items from Excel/CSV files with column auto-detection, category validation, template download with sample data, and validation error reporting. Imported items auto-populate the cost request form.
*   **Real-Time Capabilities:** Features a Live Dashboard with automatic data refresh and notifications via Supabase Realtime, and real-time GPS location sharing.
*   **Financial Management:** Provides an advanced transportation cost and down-payment system with a two-tier approval workflow and comprehensive audit trails, including enumerator fee calculation and a Finance Approval page with real-time wallet balances and batch processing. A dedicated operational cost submission system covers 9 expense categories with a two-tier approval workflow, digital signature requirement for Tier 2 final approvals, PDF approval certificate generation, and comprehensive submission lifecycle management (edit pending, delete pending, edit & resubmit rejected, admin recall of approved submissions). The enhanced Down-Payment Approval System offers quick approval options, custom percentages/amounts, advanced multi-filter search, bulk approval, tab-based UI, audit logging, and export functionality. A Down-Payment Notification System sends automated email and in-app notifications for various approval/rejection stages. A Consolidated Financial Overview tab in Financial Operations unifies transportation and operational costs with combined KPI cards, 6-month spending trend charts, category breakdown pie charts, cross-project comparison tables with distribution bars, quick navigation cards, project filtering, and combined Excel/PDF export covering summary, trends, categories, and project breakdowns.
*   **User Roles:** Includes a Country Director role (read-only oversight) and an Admin/Super Admin approval workflow for operational costs. A Data Team role focuses on analytics and reporting with read access.
*   **Hub & Field Operations Structure:** Supports geographical management for hubs, states, and localities, a master sites registry, and interactive Leaflet maps.
*   **Site Visits Enhancements:** Redesigned interface with data collector-specific views, geographic filtering, GPS-based proximity matching, and a first-claim dispatch system. A Unified Site Management System prevents duplicate entries and enables GPS enrichment.
*   **Signature & Transaction Module:** Comprehensive digital signature system for wallet transactions and document signing, supporting SHA-256 hashing, cryptographically secure OTP, and handwriting signatures.
*   **Task-Level Budget Tracking:** Granular budget management at the individual task/activity level with variance analysis and utilization alerts.
*   **Communication Systems:** Custom password management with OTP, email verification and notification system via IONOS SMTP with bilingual templates, and comprehensive email tracking. Realtime status indicators provide visual feedback. Includes Hub Management and Targeted Email Notification Systems.
*   **MMP and Visit Management:** A multi-tier MMP Recall System with financial recovery and approval workflow. A Visit Postponement System with approval workflow and historical tracking. Supports Date Range Visits and a configurable Auto-Release System for site visits.
*   **Site Integration & Normalization:** MoDa Webhook Integration via Supabase Edge Function for real-time form submissions and automatic site registration. A Site Normalization System ensures consistent state/locality/site matching.
*   **Dispatch & Coverage:** A Smart Dispatch System for optimal collector assignment and a Coverage Gap Notification System.
*   **Workflow Management:** Flexible Locality Permit Requirement Workflow and an MMP Verification Workflow.
*   **Document Management:** A Document Registry & Indexing System with metadata indexing, deduplication, and filtering.
*   **Super Admin Data Management Center:** Comprehensive admin interface for managing site visits, wallets, transactions, claimed/dispatched sites, and MMPs, featuring clickable stats, advanced multi-filter search, Return-to-Approved functionality, site reclaim actions, and full audit logging.
*   **Security & Tracking:** A Security-Hardened Activity Tracking System for comprehensive user activity logging.
*   **Reporting & Analytics:** A Comprehensive Coverage Analytics Dashboard with various reports and export functionality.
*   **Mobile Specific Features:** Includes a bilingual welcome screen, Admin-Managed Support Contacts System, Mobile Admin Dashboard (Flutter-based with Supabase Realtime), Permission Handler Service, Help & Support System, Unified Communications Screen (WebRTC audio, Jitsi Meet video, enhanced call features), Shorebird OTA Updates, Mobile Digital Signatures, Mobile Field Team Map (admin-only real-time location monitoring), Bilingual Notification Service, Mobile Support Ticket System, Mobile Operational Cost Submission System, Mobile Advance Requests Report, and Mobile Site Claiming with GPS Proximity.
*   **Mobile-Web Integration Pages:** Web admin pages for managing mobile support tickets, help articles, digital signatures, call scheduling, and document sync.
*   **Sidebar Favorites System:** User-customizable sidebar with drag & drop reordering, persistent across sessions, saved to database.
*   **Retainer Management System:** Comprehensive retainer payment tracking and processing at `/retainer-management`. Features 6 tabs: Overview (KPIs, monthly summary, level breakdown), Payment History (searchable/sortable transaction list with export), Tracking Grid (user x 12-month payment matrix), Eligible Users (all retainer-classified members with status), Audit Trail (full processing log), and Review & Process (preview before batch payment processing). Includes real-time analytics, CSV export for all views, duplicate payment prevention, and role-based access (super_admin, admin, finance_admin). Data sources: `wallet_transactions` (metadata type 'retainer'), `current_user_classifications` view (has_retainer = true). Processing uses `WalletContext.processMonthlyRetainers()`.
*   **Payments & Finance Sidebar Organization:** All financial pages grouped under a unified "Payments & Finance" parent section with 4 collapsible sub-categories: My Money (wallet, cost submissions), Approvals (Tier 1, Tier 2, Down-Payment, Finance Processing), Financial Management (Budget, Wallets Admin, Financial Operations, Retainer), and Financial Reports (Wallet Reports, Transport Advance, Cost Predictions, Exchange Rates).
*   **PageInfoBanner System:** Reusable `PageInfoBanner` component (`src/components/financial/PageInfoBanner.tsx`) added to all 12+ financial pages. Each banner explains what the page does and shows a "Who does what - Step by step" workflow with numbered steps, role-specific color-coded badges, and action descriptions. Collapsible by default to save screen space.
*   **Wallet-Advance Integration:** Transportation advances (down payments) are automatically deducted from site visit fees when crediting wallets. Uses a reconciliation mechanism (`advance_reconciled_at` in down_payment_requests metadata) to prevent double-deduction. Wallet page includes bank-like monthly statements tab with opening/closing balances and CSV export.
*   **Role Perspective Viewer:** Super Admin tool at `/role-perspective` to view what any role or user can see. Shows visible screens/menu items, full permission matrix (resource x action), permission summary, and role comparison with diff highlighting. Uses `getWorkflowMenuGroups` and `DEFAULT_ROLE_PERMISSIONS` for accurate simulation.
*   **Advance Receipt Confirmation:** Digital signature-based receipt confirmation for transportation advances. After finance processes a payment, the staff member who requested the advance sees a "Confirm Receipt" button with the existing SignatureConfirmationModal (handwriting or UUID methods). Confirmation is saved to `down_payment_requests.metadata.receipt_confirmation` with signature hash, method, and timestamp. Includes authorization checks (requester-only), audit log entry (`receipt_confirmed` action), workflow timeline update showing Paid→Confirmed steps, and bilingual UI.

### System Design Choices
The project utilizes a unified Supabase client for all interactions, ensuring consistent authentication and session management, and integrates the complete Sudan administrative structure.

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
*   **Flutter Mobile:** Dart/Flutter framework with Supabase Flutter, flutter_webrtc, jitsi_meet_flutter_sdk, Hive, flutter_map, Google Fonts, and Shorebird for OTA updates.
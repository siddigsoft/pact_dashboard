# PACT Command Center

## Overview
PACT Command Center is a centralized platform designed to manage humanitarian and development field operations, including Monthly Monitoring Plans (MMPs) and site visits. Its primary purpose is to enhance efficiency, transparency, and accountability by providing tools for planning, coordination, execution, and monitoring of field activities. Key capabilities include multi-tier user management, role-based access control, real-time collaboration, detailed workflows, GPS location sharing, advanced financial tracking, comprehensive reporting, and a mobile-responsive Mission Control Dashboard. The system supports full offline mobile functionality and provides email/popup notifications to support field staff effectively.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend utilizes React 18, TypeScript, Tailwind CSS v3, and Shadcn UI, adhering to mobile-first principles. It features a responsive, component-based design with dual-theme support, a custom color palette, touch-friendly UI, and PWA readiness.

### Technical Implementations
*   **Frontend:** Built with React Router DOM v6, Vite, and React Context API. It uses TanStack Query for server state management and Supabase Realtime for subscriptions.
*   **Backend:** Powered by PostgreSQL via Supabase, incorporating Row Level Security (RLS) and real-time subscriptions. Supabase Auth handles authentication, sessions, role-based access control, and TOTP-based 2FA. The database schema supports core entities and audit logs for financial transactions.
*   **Mobile Offline Infrastructure:** Employs IndexedDB, a Sync Manager for data synchronization, and a Service Worker for caching, enabling offline site visit workflows, GPS/photo capture, cost submissions, and cached MMP lists. The Android application is Flutter-based.
*   **Authorization System:** Implements a resource-action based permission model enforced across UI, route guards, and server-side RLS.
*   **File Processing:** Includes an MMP Upload Workflow for CSV files with Zod validation and an Excel Upload Parser for bulk import of expense items with validation and auto-population features.
*   **Real-Time Capabilities:** Features a Live Dashboard with automatic data refresh, notifications via Supabase Realtime, and real-time GPS location sharing.
*   **Financial Management:** Provides advanced transportation cost and down-payment systems with two-tier approval workflows and audit trails. A dedicated operational cost submission system supports nine expense categories with a two-tier approval, digital signatures, and PDF approval certificate generation. Enhanced systems for down-payment approvals, notifications, and a Consolidated Financial Overview unify cost management with KPI cards, trend charts, and export functionalities. Financial system enhancements include aging reports, budget vs. actual comparison, duplicate payment detection, cash flow forecasting, financial period close, and a reconciliation dashboard.
*   **User Roles:** Supports various roles including Country Director (read-only), Admin/Super Admin (approval workflows), Data Team (analytics), and a new Financial Auditor role.
*   **Hub & Field Operations Structure:** Manages geographical structures, a master sites registry, and interactive Leaflet maps.
*   **Site Visits Enhancements:** Redesigned interface with data collector-specific views, geographic filtering, GPS proximity matching, a first-claim dispatch system, and a Unified Site Management System.
*   **Signature & Transaction Module:** Comprehensive digital signature system for wallet transactions and documents, supporting SHA-256 hashing, OTP, and handwriting signatures.
*   **Task-Level Budget Tracking:** Granular budget management with variance analysis and utilization alerts.
*   **Communication Systems:** Custom password management with OTP, email verification and notification system via IONOS SMTP with bilingual templates, and real-time status indicators.
*   **MMP and Visit Management:** Multi-tier MMP Recall System, Visit Postponement System, Date Range Visits, and an Auto-Release System for site visits.
*   **Site Integration & Normalization:** MoDa Webhook Integration via Supabase Edge Function for real-time form submissions and a Site Normalization System.
*   **Dispatch & Coverage:** Smart Dispatch System and Coverage Gap Notification System.
*   **Workflow Management:** Flexible Locality Permit Requirement Workflow and an MMP Verification Workflow.
*   **Document Management:** Document Registry & Indexing System with metadata indexing and deduplication.
*   **Super Admin Data Management Center:** Comprehensive interface for managing site visits, wallets, transactions, and MMPs, with advanced search, return-to-approved functionality, and full audit logging.
*   **Security & Tracking:** Security-Hardened Activity Tracking System for comprehensive user activity logging.
*   **Dashboard Global MMP Filter:** A persistent multi-select MMP filter for the dashboard zone navigation bar, allowing filtering of stat cards and site visit data across all zones.
*   **Reporting & Analytics:** Comprehensive Coverage Analytics Dashboard with various reports and export functionality.
*   **Mobile Specific Features:** Includes a bilingual welcome screen, Admin-Managed Support Contacts, Mobile Admin Dashboard, Help & Support System, Unified Communications Screen (WebRTC), Shorebird OTA Updates, Mobile Digital Signatures, Mobile Field Team Map, and Mobile Operational Cost Submission System.
*   **Mobile User Manual:** A dedicated bilingual mobile user manual at `/mobile-documentation` with comprehensive sections, export options, and quick reference cards.
*   **Mobile-Web Integration Pages:** Web admin pages for managing mobile support tickets, help articles, and call scheduling.
*   **Sidebar Favorites System:** User-customizable sidebar with drag & drop reordering and persistence.
*   **Retainer Management System:** Comprehensive retainer payment tracking and processing at `/retainer-management` with multiple tabs for overview, payment history, tracking grid, eligible users, audit trail, and review & process.
*   **Payments & Finance Sidebar Organization:** Unified "Payments & Finance" parent section with collapsible sub-categories for My Money, Approvals, Financial Management, and Financial Reports.
*   **PageInfoBanner System:** Reusable `PageInfoBanner` component for financial pages, providing context and workflow steps.
*   **Wallet-Advance Integration:** Automated deduction of transportation advances from site visit fees, with reconciliation mechanisms and monthly statement features for the wallet page.
*   **Role Perspective Viewer:** A Super Admin tool at `/role-perspective` to simulate user and role permissions.
*   **Advance Receipt Confirmation:** Digital signature-based receipt confirmation for transportation advances, with authorization checks and audit logging.
*   **Financial System Enhancements Round 3 (Feb 2026):** Period Close moved from localStorage to `financial_period_close` DB table with audit log entries. Budget page project selector replaces placeholder. Shared exchange rate service (`src/utils/exchange-rate-service.ts`) with caching. Consolidated Statement enhanced with advances receivable and USD equivalents. Approval Audit Summary in Finance reports. Wallet Reports pagination (25/50/100). Financial trend indicators (month-over-month). Reconciliation auto-matching with confidence scoring. Unified Financial Alerts center in Financial Operations (budget, exchange rate, reconciliation, approval aging, advance liquidation). CostPredictions debug logging cleaned up.

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
*   **Replit:** Development environment.
*   **Vercel:** Production hosting.
*   **Capacitor:** For mobile deployment (iOS/Android builds, native API access).
*   **Flutter Mobile:** Dart/Flutter framework with Supabase Flutter, flutter_webrtc, Hive, flutter_map, Google Fonts, and Shorebird for OTA updates.
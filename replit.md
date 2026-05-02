# PACT Command Center

## Overview
PACT Command Center is a centralized platform designed to streamline humanitarian and development field operations, focusing on Monthly Monitoring Plans (MMPs) and site visits. Its primary goal is to enhance efficiency, transparency, and accountability through robust tools for planning, coordination, execution, and monitoring. Key capabilities include multi-tier user management, real-time collaboration, advanced financial tracking, comprehensive reporting, and a mobile-responsive Mission Control Dashboard with full offline functionality. The project aims to significantly improve humanitarian aid delivery by optimizing field operations by providing a unified, scalable, and adaptable system for managing complex humanitarian programs.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is built with React 18, TypeScript, Tailwind CSS v3, and Shadcn UI, prioritizing mobile-first and responsive design. It utilizes a component-based structure, offers dual-theme support, features a custom color palette, provides a touch-friendly interface, and is PWA-ready.

### Technical Implementations
*   **Frontend:** React 18, React Router DOM v6, Vite, React Context API, TanStack Query.
*   **Backend:** PostgreSQL powered by Supabase, leveraging Row Level Security (RLS) and real-time features. Supabase Auth handles authentication, sessions, role-based access control, and TOTP-based 2FA.
*   **Mobile Offline Infrastructure:** Utilizes IndexedDB, Sync Manager, and Service Worker for robust offline capabilities. The Android application is Flutter-based, employing Hive for efficient offline caching and Shorebird for over-the-air updates.
*   **Authorization System:** Implements a resource-action based permission model supporting various user roles.
*   **Financial Management:** Includes advanced systems for transportation costs, down-payments, operational cost submission with two-tier approvals, digital signatures, PDF certificate generation, aging reports, budget vs. actual comparisons, duplicate payment detection, cash flow forecasting, period close management, reconciliation, and a Reclaim Financial Gap System. It supports bilingual expense type selection and personal reimbursement workflows, Chart of Accounts Management, Fiscal Years & Periods, Fund Registry, Journal Entry Creation, Accounting Settings, General Ledger, Financial Statements (Income Statement, Balance Sheet), Bank Reconciliation, Budget vs. Actual, Vendor Registry, AP Aging Report, Cash Flow Statement, and Fixed Assets Register.
*   **Accounting Phase 2 — GL Bridge Engine:** Automatic journal posting from all operational modules into the General Ledger via SECURITY DEFINER PostgreSQL trigger functions. Bridges cover: payroll_runs (approved→expense, locked→disbursement), withdrawal_requests (approved), operational_cost_submissions (paid, category-mapped expense), down_payment_requests (fully_paid→travel advance), salary_advances (disbursed), wallet_transactions (reward type). Phase 2 also delivers the full P2P cycle tables (PR, PO, GRN, AP Invoice, Payment, Cheque Register) with their own posting triggers and auto-number sequences. A sub-ledger reconciliation RPC (`acct_recon_subledger_check`) validates GL control accounts against operational totals. The GL Bridge Engine dashboard page (`/accounting/gl-bridge`) shows bridge health, audit log, and recon results. Posting template registry in `src/services/accounting/postingTemplates.ts`. SQL: `supabase/migrations/20260520_acct_phase2_gl_bridges.sql`.
*   **Accounting Phase 3 — Full P2P Cycle UI:** Complete UI for the full procure-to-pay lifecycle: Purchase Requisitions (`/accounting/purchase-requisitions`) with priority/status workflow and approval actions; Goods Receipt Notes (`/accounting/grn`) with 3-way match support, quantity tracking, and inspection workflow; AP Invoices (`/accounting/ap-invoices`) with PO+GRN match indicators, overdue tracking, and GL posting; Cheque & Payment Register (`/accounting/cheque-register`) supporting cheques, bank transfers, cash, mobile money with clearance/bounce/void tracking. All pages have stat cards, search/filter, export CSV, detail dialogs with action buttons.
*   **Accounting Phase 4 — Advanced Controls:** Period Close Management (`/accounting/period-close`) — guided close workflow (Open→Soft Closed→Hard Closed→Locked) with live pre-close health checks against unposted journals, unmatched bank lines, and outstanding AP invoices; confirm-text gate on destructive transitions. Tax Management (`/accounting/tax`) — VAT/WHT/customs tax code registry with GL account mapping, rate preview calculator, bilingual names, per-country scoping, and tax collection summary via `acct_tax_summary()` RPC. Multi-Currency (`/accounting/multi-currency`) — exchange rate history table with effective dates, source tracking, latest-rate cards, and a live currency converter. SQL migration at `supabase/migrations/20260520_acct_phase4_advanced.sql` creates `acct_tax_codes`, `acct_exchange_rates`, `acct_period_close_log`, `acct_budget_encumbrances`, adds `tax_code_id` to `ap_invoices`, seeds 6 default tax codes, and adds 4 Phase 4 feature flags. All Phase 4 pages gracefully handle missing tables with a migration-required banner.
*   **Accounting Settings — Enhanced:** Tabbed layout with Module Health (live table row counts for all 18 accounting tables with health bar), Phase Roadmap (visual 4-phase checklist), Feature Flags (with "Seed Defaults" button when no acct.* flags exist — inserts 8 standard flags), Country Scope (with quick navigation links), and Dev Tools (synthetic data generator). Feature flags section gracefully handles empty/missing table state.
*   **Multi-Country Architecture:** Supports country-specific configurations for accounts and user access with a `useAccountingCountry` hook for auto-scoping.
*   **Hub & Field Operations:** Manages geographical structures, a master sites registry, and interactive Leaflet maps.
*   **Site Visits & MMP Management:** Features a redesigned interface for site visits and MMPs, data collector-specific views, geographic filtering, GPS proximity matching, multi-tier recall, visit postponement, auto-release systems, auto-flagging of uncovered sites, daily reminders, cycle comparison, follow-up action tracking, cycle close approval, and predictive coverage alerts. Includes a bilingual Operational Guide for MMP Cycle Close.
*   **Workflow Management:** Supports flexible Locality Permit Requirement and MMP Verification Workflows.
*   **CRM Module:** A five-page CRM for managing partners, engagements, contacts, and opportunities.
*   **HR & Finance Hub:** A unified admin interface for payroll management, retainer management, staff cost projection, organizational hierarchy visualization, multi-tier leave approval, performance reviews, salary increments, positions & vacancies, training & certifications, and a "My Team" page. Also supports enhanced payslip PDFs.
*   **Audit & Security Sidebar Group:** Dedicated sidebar section for audit pages including Hierarchy Changes, System Audit Logs, Audit & Compliance, and Login Analytics with role-based access.
*   **Hierarchical Task & Daily Work System:** Extends personal tasks with subtask support, department-wide bulk assignment, completion rewards, recurring task definitions, and an admin page for task overview, template management, and payroll calculation. Includes output/accomplishments tracking with multi-file proof uploads and per-person timesheets. Features MyTasksV2 Inbox detail panel and Timeline view.
*   **Project Flow Engine UI:** Provides a full lifecycle UI for 10 project types with visual progress indicators, in-app notifications, archiving, PDF export, health scores, and stalled project alerts. Supports user-added custom stages and per-stage status management via Project Flow Stage Admin.
*   **Portfolio Dashboard:** A director-level cross-project view with live KPI cards, a Health Matrix table, Financial tab, Milestones tab, Pipeline tab, and Project Mix tab.
*   **Project Analytics:** Cross-project analytics with Overview / Financial / Operational / Projects tabs, focusing on accurate budget utilization and task tracking. Budget Analytics Charts provide visualizations for budget utilization.
*   **Survey Module:** Full survey builder, distribution, and analytics with 19 question types, skip/conditional logic, GPS capture, image/file upload, barcode input, and inline validation.
*   **Transaction Screenshot Scanner:** AI-powered OCR for transaction screenshots.
*   **Notification System:** A comprehensive notification system with a redesigned Notifications page, analytics, category chips, "Pending Actions" tab, inline approval/rejection, notification bundling, and an admin-only Analytics tab. Includes 60+ event types for in-app, email, and WhatsApp notifications, with an escalation-check edge function and a Broadcast Center.
*   **Outlook Calendar Integration:** Integrates with Outlook Calendar for event viewing and management within project details.
*   **Project Field Tasks:** A lightweight tracker for tasks within projects, managing priority, status, assignments, due dates, and location details. Supports MS Project-style typed dependencies with cycle detection and RLS. Includes a Gantt view.
*   **Progressive Output Tracking:** Tracks progress on task elements with target/current values, units, and an audit log.
*   **Integrations Settings Page:** Dedicated settings page for connecting Google Calendar and configuring email notification preferences.
*   **Team Task Monitor:** Executive-only dashboard for monitoring team members' task load and activity.
*   **WhatsApp Integration:** Full integration with connection check, per-user opt-in, delivery logging, inbound webhook, and an admin panel.

### System Design Choices
The project utilizes a unified Supabase client and integrates the complete Sudan administrative structure. It supports multiple concurrent sessions for the same user across different devices and browsers. All accounting/HR SQL is applied manually by the user; the agent writes SQL files and runbooks.

## External Dependencies
*   **Supabase:** PostgreSQL database, Authentication, Realtime, Storage, Row Level Security, Edge Functions.
*   **Shadcn UI Components:** Built on Radix UI primitives.
*   **Recharts:** For data visualization.
*   **Lucide React:** For iconography.
*   **Vite:** Build tool.
*   **ESLint, TypeScript:** For code quality.
*   **React Hook Form, Zod:** For form management and validation.
*   **Leaflet:** For map components.
*   **jspdf, jspdf-autotable, xlsx:** For PDF and Excel export.
*   **Vercel:** Production hosting.
*   **Capacitor:** For mobile deployment.
*   **Flutter Mobile:** Dart/Flutter framework with Supabase Flutter, flutter_webrtc, Hive, flutter_map, Google Fonts, and Shorebird for OTA updates.
*   **Firebase Cloud Messaging (FCM):** For push notifications.
*   **IONOS SMTP:** For email notifications.
*   **Gemini 2.0 Flash with Groq:** For AI-powered OCR.
*   **Microsoft Graph API:** For Outlook Calendar integration.
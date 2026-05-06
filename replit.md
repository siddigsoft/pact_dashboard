# PACT Command Center

## Overview
PACT Command Center is a centralized platform designed to streamline humanitarian and development field operations, specifically Monthly Monitoring Plans (MMPs) and site visits. Its primary goal is to enhance efficiency, transparency, and accountability through robust tools for planning, coordination, execution, and monitoring. Key capabilities include multi-tier user management, real-time collaboration, advanced financial tracking, comprehensive reporting, and a mobile-responsive Mission Control Dashboard with full offline functionality. The project aims to significantly improve humanitarian aid delivery by optimizing field operations through a unified, scalable, and adaptable system.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend utilizes React 18, TypeScript, Tailwind CSS v3, and Shadcn UI, emphasizing a mobile-first, responsive, and component-based design. It supports dual themes, a custom color palette, touch-friendly interactions, and is PWA-ready.

### Technical Implementations
*   **Frontend:** Built with React 18, React Router DOM v6, Vite, React Context API, and TanStack Query.
*   **Backend:** Powered by PostgreSQL via Supabase, including Row Level Security (RLS) and real-time features. Supabase Auth manages authentication, sessions, role-based access control, and TOTP 2FA.
*   **Mobile Offline Infrastructure:** Leverages IndexedDB, Sync Manager, and Service Worker for web offline capabilities. The Android application is Flutter-based, using Hive for caching and Shorebird for over-the-air updates.
*   **Authorization System:** Implements a resource-action based permission model supporting various user roles.
*   **Financial Management:** Comprehensive system including transportation costs, down-payments, operational cost submission with two-tier approvals, digital signatures, PDF generation, aging reports, budget vs. actuals, duplicate payment detection, cash flow forecasting, period close, reconciliation, and a Reclaim Financial Gap System. Features include Chart of Accounts, Fiscal Years & Periods, Fund Registry, Journal Entry Creation, General Ledger, Financial Statements, Bank Reconciliation, Budget Planning with approval workflows and audit logs, Fixed Assets lifecycle management (depreciation, disposal, write-off), and full Procure-to-Pay (P2P) cycle management (PR, PO, GRN, AP Invoice, Payment, Cheque Register). The GL Bridge Engine automates journal posting from operational modules, and the system includes advanced controls like Period Close, Tax Management, Multi-Currency support, Budget Encumbrance, Donor Fund Reports, and Segregation of Duties. It also features Cash Flow Forecast, Grant Tracking (with Expense Entry UI and Milestone tracking per grant), Cost Allocation Engine (with real GL journal posting via target accounts and weight %), Depreciation Run, and Financial Consolidation.
*   **Multi-Country Architecture:** Supports country-specific configurations for accounts and user access.
*   **Hub & Field Operations:** Manages geographical structures, a master sites registry, and interactive Leaflet maps.
*   **Site Visits & MMP Management:** Features a redesigned interface with data collector views, geographic filtering, GPS proximity matching, multi-tier recall, visit postponement, auto-release systems, auto-flagging of uncovered sites, daily reminders, cycle comparison, follow-up action tracking, cycle close approval, and predictive coverage alerts. Includes a Coordinator Dashboard with a Cycle Health Score.
*   **Workflow Management:** Supports flexible Locality Permit Requirement and MMP Verification Workflows.
*   **CRM Module:** A five-page CRM for managing partners, engagements, contacts, and opportunities.
*   **HR & Finance Hub:** A unified admin interface for payroll, retainer management, staff cost projection, organizational hierarchy, multi-tier leave approval, performance reviews, salary increments, positions & vacancies, training & certifications, and a "My Team" page, including enhanced payslip PDFs and leave balance summaries. Also includes EOSB / Gratuity calculator (Sudan Labour Law formula: 21d/yr ≤5yrs, 30d/yr >5yrs, per-staff salary override, XLSX export) and Salary Advances tracker (issue, recover, auto-mark fully-recovered, XLSX export) backed by `hr_salary_advances` and `hr_salary_advance_recoveries` tables.
*   **Audit & Security:** Dedicated sidebar section for audit pages including Hierarchy Changes, System Audit Logs, Audit & Compliance, and Login Analytics with role-based access.
*   **Hierarchical Task & Daily Work System:** Extends personal tasks with subtask support, department-wide bulk assignment, completion rewards, recurring tasks, and an admin page for task overview, template management, and payroll calculation. Includes output/accomplishments tracking with multi-file proof uploads and timesheets.
*   **Project Flow Engine UI:** Provides a full lifecycle UI for 10 project types with visual progress indicators, in-app notifications, archiving, PDF export, health scores, and stalled project alerts, supporting user-added custom stages.
*   **Portfolio Dashboard:** A director-level cross-project view with live KPI cards, a Health Matrix, and Financial, Milestones, Pipeline, and Project Mix tabs.
*   **Project Analytics:** Cross-project analytics with Overview, Financial, Operational, and Projects tabs, focusing on budget utilization and task tracking, including budget analytics charts.
*   **Survey Module:** Full survey builder, distribution, and analytics with 19 question types, skip/conditional logic, GPS capture (ODK-parity: live polling, 4-bar signal, altitude, accuracy, mini-map), image/file upload, barcode input, and inline validation. Settings tab supports response limits, expiry dates, multi-page mode (section_headers become pages with Next/Back nav and per-page validation), show/hide progress bar, and custom bilingual thank-you messages. Fill form shows Survey Full / Survey Expired screens. Public fill links work for anonymous users via Supabase RLS anon policies. ODK-style variable names ($name) per question. URL prefill (?name=&email=), save & resume (localStorage draft with amber banner), duration tracking (duration_seconds on submit). Submission review workflow (approve/reject/under_review/pending + comment). Share dialog with QR code (api.qrserver.com), embed widget, WhatsApp share, URL prefill example. AI question generation (Gemini/Groq, ODK-compatible, bulk-add with overrides). Word cloud in analytics tab for text questions.
*   **Transaction Screenshot Scanner:** AI-powered OCR for transaction screenshots.
*   **Notification System:** A comprehensive system with a redesigned page, analytics, category chips, "Pending Actions" tab, inline approval/rejection, bundling, an admin-only Analytics tab, and 60+ event types for in-app, email, and WhatsApp notifications, including an escalation-check edge function and Broadcast Center.
*   **Outlook Calendar Integration:** Integrates with Outlook Calendar for event viewing and management.
*   **Project Field Tasks:** A lightweight tracker for tasks within projects, managing priority, status, assignments, due dates, and location details, with MS Project-style typed dependencies, RLS, and a Gantt view.
*   **Progressive Output Tracking:** Tracks progress on task elements with target/current values, units, and an audit log.
*   **Integrations Settings Page:** Dedicated settings page for connecting Google Calendar and configuring email notification preferences.
*   **Team Task Monitor:** Executive-only dashboard for monitoring team members' task load and activity.
*   **WhatsApp Integration:** Full integration with connection check, per-user opt-in, delivery logging, inbound webhook, and an admin panel.

### System Design Choices
The project uses a unified Supabase client, integrates the complete Sudan administrative structure, and supports multiple concurrent sessions for the same user. All accounting/HR SQL is applied manually by the user; the agent writes SQL files and runbooks.

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
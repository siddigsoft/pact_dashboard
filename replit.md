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
*   **Financial Management:** Includes advanced systems for transportation costs, down-payments, operational cost submission with two-tier approvals, digital signatures, PDF certificate generation, aging reports, budget vs. actual comparisons, duplicate payment detection, cash flow forecasting, period close management, reconciliation, and a Reclaim Financial Gap System. It supports bilingual expense type selection and personal reimbursement workflows.
*   **Multi-Country Architecture:** Supports country-specific configurations for accounts and user access.
*   **Chart of Accounts Management (`/accounting/coa`):** Full Add / Edit / Delete for admin and super_admin roles with country filtering. Full COA seeded for Rwanda (RWF), Qatar (QAR), USA (USD), and Kenya (KES) via `supabase/coa_rw_qa_us_ke_migration.sql`.
*   **Fiscal Years & Periods (`/accounting/fiscal-years`):** Management of fiscal years and periods with inline status selection.
*   **Fund Registry (`/accounting/funds`):** Full Add/Edit fund management with restriction-type badges, active/inactive toggle, bilingual names, and date ranges.
*   **Journal Entry Creation (`/accounting/journals`):** Multi-line entry dialog with country/COA scope selector (filters accounts per country, auto-sets functional currency), period selector, posting date, bilingual description, dynamic line table, and live balance indicator. Sample entries for RW/QA/US/KE in `supabase/sample_journal_entries.sql`.
*   **Accounting Settings (`/accounting/settings`):** Feature-flag management and synthetic data generation tools.
*   **Hub & Field Operations:** Manages geographical structures, a master sites registry, and interactive Leaflet maps.
*   **Site Visits & MMP Management:** Features a redesigned interface for site visits and MMPs, data collector-specific views, geographic filtering, GPS proximity matching, multi-tier recall, visit postponement, auto-release systems, auto-flagging of uncovered sites, daily reminders, cycle comparison, follow-up action tracking, cycle close approval, and predictive coverage alerts.
*   **Workflow Management:** Supports flexible Locality Permit Requirement and MMP Verification Workflows.
*   **CRM Module:** A five-page CRM for managing partners, engagements, contacts, and opportunities.
*   **HR & Finance Hub:** A unified admin interface for payroll management, retainer management, staff cost projection, organizational hierarchy visualization, multi-tier leave approval, performance reviews, salary increments, positions & vacancies, training & certifications, and a "My Team" page.
*   **Audit & Security Sidebar Group:** Dedicated sidebar section for audit pages including Hierarchy Changes, System Audit Logs, Audit & Compliance, and Login Analytics with role-based access.
*   **Hierarchical Task & Daily Work System:** Extends personal tasks with subtask support, department-wide bulk assignment, completion rewards, recurring task definitions, and an admin page for task overview, template management, and payroll calculation. Includes output/accomplishments tracking with multi-file proof uploads and per-person timesheets.
*   **Project Flow Engine UI:** Provides a full lifecycle UI for 10 project types with visual progress indicators, in-app notifications, archiving, PDF export, health scores, and stalled project alerts. Supports user-added custom stages and per-stage status management.
*   **Portfolio Dashboard (`/portfolio`):** A director-level cross-project view with live KPI cards, a Health Matrix table, Financial tab, Milestones tab, Pipeline tab, and Project Mix tab.
*   **Project Analytics (`/projects/analytics`):** Cross-project analytics with Overview / Financial / Operational / Projects tabs, focusing on accurate budget utilization and task tracking.
*   **MyTasksV2 Inbox detail panel (`/my-tasks`):** Inline reading pane with rich-HTML description, editable Hours & Timesheet card with live work-session timer, Output Elements with progress bars, and shared `TaskInsightsTabs` (Approvals / Dependencies / Activity).
*   **MyTasksV2 Timeline view (`/my-tasks` → Timeline tab):** Clickable task pills for navigation to individual task details.
*   **Survey Module (`/surveys`, `/surveys/:id`, `/surveys/:id/fill`):** Full survey builder, distribution, and analytics with 19 question types, skip/conditional logic, GPS capture, image/file upload, barcode input, and inline validation.
*   **Platform Changelog (`/changelog`):** A role-filtered changelog page showing all platform updates.
*   **Transaction Screenshot Scanner:** AI-powered OCR for transaction screenshots.
*   **Notification System:** A comprehensive notification system with a redesigned Notifications page, analytics, category chips, "Pending Actions" tab, inline approval/rejection, notification bundling, and an admin-only Analytics tab. Includes 60+ event types for in-app, email, and WhatsApp notifications, with an escalation-check edge function and a Broadcast Center.
*   **Outlook Calendar Integration:** Integrates with Outlook Calendar for event viewing and management within project details.
*   **Project Field Tasks:** A lightweight tracker for tasks within projects, managing priority, status, assignments, due dates, and location details. Supports MS Project-style typed dependencies with cycle detection and RLS. Includes a Gantt view.
*   **Project Flow Stage Admin (`/admin/project-flow-stages`):** Admin page for overriding hard-coded lifecycle stages per project type.
*   **Progressive Output Tracking:** Tracks progress on task elements with target/current values, units, and an audit log.
*   **Integrations Settings Page (`/integrations`):** Dedicated settings page for connecting Google Calendar and configuring email notification preferences.
*   **Team Task Monitor (`/team-tasks`):** Executive-only dashboard for monitoring team members' task load and activity.
*   **WhatsApp Integration (WasenderAPI):** Full integration with connection check, per-user opt-in, delivery logging, inbound webhook, and an admin panel.

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
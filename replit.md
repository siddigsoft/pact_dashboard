# PACT Command Center

## Overview
PACT Command Center is a centralized platform designed to streamline humanitarian and development field operations, focusing on Monthly Monitoring Plans (MMPs) and site visits. Its primary goal is to enhance efficiency, transparency, and accountability through robust tools for planning, coordination, execution, and monitoring. Key capabilities include multi-tier user management, real-time collaboration, advanced financial tracking, comprehensive reporting, and a mobile-responsive Mission Control Dashboard with full offline functionality. The project aims to significantly improve humanitarian aid delivery by optimizing field operations.

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
*   **Multi-Country Architecture:** A `countries` table (code, name EN/AR, currency, flag) and a `user_country_access` junction table allow each user to be linked to one or more countries. `acct_accounts` has a `country_id` FK so each COA account belongs to a specific country's chart. Existing accounts are stamped to Sudan (SD). SQL migration: `supabase/coa_countries_migration.sql`.
*   **Chart of Accounts Management (`/accounting/chart-of-accounts`):** Now supports full Add / Edit / Delete for admin and super_admin roles. Add/Edit dialog covers code, name EN/AR, type, subtype, parent account (hierarchy), country assignment, active/postable toggles. Delete checks for journal line references and child accounts before allowing removal. Country filter added to the account list view. Finance/auditor roles remain read-only.
*   **Hub & Field Operations:** Manages geographical structures, a master sites registry, and interactive Leaflet maps.
*   **Site Visits & MMP Management:** Features a redesigned interface for site visits and MMPs, data collector-specific views, geographic filtering, GPS proximity matching, first-claim dispatch, Unified Site Management, multi-tier recall, reclaim, visit postponement, auto-release systems, auto-flagging of uncovered sites, daily reminders, cycle comparison, follow-up action tracking, cycle close approval, and predictive coverage alerts.
*   **Workflow Management:** Supports flexible Locality Permit Requirement and MMP Verification Workflows.
*   **CRM Module:** A five-page CRM for managing partners, engagements, contacts, and opportunities, visible to specific admin and management roles.
*   **HR & Finance Hub:** A unified admin interface for payroll management, retainer management, staff cost projection, organizational hierarchy visualization, multi-tier leave approval, performance reviews, salary increments, positions & vacancies, training & certifications, a manager-facing "My Team" page, and a "Hierarchy Audit Log" page.
*   **Audit & Security Sidebar Group:** A dedicated sidebar section for audit pages including Hierarchy Changes, System Audit Logs, Audit & Compliance, and Login Analytics, with role-based access and bilingual labels.
*   **Hierarchical Task & Daily Work System:** Extends personal tasks with subtask support, department-wide bulk assignment, completion rewards, recurring task definitions, and an admin page for task overview, template management, and payroll calculation. Includes output/accomplishments tracking with multi-file proof uploads and per-person timesheets with actual hours confirmation and a live work-session timer.
*   **Project Flow Engine UI:** Provides a full lifecycle UI for 10 project types with visual progress indicators, in-app notifications, archiving, PDF export, health scores, and stalled project alerts. Supports user-added custom stages and per-stage status management.
*   **Portfolio Dashboard (`/portfolio`):** A director-level cross-project view with live KPI cards, a Health Matrix table, Financial tab, Milestones tab, Pipeline tab, and Project Mix tab. Total Spent / Portfolio Burn aggregate approved/paid amounts from `operational_cost_submissions`, `down_payment_requests`, and `site_visit_cost_submissions` (using Math.max(downPays, costSubs) to prevent double-counting advances that are later reconciled), so cards reflect real disbursement even when `project_budgets.spent_budget_cents` is sparse. Org-wide Task Health merges `personal_tasks` + `project_field_tasks`. MMP File Status uses an open status dictionary so non-canonical statuses (forwarded_to_coordinator, dispatched, etc.) are visible.
*   **Project Analytics (`/projects/analytics`):** Cross-project analytics with Overview / Financial / Operational / Projects tabs. Per-project Spent uses Math.max(`project_budgets.spent_budget_cents`, sum of approved op_costs for that project) so utilisation reflects real disbursement; Total Spent KPI uses Math.max(perProjectSum, opCostsApproved + Math.max(downPaysPaid, costSubsApproved)) and skips unscoped down-payment / cost-submission buckets when the user has narrowed by project / PM / client / date so KPIs and chart bars stay in sync. Budget Status donut buckets all filtered projects (with a "No Budget Yet" slice) instead of only rows in the sparse `project_budgets` table. Operational tab task counters tolerate completed/done/closed and in_progress/inprogress spellings to bridge `personal_tasks` + `project_field_tasks` enums.
*   **MyTasksV2 Inbox detail panel (`/my-tasks`):** Inline reading pane mirrors the full `/tasks/:id` page — rich-HTML description, **fully editable** Hours & Timesheet card (live work-session timer with start/pause/reset, per-person actual-hours edit via `set_task_actual_hours` RPC, owner confirmation via `confirm_task_actual_hours` RPC, "Pending owner confirmation" nudge, "task not started yet" guard), Output Elements with progress bars, the shared `TaskInsightsTabs` component (Approvals / Dependencies / Activity), recent activity list, and an "Open full task" deep link in the toolbar. The shared `TimesheetRow` component lives in `src/components/tasks/TimesheetRow.tsx` so TaskDetail and the Inbox panel render and mutate hours identically. Hydrates `co_assignees`, `actual_hours_confirmed_by`, `started_at`, `user_id`, and project links via a one-shot `personal_tasks` fetch when a row is selected.
*   **MyTasksV2 Timeline view (`/my-tasks` → Timeline tab):** Task pills are clickable and navigate to `/tasks/:id`. The grid/row line overlay divs use `pointer-events-none` so clicks reach the pills underneath (previously the overlays silently swallowed pill clicks).
*   **Survey Module (`/surveys`, `/surveys/:id`, `/surveys/:id/fill`):** Full survey builder, distribution, and analytics. Includes a hub page (stats, list, create/duplicate/delete), a detail page with three tabs — Builder (question ordering, 19 types across 6 categories: text/textarea/number/integer/phone/email, radio/checkbox/dropdown, date/time/datetime, rating/scale, gps/image/file/barcode, section_header), Responses (per-submission drill-down with image/GPS/file preview), and Analytics (bar charts per question, text answer listing, average ratings). The fill page is a standalone full-screen form with skip/conditional logic evaluation (Ona.io-style: equals, not_equals, contains, answered, not_answered, greater_than, less_than), progress tracking, star-rating UI, scale selector, GPS capture (browser geolocation), image/file upload (base64), barcode text input, inline validation, and a thank-you screen. Skip logic stored in `question.settings.skip_logic` as JSONB; conditional questions show a "Conditional" badge in the builder. DB schema: `surveys`, `survey_questions`, `survey_responses`, `survey_answers` (see `supabase/surveys_schema.sql`). Sidebar group visible to admin, FOM, country director, project manager roles (order 5.9).
*   **Platform Changelog (`/changelog`):** A role-filtered changelog page showing all platform updates with timestamps, rationale, testing guides, and role-based visibility.
*   **Transaction Screenshot Scanner:** AI-powered OCR for transaction screenshots.
*   **Notification System:** A comprehensive notification system with a redesigned Notifications page, analytics, category chips, "Pending Actions" tab, inline approval/rejection, notification bundling, and an admin-only Analytics tab. Includes 60+ event types for in-app, email, and WhatsApp notifications, with an escalation-check edge function and a Broadcast Center.
*   **Outlook Calendar Integration:** Integrates with Outlook Calendar for event viewing and management within project details.
*   **Project Field Tasks:** A lightweight tracker for tasks within projects, managing priority, status, assignments, due dates, and location details. Supports MS Project-style typed dependencies with cycle detection and RLS. Includes a Gantt view with SVG connector overlay for dependencies.
*   **Project Flow Stage Admin (`/admin/project-flow-stages`):** Admin/super-admin page that overrides the hard-coded lifecycle stages per project type.
*   **Progressive Output Tracking:** `task_assignee_elements` carries `target_value` / `current_value` / `unit` columns plus a `task_element_progress_log` audit table and `update_task_element_progress` RPC. The TaskDetail page renders a progress bar + inline numeric input on each element row.
*   **Integrations Settings Page (`/integrations`):** A dedicated settings page for connecting Google Calendar and configuring email notification preferences.
*   **Team Task Monitor (`/team-tasks`):** Executive-only dashboard for monitoring team members' task load and activity, including KPI strip, per-employee workload, detailed task lists, calendar modal, and task assignment.
*   **WhatsApp Integration (WasenderAPI):** Full integration with connection check, per-user opt-in, delivery logging, inbound webhook, and an admin panel for management.

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
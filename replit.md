# PACT Command Center

## Overview
PACT Command Center is a centralized platform designed to streamline humanitarian and development field operations, focusing on Monthly Monitoring Plans (MMPs) and site visits. Its primary goal is to enhance efficiency, transparency, and accountability through robust tools for planning, coordination, execution, and monitoring. Key capabilities include multi-tier user management, real-time collaboration, advanced financial tracking, comprehensive reporting, and a mobile-responsive Mission Control Dashboard with full offline functionality. The project aims to significantly improve humanitarian aid delivery by optimizing field operations.

## Live Status — read this first
- **`docs/STATUS_DASHBOARD.md`** is the always-current scorecard of the Accounting Module rebuild: phase % done, every sprint, every SQL file with sign-off and pactdb apply status, the 10 Phase-1 acceptance criteria, and the open/blocked register. **Update it whenever a sprint ships, a file is applied, or a criterion flips green.**
- Deep-archive planning lives in `docs/PLANNING_INDEX.md` (3 000+ lines).
- **Standing rule:** all accounting/HR SQL is applied **manually** by the user in the pactdb Supabase SQL editor. NO Drizzle, NO `db:push`, NO Replit auto-push for this codebase. Agent writes SQL files + runbooks; user pastes them.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is built with React 18, TypeScript, Tailwind CSS v3, and Shadcn UI, prioritizing mobile-first and responsive design. It utilizes a component-based structure, offers dual-theme support, features a custom color palette, provides a touch-friendly interface, and is PWA-ready.

### Technical Implementations
*   **Frontend:** React 18, React Router DOM v6, Vite, React Context API, TanStack Query, and Supabase Realtime for dynamic interactions.
*   **Backend:** PostgreSQL powered by Supabase, leveraging Row Level Security (RLS) and real-time features. Supabase Auth handles authentication, sessions, role-based access control, and TOTP-based 2FA.
*   **Mobile Offline Infrastructure:** Utilizes IndexedDB, Sync Manager, and Service Worker for robust offline capabilities. The Android application is Flutter-based, employing Hive for efficient offline caching and Shorebird for over-the-air updates.
*   **Authorization System:** Implements a resource-action based permission model supporting various user roles.
*   **Financial Management:** Includes advanced systems for transportation costs, down-payments, operational cost submission with two-tier approvals, digital signatures, PDF certificate generation, aging reports, budget vs. actual comparisons, duplicate payment detection, cash flow forecasting, period close management, reconciliation, and a Reclaim Financial Gap System.
*   **Hub & Field Operations:** Manages geographical structures, a master sites registry, and interactive Leaflet maps.
*   **Site Visits & MMP Management:** Features a redesigned interface for site visits and MMPs, data collector-specific views, geographic filtering, GPS proximity matching, first-claim dispatch, Unified Site Management, multi-tier recall, reclaim, visit postponement, auto-release systems, auto-flagging of uncovered sites, daily reminders, cycle comparison, follow-up action tracking, cycle close approval, and predictive coverage alerts.
*   **Workflow Management:** Supports flexible Locality Permit Requirement and MMP Verification Workflows.
*   **CRM Module:** A five-page CRM for managing partners, engagements, contacts, and opportunities, visible to specific admin and management roles.
*   **HR & Finance Hub:** A unified admin interface for payroll management, retainer management, staff cost projection, organizational hierarchy visualization (with PNG/PDF export), multi-tier leave approval (Manager → HR chain via `build_leave_approver_chain` + `decide_leave_request` RPCs), performance reviews, salary increments, positions & vacancies, training & certifications, a manager-facing "My Team" page (`/my-team`) showing direct + indirect reports with workload and leave, and a "Hierarchy Audit Log" page (`/hierarchy-audit`, HR/admin only) backed by an `AFTER UPDATE` trigger on `profiles` that auto-records every change to `reports_to` / `department_id`. Payslip-ready notifications dispatch automatically when a payroll run is approved.
*   **Hierarchical Task & Daily Work System:** Extends personal tasks with subtask support, department-wide bulk assignment, completion rewards, recurring task definitions, and an admin page for task overview, template management, and payroll calculation. Includes output/accomplishments tracking with multi-file proof uploads and per-person timesheets with actual hours confirmation.
*   **Project Flow Engine UI:** Provides a full lifecycle UI for 10 project types with visual progress indicators, in-app notifications on stage advance, project archiving, PDF export, health score widgets, and stalled project alerts.
*   **Portfolio Dashboard (`/portfolio`):** A director-level cross-project view with live KPI cards, a Health Matrix table, Financial tab, Milestones tab, Pipeline tab, and Project Mix tab.
*   **Platform Changelog (`/changelog`):** A role-filtered changelog page showing all platform updates with timestamps, rationale, testing guides, and role-based visibility, with a live unread count badge.
*   **Transaction Screenshot Scanner:** AI-powered OCR for transaction screenshots.
*   **Notification System:** A comprehensive notification system with a redesigned Notifications page, analytics stats bar, category chips, "Pending Actions" tab, inline approval/rejection, notification bundling, and an admin-only Analytics tab. Includes 60+ event types for in-app, email, and WhatsApp notifications, with an escalation-check edge function for unacted approvals and a Broadcast Center for admin announcements.
*   **Outlook Calendar Integration:** Integrates with Outlook Calendar for event viewing and management within project details.
*   **Project Field Tasks:** A lightweight tracker for tasks within projects, managing priority, status, assignments, due dates, and location details.
*   **Integrations Settings Page (`/integrations`):** A dedicated settings page for connecting Google Calendar and configuring email notification preferences.
*   **Team Task Monitor (`/team-tasks`):** Executive-only dashboard for monitoring team members' task load and activity, including KPI strip, per-employee workload, detailed task lists, calendar modal, and task assignment.
*   **WhatsApp Integration (WasenderAPI):** Full integration with connection check, per-user opt-in, delivery logging, inbound webhook, and an admin panel for management.

### System Design Choices
The project utilizes a unified Supabase client and integrates the complete Sudan administrative structure. It supports multiple concurrent sessions for the same user across different devices and browsers.

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
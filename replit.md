# PACT Command Center

## Overview
PACT Command Center is a centralized platform for managing humanitarian and development field operations, specifically Monthly Monitoring Plans (MMPs) and site visits. It aims to enhance efficiency, transparency, and accountability through tools for planning, coordination, execution, and monitoring. Key features include multi-tier user management, real-time collaboration, detailed workflows, GPS location sharing, advanced financial tracking, comprehensive reporting, and a mobile-responsive Mission Control Dashboard with full offline functionality. The project's ambition is to streamline field operations and improve humanitarian aid delivery.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is built with React 18, TypeScript, Tailwind CSS v3, and Shadcn UI, adhering to mobile-first and responsive design principles. It features a component-based structure, dual-theme support, a custom color palette, touch-friendly UI, and PWA readiness.

### Technical Implementations
*   **Frontend:** React 18, React Router DOM v6, Vite, React Context API, TanStack Query, and Supabase Realtime.
*   **Backend:** PostgreSQL via Supabase with Row Level Security (RLS) and real-time capabilities. Supabase Auth for authentication, sessions, role-based access control, and TOTP-based 2FA.
*   **Mobile Offline Infrastructure:** IndexedDB, Sync Manager, and Service Worker for offline workflows. The Android app is Flutter-based, featuring Hive for offline caching and Shorebird for OTA updates.
*   **Authorization System:** Resource-action based permission model with various user roles.
*   **File Processing:** MMP Upload Workflow with Zod validation, Excel Upload Parser, and Partial MMP Update system.
*   **Real-Time Capabilities:** Live Dashboard, notifications via Supabase Realtime, and real-time GPS location sharing.
*   **Financial Management:** Advanced transportation cost and down-payment systems with two-tier approval, operational cost submission with two-tier approval, digital signatures, PDF certificate generation, aging reports, budget vs. actual comparison, duplicate payment detection, cash flow forecasting, period close management, and reconciliation. Includes a Reclaim Financial Gap System.
*   **Hub & Field Operations Structure:** Management of geographical structures, master sites registry, and interactive Leaflet maps.
*   **Site Visits Enhancements:** Redesigned interface, data collector-specific views, geographic filtering, GPS proximity matching, first-claim dispatch, and Unified Site Management System.
*   **Signature & Transaction Module:** Digital signature system for wallet transactions and documents.
*   **Task-Level Budget Tracking:** Granular budget management with variance analysis and utilization alerts.
*   **Communication Systems:** Custom password management with OTP, email verification and notification system via IONOS SMTP.
*   **MMP and Visit Management:** Multi-tier MMP Recall, MMP Reclaim from Coordinators, Visit Postponement, Date Range Visits, and Auto-Release systems. Includes auto-flagging uncovered sites, daily reminders, cycle comparison, follow-up action tracking, cycle close approval, and predictive coverage alerts.
*   **Site Integration & Normalization:** MoDa Webhook Integration and Site Normalization System.
*   **Dispatch & Coverage:** Smart Dispatch System and Coverage Gap Notification System.
*   **Workflow Management:** Flexible Locality Permit Requirement Workflow and MMP Verification Workflow.
*   **Document Management:** Document Registry & Indexing System.
*   **Super Admin Data Management Center:** Interface for managing site visits, wallets, transactions, and MMPs, with advanced search, audit logging, and a Role Perspective Viewer. Includes a monitoring dashboard aggregating pending and historical actions across all system modules.
*   **Security & Tracking:** Security-Hardened Activity Tracking System.
*   **Dashboard Global MMP Filter:** Persistent multi-select MMP filter.
*   **Reporting & Analytics:** Comprehensive Coverage Analytics Dashboard, Site Visit Quality Scoring analytics, and Data Export Center.
*   **Mobile Specific Features:** Bilingual welcome screen, Admin-Managed Support Contacts, Mobile Admin Dashboard, Help & Support System, Unified Communications Screen (WebRTC), Mobile Digital Signatures, Mobile Field Team Map, and Mobile Operational Cost Submission System.
*   **Cross-Platform Feature Parity (Web ↔ Mobile):** Both platforms support Safety Hub (SOS alerts, emergency contacts, safety checklist), Incident Reports, Equipment Tracking, Comprehensive Monitoring Form, and Helpline. Mobile features include shimmer skeleton loaders, paginated lists, and role-gated navigation.
*   **Project Flow Engine UI:** Full lifecycle UI for 10 project types with `FlowStrip` (horizontal stepper), `FlowTab` (stage cards), and `FlowStageBanner`. Stage advance sends in-app notifications. Includes project archiving, PDF export, health score widgets, stalled project alerts, and enhanced `ProjectDetail` screens on mobile.
*   **Transaction Screenshot Scanner:** AI-powered OCR tool using Gemini 2.0 Flash with Groq fallback via a Supabase Edge Function.
*   **Staff Directory:** Admin page with staff profiles, bank accounts, capacity, and online status. Includes department badge per staff card and a "View Departments" link.
*   **Departments & Org Hierarchy:** New `departments` table (nested sub-departments, manager, color) and extended `profiles` with `department_id`, `employment_type`, `contract_start_date`, `contract_end_date`, `reports_to`. Departments page at `/departments` provides CRUD, org-tree view, member panels, and employee move. UserDetail has an Employment Record tab. Notifications + IONOS emails are sent on manager assignment, employee department change, and contract expiry (employee + manager).
*   **Sidebar Favorites System:** User-customizable sidebar.
*   **Retainer Management System:** Retainer payment tracking and processing.
*   **HR & Finance Hub:** Unified admin page at `/hr` with three tabs — My Payroll, Payroll Admin, and Retainer. The Payroll Admin tab provides: (1) Employee Salary Setup with per-employee base salary, allowances (fixed/percent), and deductions (fixed/percent) stored in `employee_salary_config` table, with salary change history tracked in `salary_history` JSONB column and displayed in the edit dialog; (2) Run Payroll with period selection, gross→net calculation, per-employee one-time adjustments (bonuses/deductions via `AdjustmentDialog`), full approval workflow (Draft → Submit → Approve → Lock) with visual stepper and status banners, saved in `payroll_runs.status`; (3) Payslips & History with per-employee PDF payslip generation (jsPDF + autoTable) and bulk download. My Payroll (employee view) includes a "My Payslips" tab showing all payroll runs for the current user with expand/collapse and PDF download. Reports tab has 5 sub-reports: Payroll Breakdown, Contract Expiry, Headcount, Year-to-Date, Month Comparison — all with Excel export. DB columns added: `employee_salary_config.salary_history` (JSONB), `payroll_run_items.adjustments` (JSONB), `payroll_runs.submitted_at/submitted_by/approved_at/approved_by`. Accessible to super_admin, admin, and finance roles only. Tables: `employee_salary_config`, `payroll_runs`, `payroll_run_items`.
*   **Payments & Finance Organization:** Unified section with collapsible sub-categories.
*   **Financial System Enhancements:** Period Close management, budget page project selector, shared exchange rate service, Consolidated Statement, Approval Audit Summary, Wallet Reports pagination, financial trend indicators, reconciliation auto-matching, and Unified Financial Alerts center.
*   **Notification System:** Robust system with in-app, WhatsApp-style, and persistent notifications. Email notifications via IONOS SMTP. Includes Broadcast Center for admin announcements.
*   **Daily Coordinator Digest:** Enhanced system for daily coordinator summaries, covering various pending actions and escalations, with deep-links and bilingual support.
*   **Stage Assignment Acknowledgment:** Allows assignees to acknowledge stage assignments, with visual indicators for confirmed/pending status.
*   **Flow Stage Status Color Coding:** Visual language using distinct colors for completed, current, skipped, and upcoming stages.
*   **Outlook Calendar Integration:** Integration for viewing and managing calendar events within project details, including MSAL OAuth and Microsoft Graph API.
*   **Project Field Tasks System:** Lightweight field task tracker within projects, managing tasks with priority, status, assignments, due dates, and location details.
*   **Hierarchical Task & Daily Work System (Task #10):** Extended `personal_tasks` with subtask support (parent_task_id), department-wide bulk assignment, completion reward crediting to wallets, and recurring task recurrence fields. New `daily_task_definitions` table with admin-managed recurring task templates (daily/weekly, role/dept filtering, reward amounts). `materialiseDailyTasks()` runs on My Tasks mount to create today's tasks from templates. `TaskAdmin` page at `/task-admin` provides: Task Overview by Department (progress bars, overdue alerts), Daily Task Templates CRUD panel, and Payroll Calculation Panel with PDF/Excel export and email-members functionality. New `task-daily-digest` edge function sends daily per-user task summaries via email + in-app notification. `task_digest_opt_out` flag added to profiles. My Tasks New Task dialog updated: 3-mode assignment (Myself / Someone else / Entire Department), optional completion reward field.

### System Design Choices
The project uses a unified Supabase client and integrates the complete Sudan administrative structure. Multiple concurrent sessions are supported for the same user across devices/browsers.

## External Dependencies
*   **Supabase:** PostgreSQL database, Authentication, Realtime, Storage, Row Level Security, Edge Functions.
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
*   **IONOS SMTP:** For email notifications.
*   **Gemini 2.0 Flash with Groq:** For AI-powered OCR in transaction scanning.
*   **Microsoft Graph API:** For Outlook Calendar integration.
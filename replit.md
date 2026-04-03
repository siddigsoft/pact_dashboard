# PACT Command Center

## Overview
PACT Command Center is a centralized platform designed to streamline humanitarian and development field operations, specifically focusing on Monthly Monitoring Plans (MMPs) and site visits. Its primary goal is to enhance efficiency, transparency, and accountability through robust tools for planning, coordination, execution, and monitoring. Key capabilities include multi-tier user management, real-time collaboration, advanced financial tracking, comprehensive reporting, and a mobile-responsive Mission Control Dashboard with full offline functionality. The project aims to significantly improve humanitarian aid delivery by optimizing field operations.

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
*   **Financial Management:** Includes advanced systems for transportation costs, down-payments, operational cost submission with two-tier approvals, digital signatures, PDF certificate generation, aging reports, budget vs. actual comparisons, duplicate payment detection, cash flow forecasting, period close management, and reconciliation. A Reclaim Financial Gap System is also integrated.
*   **Hub & Field Operations:** Manages geographical structures, a master sites registry, and interactive Leaflet maps.
*   **Site Visits & MMP Management:** Features a redesigned interface for site visits, data collector-specific views, geographic filtering, GPS proximity matching, first-claim dispatch, and a Unified Site Management System. MMP management includes multi-tier recall, reclaim, visit postponement, date range visits, auto-release systems, auto-flagging of uncovered sites, daily reminders, cycle comparison, follow-up action tracking, cycle close approval, and predictive coverage alerts.
*   **Workflow Management:** Supports flexible Locality Permit Requirement and MMP Verification Workflows.
*   **CRM Module:** A five-page CRM for managing partners, engagements, contacts, and opportunities, visible to specific admin and management roles.
*   **HR & Finance Hub:** A unified admin interface for payroll management (including salary setup, run payroll with approval workflow, payslips, and various reports like payroll breakdown, contract expiry, budget vs. actual), retainer management, staff cost projection, and organizational hierarchy visualization.
*   **Hierarchical Task & Daily Work System:** Extends `personal_tasks` with subtask support, department-wide bulk assignment, completion rewards, and recurring task definitions. Includes an admin page for task overview, template management, and payroll calculation.
*   **Project Flow Engine UI:** Provides a full lifecycle UI for 10 project types with visual progress indicators (`FlowStrip`, `FlowTab`, `FlowStageBanner`), in-app notifications on stage advance, project archiving, PDF export, health score widgets, and stalled project alerts.
*   **Transaction Screenshot Scanner:** AI-powered OCR using Gemini 2.0 Flash (with Groq fallback) via a Supabase Edge Function.
*   **Notification System:** A robust system delivering in-app, WhatsApp-style, persistent, and email notifications. Includes a Broadcast Center for admin announcements.
*   **Outlook Calendar Integration:** Integrates with Outlook Calendar for event viewing and management within project details, utilizing MSAL OAuth and Microsoft Graph API.
*   **Project Field Tasks:** A lightweight tracker for tasks within projects, managing priority, status, assignments, due dates, and location details.
*   **Leave Request System:** Manages leave requests with various types, approval workflows, and historical tracking for employees and administrators.

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
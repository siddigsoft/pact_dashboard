# PACT Workflow Platform

## Overview

The PACT (Planning, Approval, Coordination, and Tracking) Workflow Platform is a comprehensive field operations management system designed to streamline Monthly Monitoring Plans (MMPs), site visits, and field team coordination. Built with React and TypeScript, its purpose is to provide robust role-based access control, real-time collaboration, and end-to-end workflow management for field operations. Key capabilities include multi-tier user management, MMP and site visit workflows, real-time location sharing, financial tracking with a new transportation cost and down-payment system, reporting, mobile responsiveness, and a Mission Control Dashboard with role-aware navigation. The platform aims to enhance efficiency, transparency, and accountability in field operations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The frontend is built with React 18, TypeScript, React Router DOM v6, Vite, Tailwind CSS v3, and Shadcn UI. It features dual-theme support (light/dark), a custom color palette, responsive design, and a component-based architecture. State management utilizes the React Context API for global state, TanStack Query for server state, and React hooks for local state, complemented by Supabase Realtime for subscriptions. Key design patterns include provider patterns, custom hooks, compound components, and error boundaries. Mobile support is a core focus, with mobile-first CSS, separate mobile/desktop components, touch-friendly UI, and PWA readiness. A comprehensive web-mobile synchronization system ensures seamless data consistency using a shared Supabase database with real-time subscriptions and an offline queue mechanism for mobile.

### Backend Architecture

The backend leverages PostgreSQL via Supabase, with robust Row Level Security (RLS) and real-time subscriptions. The database schema supports profiles, roles, projects, MMPs, site visits, budgets, wallets, and cost submissions, including detailed audit logs for financial transactions and deletions. Authentication is handled by Supabase Auth, providing email/password login, Google OAuth, session management, role-based access control, and Two-Factor Authentication (2FA) using TOTP. Data flow is managed through context providers, with optimistic updates and Supabase Storage for file management.

### Two-Factor Authentication (2FA)

The platform implements TOTP-based two-factor authentication using Supabase's built-in MFA system:

*   **Key Files:**
    *   `src/hooks/use-mfa.ts` - Custom hook for MFA operations (enroll, verify, unenroll, status checks)
    *   `src/components/auth/TwoFactorSetup.tsx` - QR code enrollment and factor management component
    *   `src/components/auth/TwoFactorChallenge.tsx` - Login verification challenge component
    *   `src/components/auth/AuthForm.tsx` - Updated login flow with MFA challenge integration

*   **Authentication Flow:**
    1. User enters email/password and clicks Sign In
    2. System authenticates credentials via Supabase Auth
    3. If 2FA is enabled (AAL2 required), the TwoFactorChallenge component is displayed
    4. User enters 6-digit code from their authenticator app
    5. Code is verified via Supabase MFA challenge/verify flow with robust AAL2 polling (up to 15 retries with exponential backoff)
    6. User context is hydrated with retry logic (up to 10 retries) to handle eventual consistency
    7. Upon successful verification and hydration, user proceeds to the dashboard

*   **Supported Authenticator Apps:**
    *   Google Authenticator
    *   Authy
    *   Microsoft Authenticator
    *   1Password
    *   Any TOTP-compatible app

*   **Settings Integration:**
    *   Users manage 2FA in Settings > Security tab
    *   Can enable/disable 2FA, view enrolled authenticators, add backup authenticators

### Authorization System

A resource-action based permission model (e.g., `mmp:read`, `site_visits:create`) is implemented with granular permissions (read, create, update, delete, approve, assign, archive) and an admin bypass. Enforcement occurs via client-side UI rendering, route guards, server-side RLS policies, and a defined role hierarchy.

### File Processing

The platform includes an MMP Upload Workflow for CSV files, featuring upload to Supabase Storage, Zod schema validation, row-by-row parsing, database insertion, and rollback on failure. Validation layers include file format, schema, business rule, and cross-reference checks.

### Real-Time Features

Real-time capabilities include a Live Dashboard powered by Supabase Realtime channels for key tables, providing toast notifications and automatic data refresh. Real-time location sharing involves GPS coordinate capture, live updates, privacy controls, and location-based assignment.

### Notification System

The platform features a comprehensive notification system with browser push notification support:

*   **Key Files:**
    *   `src/context/notifications/NotificationContext.tsx` - Core notification context with Supabase realtime subscriptions
    *   `src/components/BrowserNotificationListener.tsx` - Browser push notification handler
    *   `src/context/settings/SettingsContext.tsx` - Notification settings persistence

*   **Notification Settings (persisted to database):**
    *   `enabled` - Master toggle for all notifications
    *   `email` - Email notification preference
    *   `sound` - Sound alerts preference
    *   `browserPush` - Browser desktop push notifications
    *   `categories` - Granular category toggles:
        *   `assignments` - Site visit assignments
        *   `approvals` - MMP and approval workflow notifications
        *   `financial` - Budget, payments, and cost notifications
        *   `team` - Team member status and location updates
        *   `system` - System alerts and warnings

*   **Browser Push Notifications:**
    *   Requires user permission (requested when enabling the feature)
    *   Shows desktop notifications when tab is in background
    *   Respects category preferences for filtering
    *   Supports click-to-navigate to notification link
    *   Optional sound alerts

### Core Feature Specifications

**Transportation Cost & Down-Payment System:** This system calculates transportation costs before dispatch by admins, manages down-payment requests from enumerators/coordinators via a two-tier approval workflow (supervisor → admin), and tracks all cost adjustments with a complete audit trail. It includes a `super_admin` role with a 3-account limit and a deletion audit log.

**Hub & Field Operations Structure:** A comprehensive geographical management system accessible at `/hub-operations`:

*   **Key Files:**
    *   `src/pages/HubOperations.tsx` - Main page with tabbed interface (redesigned Nov 2025)
    *   `src/types/hub-operations.ts` - Type definitions for hubs, sites registry, and project scope
    *   `src/components/hub-operations/StateMapCard.tsx` - Interactive state map cards with Leaflet
    *   `src/components/hub-operations/HubCard.tsx` - Hub display card with gradient header
    *   `src/components/hub-operations/SiteCard.tsx` - Site registry card with status badges
    *   `supabase/migrations/001_hub_operations_tables.sql` - Database migration for hub tables

*   **Features:**
    *   **Hub Management:** Create/edit/delete hubs and assign states to each hub
    *   **States & Localities View:** Hierarchical view of all 18 Sudan states and their localities with interactive Leaflet maps
    *   **Sites Registry:** Master registry of all sites with unique IDs in format: `{StateCode}-{LocalityCode}-{SiteName}-{0001}-{ActivityType}`
    *   **Project Scope Linking:** Associate projects with specific hubs and geographical areas
    *   **Gradient Stat Cards:** Users Management style gradient stat cards for quick overview

*   **UI Design Pattern (Nov 2025):**
    *   Matches Users Management page layout with gradient stat cards
    *   Interactive StateMapCard showing state location on Leaflet map
    *   Card-based layout for hubs, states, and sites
    *   Tabbed interface with Overview, Hubs, States, and Sites tabs
    *   Grid/List/Map view toggle for sites

*   **Site ID Format:** `KH-OMD-SITENAME-0001-TPM` where:
    *   `KH` - State code (2 letters)
    *   `OMD` - Locality code (3 letters from name)
    *   `SITENAME` - Site name (up to 6 characters)
    *   `0001` - Sequence number (4 digits)
    *   `TPM` - Activity type (TPM, PDM, CFM, FCS, OTHER)

*   **Access Control:** SuperAdmin and Admin roles only

*   **Database Status:** SQL migration available in `supabase/migrations/001_hub_operations_tables.sql`. Run in Supabase SQL Editor to create tables (`hubs`, `sites_registry`, `project_scopes`) with RLS policies. Page handles missing tables gracefully with local fallback data.

**Site Visits Enhancement (Nov 2025):** The Site Visits page has been redesigned to match the Hub Operations and Users Management design pattern:

*   **Key Files:**
    *   `src/pages/SiteVisits.tsx` - Main page with enhanced header and layout
    *   `src/components/site-visit/SiteVisitStats.tsx` - Gradient stat cards matching Hub Operations style
    *   `src/components/site-visit/SiteVisitCard.tsx` - Enhanced site visit card component

*   **Design Improvements:**
    *   Gradient stat cards (Pending, In Progress, Completed, Scheduled, Overdue)
    *   Consistent header style with icon and action buttons
    *   Container layout matching Hub Operations page
    *   Data collector specific view with Dispatched, Assigned, Accepted, Ongoing, Completed stats

### Sudan Administrative Data

Complete Sudan administrative structure based on official OCHA/WFP COD-AB (Common Operational Dataset - Administrative Boundaries):

*   **Key File:** `src/data/sudanStates.ts`
*   **Source:** [HDX Dataset](https://data.humdata.org/dataset/cod-ab-sdn) - Last reviewed August 2024
*   **Structure:**
    *   **18 States** (Admin Level 1)
    *   **188 Localities** (Admin Level 2) + Abyei PCA area
*   **Features:**
    *   English and Arabic names for all localities
    *   WFP Hub structure (5 operational hubs)
    *   Helper functions: `getLocalitiesByState()`, `getStateName()`, `getStateCode()`, `searchLocalities()`
    *   Locality search supporting both English and Arabic names

### Navigation & User Preferences

A comprehensive user preference system for sidebar navigation and dashboard personalization:

*   **Key Files:**
    *   `src/types/user-preferences.ts` - Type definitions for menu and dashboard preferences
    *   `src/components/AppSidebar.tsx` - Workflow-aligned sidebar with 6 logical menu groups
    *   `src/context/settings/SettingsContext.tsx` - Extended with menu/dashboard preference methods
    *   `src/pages/Settings.tsx` - Navigation preferences tab in Settings page

*   **Sidebar Menu Groups (Workflow-Aligned):**
    1. **Overview** - Dashboard, My Wallet, Cost Submission
    2. **Planning & Setup** - Projects, MMP Management, Hub Operations
    3. **Field Operations** - Site Visits, Field Team, Field Operation Manager
    4. **Verification & Review** - Site Verification, Archive
    5. **Data & Reports** - Data Visibility, Reports
    6. **Administration** - User/Role Management, Super Admin, Financial Operations, Budget, Settings

*   **Dashboard Zones (Role-Based):**
    *   `operations` - SuperAdmin/Admin system overview
    *   `fom` - Field Operations Manager hub & team management
    *   `team` - Supervisor team activity & compliance
    *   `planning` - Coordinator site verification, MMP status
    *   `dataCollector` - Data Collector my sites, wallet, upcoming visits
    *   `financial` - FinancialAdmin budget, cost approvals
    *   `ict` - ICT system health, user stats

*   **User Customization Features:**
    *   Hide/show menu items (persisted in user_settings.settings JSON)
    *   Pin items to top of menu groups
    *   Collapse menu groups by default
    *   Choose default dashboard zone
    *   Settings > Navigation tab for preference management

## External Dependencies

### Third-Party Services

*   **Supabase:** PostgreSQL database, authentication, real-time subscriptions, file storage, Row Level Security.
*   **GitHub:** Octokit REST API for repository operations.

### UI Libraries

*   **Shadcn UI Components:** Radix UI primitives for 50+ customizable components.
*   **Recharts:** For data visualization (charts and graphs).
*   **Lucide React:** For consistent iconography.

### Development Tools

*   **Build & Dev Environment:** Vite, ESLint, TypeScript compiler, PostCSS with Autoprefixer.
*   **Form Management:** React Hook Form (state), Zod (schema validation).
*   **Utilities:** `date-fns`, `uuid`, `clsx`/`class-variance-authority`, `Leaflet` (map components), `jspdf`, `jspdf-autotable`, `xlsx` (export).

### Deployment

*   **Hosting:** Replit (development), Vercel (production-ready configuration).
*   **Mobile Deployment:** Capacitor (iOS/Android builds, native device API access).

## Documentation

Complete user and administrator documentation is available in the `/docs` folder:

*   **USER_MANUAL.md** - Comprehensive A-Z guide for all users covering all features
*   **QUICK_START_GUIDE.md** - 5-minute getting started guide
*   **ADMIN_GUIDE.md** - Complete administrator and system configuration guide
*   **MOBILE_APP_GUIDE.md** - iOS and Android mobile application guide
*   **BUG_REPORT_AND_ENHANCEMENTS.md** - Current issues and recommended improvements
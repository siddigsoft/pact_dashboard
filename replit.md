# PACT Workflow Platform

## Overview

The PACT (Planning, Approval, Coordination, and Tracking) Workflow Platform is a comprehensive field operations management system designed to streamline Monthly Monitoring Plans (MMPs), site visits, and field team coordination. Built with React and TypeScript, its core purpose is to enhance efficiency, transparency, and accountability in field operations. The platform offers multi-tier user management, robust role-based access control, real-time collaboration, detailed MMP and site visit workflows, real-time location sharing, and an advanced financial tracking system including transportation costs and down-payments. It also features comprehensive reporting and a mobile-responsive Mission Control Dashboard with role-aware navigation, providing an end-to-end solution for field operations management.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

The frontend is built with React 18, TypeScript, React Router DOM v6, Vite, Tailwind CSS v3, and Shadcn UI. It features a responsive, component-based design with dual-theme support and a custom color palette. State management utilizes React Context API for global state, TanStack Query for server state, and Supabase Realtime for subscriptions. Mobile-first design principles are applied, including separate mobile/desktop components, touch-friendly UI, and PWA readiness. Data consistency between web and mobile is ensured via a shared Supabase database with real-time subscriptions and an offline queue.

### Backend

The backend uses PostgreSQL via Supabase, leveraging Row Level Security (RLS) and real-time subscriptions. The database schema supports core entities such as profiles, roles, projects, MMPs, site visits, budgets, wallets, and cost submissions, including audit logs for financial transactions and deletions. Supabase Auth manages authentication with email/password, Google OAuth, session management, role-based access control, and TOTP-based Two-Factor Authentication (2FA).

### Core Features

*   **Two-Factor Authentication (2FA):** Implemented using TOTP-based 2FA via Supabase's MFA system.
*   **Authorization System:** Resource-action based permission model (`mmp:read`, `site_visits:create`) with granular permissions and admin bypass, enforced across UI, route guards, and server-side RLS.
*   **File Processing:** MMP Upload Workflow for CSV files with Zod validation, row-by-row parsing, and database insertion with rollback.
*   **Real-Time Capabilities:** Live Dashboard with automatic data refresh and notifications via Supabase Realtime, and real-time GPS location sharing with privacy controls.
*   **Notification System:** Comprehensive browser push notifications with configurable settings and granular category toggles.
*   **Financial Management:** Advanced transportation cost and down-payment system with a two-tier approval workflow and audit trails. Includes a `super_admin` role for oversight.
*   **Hub & Field Operations Structure:** Geographical management for hubs, states, and localities, with a master sites registry and interactive Leaflet maps.
*   **Site Visits Enhancement:** Redesigned interface with gradient stat cards and a data collector-specific view.
*   **Geographic Filtering:** Ensures data collectors only view dispatched sites within their assigned state and locality.
*   **Nearest Available Enumerators:** GPS-based proximity matching using the Haversine formula to show enumerators sorted by distance from site coordinates.
*   **First-Claim Dispatch System:** Uber/Lyft-style site claiming system for dispatched sites, utilizing an atomic PostgreSQL RPC function (`claim_site_visit`) to prevent race conditions. Supports Open, State, Locality, and Individual dispatch modes.
*   **Classification-Based Fee Calculation:** Enumerator fees are calculated at claim/acceptance time based on a user's classification level (A, B, C) and a predefined fee structure, stored atomically with an audit trail. A dedicated admin page allows management of these fees.
*   **Sudan Administrative Data:** Integrated complete Sudan administrative structure (18 states, 188 localities) based on official OCHA/WFP COD-AB.
*   **Navigation & User Preferences:** Customizable sidebar navigation with workflow-aligned menu groups and personalized dashboard zones.
*   **Unified Site Management System:** Eliminates duplicate site entries and enables GPS enrichment over time. Sites are registered and matched during MMP upload, and GPS coordinates from field visits enrich the master `sites_registry`.
*   **Tracker Preparation Plan:** Analyzes planned vs. actual site coverage, provides real-time updates via Supabase Realtime, and facilitates invoice preparation with detailed cost breakdowns. Includes multi-view analysis, export capabilities (Excel, PDF), and configurable filter presets.
*   **Site Visit Details Enhancement:** Unified display of cost breakdowns and a workflow audit trail for each site visit, presented in a streamlined layout.

## Recent Changes

*   **Unified Supabase Client (Nov 2025):** Consolidated all Supabase imports to use a single client instance from `@/integrations/supabase/client`. Previously, some files imported from `@/lib/supabase` creating multiple GoTrueClient instances. All files now use the same client with proper auth configuration (persistSession, autoRefreshToken, detectSessionInUrl).

*   **Sites Registry Duplicate Prevention:** Enhanced logging in `ensureSitesInRegistry()` to clearly show:
    - How many sites exist in the registry before processing
    - For each site: whether it's MATCHED to existing or created NEW
    - Summary showing total sites, existing linked, and new created
    The three-tier matching system prevents duplicate site entries: exact site code match > name+state+locality match > name+state match.

*   **MMP Duplicate Prevention (Nov 2025):** Refined duplicate detection logic:
    - Same project + month + file name = BLOCKED (exact duplicate)
    - Same project + month + different file = ALLOWED (supplementary file)
    - Same file + different month = ALLOWED (recurring monthly monitoring)
    This allows reusing the same file template for monthly monitoring cycles.

*   **Same-Site-Same-Month Prevention (Nov 2025):** Added validation to prevent duplicate site entries within the same month:
    - Before upload, checks if any sites in the file already exist in other MMPs for the same month
    - Matches by site_code (primary) or site_name + state + locality (secondary)
    - Blocks upload if duplicates found, showing which sites are already scheduled
    - Error message lists up to 5 duplicate sites with their existing MMP names
    This ensures each site can only be monitored once per monthly period.

## External Dependencies

*   **Supabase:** PostgreSQL database, Authentication, Realtime subscriptions, Storage, Row Level Security.
*   **GitHub:** Octokit REST API.
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
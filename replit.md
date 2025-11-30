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
*   **Hub & Field Operations Structure:** Geographical management for hubs, states, and localities, with a master sites registry and interactive Leaflet maps. **Hub-Based Supervision Model**: Each hub manages MULTIPLE states (e.g., Kosti Hub = 7+ states, Kassala Hub = 5 states). Hub Supervisors are assigned `hub_id` (NOT state_id) and see ALL team members across ALL states in their hub.
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

*   **Hub-Based Supervision Documentation (Nov 2025):** Added comprehensive financial workflow documentation to USER_MANUAL.md:
    - Cost Submission Workflow: Post-visit expense reimbursement process with visual flowcharts
    - Down Payment System: Two-tier approval (Supervisor → Admin) for pre-travel advances
    - Final Payment: Automatic wallet credit on site visit completion (enumerator_fee + transport_fee)
    - Hub Supervisor Model: Clarified that hub supervisors manage MULTIPLE states (Kosti = 7+ states, Kassala = 5 states)
    - Withdrawal Permissions: Hub supervisors need `hub_id` assigned to see team members across all states in their hub

*   **Wallet Transaction Type & Backfill Fix (Nov 2025):** Fixed wallet transactions to use correct database enum and backfilled missing transactions:
    - Changed transaction type from 'site_visit_fee' to 'earning' (matching database enum `wallet_tx_type`)
    - Added required `amount_cents` field (amount * 100) to all wallet transaction inserts
    - Created backfill SQL script to create wallet transactions for completed sites that were missing them
    - Updated wallet balances to reflect all completed site visits
    - Queries now check for both 'earning' and 'site_visit_fee' types for backwards compatibility

*   **Wallet Payment Fix for Auto-Accept (Nov 2025):** Fixed wallet payments not being created for sites that went through the "Start Visit" auto-accept flow:
    - Root cause: When "Assigned" sites were started (auto-accepted), fees were not being calculated/set
    - `handleConfirmStartVisit` now calculates and sets fees during auto-accept when they're missing
    - Preserves existing fees set by operations team (doesn't overwrite non-zero values)
    - Ensures `cost = enumerator_fee + transport_fee` is always calculated correctly
    - Defaults `transport_fee` to 0 when null to prevent NaN
    - `handleCompleteVisit` can now create wallet transactions with valid fee data

*   **AdminWalletDetail Query Fix (Nov 2025):** Fixed the Admin Wallets detail page to use correct data source:
    - Changed from querying non-existent `site_visits` + `site_visit_costs` join to querying `mmp_site_entries` directly
    - Uses correct field mappings: `enumerator_fee`, `transport_fee`, `cost`, `accepted_at`, `visit_completed_at`
    - Fixed case-sensitive status comparisons (e.g., 'Completed' vs 'completed')
    - Added fallback to show site cost when no payment transaction exists yet
    - Resolves "Could not find a relationship between 'site_visits' and 'site_visit_costs'" error

*   **Visit Tracking Columns Added (Nov 2025):** Added dedicated database columns for visit tracking:
    - Added `visit_started_at`, `visit_started_by`, `visit_completed_at`, `visit_completed_by` columns to `mmp_site_entries` table
    - Refreshed PostgREST schema cache via `NOTIFY pgrst, 'reload schema'`
    - Updated `handleConfirmStartVisit` and `handleCompleteVisit` in MMP.tsx to use direct columns
    - PDF report generator has fallback support for both direct columns and legacy `additional_data` storage
    - This resolves the "Could not find column in schema cache" errors

*   **Wallet Balance Display Fix (Nov 2025):** Fixed Admin Wallets page to properly display earnings breakdown:
    - Enhanced `adminListWallets` to query transactions by both `wallet_id` AND `user_id` for legacy support
    - Added fallback display: when no transaction breakdown is available, shows "Total Earned" from the wallet's `total_earned` column
    - Fixed balance parsing to handle both object and string formats for the `balances` JSONB column
    - Ensured SDG balance is always converted to a number for proper display

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

## Documentation

Comprehensive user documentation is available in the `docs/` directory:

*   **USER_MANUAL.md:** Complete platform guide with all features documented (1500+ lines)
*   **PAGE_REFERENCE_GUIDE.md:** URL-by-URL reference for all 60+ pages with access levels and usage instructions
*   **QUICK_START_CARDS.md:** Role-specific quick start guides for all user types (Data Collector, Coordinator, Supervisor, Finance, FOM, Admin, Super Admin, ICT, Reviewer)
*   **RBAC_GUIDE.md:** Role-based access control documentation
*   **PAYMENT_SYSTEM_GUIDE.md:** Wallet and payment system documentation
*   **APK_GENERATION_STEP_BY_STEP.md:** Mobile app build instructions
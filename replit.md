# PACT Workflow Platform

## Overview

The PACT (Planning, Approval, Coordination, and Tracking) Workflow Platform is a comprehensive field operations management system built with React and TypeScript. Its primary purpose is to streamline Monthly Monitoring Plans (MMPs), site visits, and field team coordination, enhancing efficiency, transparency, and accountability in field operations. Key capabilities include multi-tier user management, robust role-based access control, real-time collaboration, MMP and site visit workflows, real-time location sharing, financial tracking with an advanced transportation cost and down-payment system, reporting, and a mobile-responsive Mission Control Dashboard with role-aware navigation. The platform aims to provide a complete end-to-end workflow management solution for field operations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The frontend uses React 18, TypeScript, React Router DOM v6, Vite, Tailwind CSS v3, and Shadcn UI. It features a responsive, component-based design with dual-theme support and a custom color palette. State management leverages React Context API for global state, TanStack Query for server state, React hooks for local state, and Supabase Realtime for subscriptions. Mobile support is prioritized with mobile-first CSS, separate mobile/desktop components, touch-friendly UI, and PWA readiness. A web-mobile synchronization system ensures data consistency via a shared Supabase database with real-time subscriptions and an offline queue mechanism.

### Backend Architecture

The backend utilizes PostgreSQL through Supabase, incorporating Row Level Security (RLS) and real-time subscriptions. The database schema supports profiles, roles, projects, MMPs, site visits, budgets, wallets, and cost submissions, including audit logs for financial transactions and deletions. Supabase Auth handles authentication with email/password, Google OAuth, session management, role-based access control, and TOTP-based Two-Factor Authentication (2FA). Data flow is managed via context providers, optimistic updates, and Supabase Storage for file management.

### Core Feature Specifications

*   **Two-Factor Authentication (2FA):** Implements TOTP-based 2FA using Supabase's MFA system, integrated into the login flow and user settings.
*   **Authorization System:** Employs a resource-action based permission model (`mmp:read`, `site_visits:create`) with granular permissions and an admin bypass, enforced across UI rendering, route guards, and server-side RLS policies.
*   **File Processing:** Includes an MMP Upload Workflow for CSV files with Supabase Storage integration, Zod schema validation, row-by-row parsing, and database insertion with rollback capabilities.
*   **Real-Time Features:** A Live Dashboard uses Supabase Realtime for automatic data refresh and notifications. Real-time location sharing offers GPS coordinate capture, live updates, and privacy controls.
*   **Notification System:** A comprehensive system with browser push notification support, configurable settings (email, sound, browser push), and granular category toggles (assignments, approvals, financial, team, system).
*   **Transportation Cost & Down-Payment System:** Manages transportation cost calculation, down-payment requests via a two-tier approval workflow, and tracks all cost adjustments with an audit trail, including a `super_admin` role.
*   **Hub & Field Operations Structure:** A geographical management system for creating/editing hubs, assigning states, viewing localities, and maintaining a master sites registry with unique IDs. Features interactive Leaflet maps and project scope linking. Access is limited to SuperAdmin and Admin roles.
*   **Site Visits Enhancement:** Redesigned page with gradient stat cards (Pending, In Progress, Completed, Scheduled, Overdue) and consistent header styles. Includes a data collector-specific view.
*   **Geographic Filtering for Data Collectors:** Strict geographic-based site visibility ensures data collectors only see dispatched sites matching their profile's state and locality, with visual indicators for configuration status.
*   **Nearest Available Enumerators:** GPS-based proximity matching showing enumerators sorted by distance from site coordinates using the Haversine formula. Displays distance in km, estimated travel time, and location freshness indicator. Visible to admin/ict/fom roles in Site Visit Detail page.
*   **First-Claim Dispatch System:** An Uber/Lyft-style site claiming system where dispatched sites can be claimed by any enumerator within matching state and locality on a first-come, first-served basis. Features atomic claiming via PostgreSQL `claim_site_visit` RPC function with `SELECT FOR UPDATE SKIP LOCKED` to prevent race conditions, one-click ClaimSiteButton component with optimistic UI, and Supabase Realtime subscription (`useSiteClaimRealtime` hook) for live site availability updates across all users. Status flow: "Dispatched" (available) → "Assigned" (claimed). Error handling includes specific messages for ALREADY_CLAIMED and CLAIM_IN_PROGRESS scenarios.
*   **Sudan Administrative Data:** Integrated complete Sudan administrative structure (18 states, 188 localities) based on official OCHA/WFP COD-AB, including English/Arabic names and helper functions.
*   **Navigation & User Preferences:** A comprehensive system for customizing the sidebar navigation (6 workflow-aligned menu groups) and dashboard personalization (role-based zones). Users can hide/show menu items, pin items, collapse groups, and choose a default dashboard zone.

## External Dependencies

### Third-Party Services

*   **Supabase:** PostgreSQL database, authentication, real-time subscriptions, file storage, Row Level Security.
*   **GitHub:** Octokit REST API for repository operations.

### UI Libraries

*   **Shadcn UI Components:** Radix UI primitives for customizable components.
*   **Recharts:** For data visualization.
*   **Lucide React:** For iconography.

### Development Tools

*   **Build & Dev Environment:** Vite, ESLint, TypeScript compiler, PostCSS with Autoprefixer.
*   **Form Management:** React Hook Form, Zod (schema validation).
*   **Utilities:** `date-fns`, `uuid`, `clsx`/`class-variance-authority`, `Leaflet` (map components), `jspdf`, `jspdf-autotable`, `xlsx`.

### Deployment

*   **Hosting:** Replit (development), Vercel (production).
*   **Mobile Deployment:** Capacitor (iOS/Android builds, native device API access).
# PACT Workflow Platform

## Overview

The PACT (Planning, Approval, Coordination, and Tracking) Workflow Platform is a comprehensive field operations management system designed to streamline Monthly Monitoring Plans (MMPs), site visits, and field team coordination. Built with React and TypeScript, its purpose is to provide robust role-based access control, real-time collaboration, and end-to-end workflow management for field operations. Key capabilities include multi-tier user management, MMP and site visit workflows, real-time location sharing, financial tracking with a new transportation cost and down-payment system, reporting, mobile responsiveness, and a Mission Control Dashboard with role-aware navigation. The platform aims to enhance efficiency, transparency, and accountability in field operations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The frontend is built with React 18, TypeScript, React Router DOM v6, Vite, Tailwind CSS v3, and Shadcn UI. It features dual-theme support (light/dark), a custom color palette, responsive design, and a component-based architecture. State management utilizes the React Context API for global state, TanStack Query for server state, and React hooks for local state, complemented by Supabase Realtime for subscriptions. Key design patterns include provider patterns, custom hooks, compound components, and error boundaries. Mobile support is a core focus, with mobile-first CSS, separate mobile/desktop components, touch-friendly UI, and PWA readiness. A comprehensive web-mobile synchronization system ensures seamless data consistency using a shared Supabase database with real-time subscriptions and an offline queue mechanism for mobile.

### Backend Architecture

The backend leverages PostgreSQL via Supabase, with robust Row Level Security (RLS) and real-time subscriptions. The database schema supports profiles, roles, projects, MMPs, site visits, budgets, wallets, and cost submissions, including detailed audit logs for financial transactions and deletions. Authentication is handled by Supabase Auth, providing email/password login, session management, and role-based access control. Data flow is managed through context providers, with optimistic updates and Supabase Storage for file management.

### Authorization System

A resource-action based permission model (e.g., `mmp:read`, `site_visits:create`) is implemented with granular permissions (read, create, update, delete, approve, assign, archive) and an admin bypass. Enforcement occurs via client-side UI rendering, route guards, server-side RLS policies, and a defined role hierarchy.

### File Processing

The platform includes an MMP Upload Workflow for CSV files, featuring upload to Supabase Storage, Zod schema validation, row-by-row parsing, database insertion, and rollback on failure. Validation layers include file format, schema, business rule, and cross-reference checks.

### Real-Time Features

Real-time capabilities include a Live Dashboard powered by Supabase Realtime channels for key tables, providing toast notifications and automatic data refresh. Real-time location sharing involves GPS coordinate capture, live updates, privacy controls, and location-based assignment.

### Core Feature Specifications

**Transportation Cost & Down-Payment System:** This system calculates transportation costs before dispatch by admins, manages down-payment requests from enumerators/coordinators via a two-tier approval workflow (supervisor → admin), and tracks all cost adjustments with a complete audit trail. It includes a `super_admin` role with a 3-account limit and a deletion audit log.

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
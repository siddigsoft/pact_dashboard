# PACT Workflow Platform

## Overview

The PACT (Planning, Approval, Coordination, and Tracking) Workflow Platform is a comprehensive field operations management system for managing Monthly Monitoring Plans (MMPs), site visits, and field team coordination. Built with React and TypeScript, it provides role-based access control, real-time collaboration, and end-to-end workflow management for field operations. Key capabilities include multi-tier user management, MMP and site visit workflows, real-time location sharing, financial tracking, reporting, mobile responsiveness, and a Mission Control Dashboard with role-aware navigation.

## Recent Changes

### Performance Optimizations (Nov 24, 2025)

**Financial Operations Page Load Time Improvements:**
- Eliminated duplicate database queries by using SiteVisitContext instead of direct Supabase calls in SiteVisitsOverview component
- Added loading state to SiteVisitContext to prevent flash of empty content during initial data load
- Reduced user polling interval from 30 seconds to 5 minutes (300000ms) to minimize database load
- Implemented useMemo for derived calculations to prevent unnecessary re-renders
- Result: Faster page load, reduced database queries, improved user experience

**Mobile Theme Standardization:**
- Fixed Vite production build error by replacing @apply directives with direct CSS variables in mobile.css
- Updated mobile.css, MobileNavigation.tsx, and MobileAppHeader.tsx to use consistent cyber-tech gradient theme
- Maintained theme consistency across web and mobile interfaces

### Mobile App Production-Ready Improvements (Nov 24, 2025)

**Capacitor Configuration - Security & Deployment:**
- Updated appId from Lovable to `com.pact.workflow` for proper Android/iOS identification
- Configured server URL to point to Replit production domain
- Enforced HTTPS-only transport: `cleartext: false` and `androidScheme: 'https'`
- Added allowNavigation whitelist for Replit and Supabase domains
- Disabled webContentsDebugging for production security
- Configured SplashScreen with cyber-tech blue theme (#1e40af)
- Added PushNotifications and LocalNotifications plugin configurations

**ViewMode Auto-Detection:**
- Replaced manual toggle with automatic viewport detection using useIsMobile hook (768px breakpoint)
- Added forceMode override for development testing with visual indicators
- ViewModeContext now provides `isAutoDetect` flag
- Updated ViewModeToggle with Sparkles icon when override is active

**Mobile Navigation - Full Feature Parity:**
- Expanded from 6 features to 14+ features (now matches web app capabilities)
- Primary navigation: Dashboard, Field Team, MMP, Chat (with badge), More menu
- Secondary navigation in More drawer: Finance, Wallet, Projects, Reports, Costs, Calendar, Team, Settings, Archive
- Role-based filtering using AppRole type checking
- Cyber-tech themed with gradient backgrounds, glassmorphism effects, and neon glow states
- Active state indicators with bottom gradient bar and Sparkles animations
- Sheet-based "More" menu for additional features (70vh responsive drawer)

**Offline Support Infrastructure:**
- Created offline-queue.ts service with localStorage persistence
- Network status detection with online/offline event listeners
- Request queuing for failed/offline operations (POST, PUT, PATCH, DELETE)
- Auto-sync on network reconnection with retry logic (max 3 attempts)
- Supabase session token injection for authenticated requests
- useOfflineQueue hook for easy component integration

**Safe-Area Padding & Scroll Optimization:**
- Added safe-area utility classes: `.pt-safe`, `.pb-safe`, `.pb-safe-nav`, `.mt-safe`, `.mb-safe`
- MainLayout updated to use `pb-safe-nav` (accounts for 4rem bottom nav + device safe area)
- Scroll container optimization with smooth scrolling and overscroll containment
- Touch target enforcement: minimum 44px height/width for all interactive elements

**Cyber-Tech Theme System:**
- Created mobile-gradients.ts utility library with consistent gradient definitions
- Gradient variants: primary (blue), success (green), warning (orange), danger (red), purple, cyan
- Special gradients: header (blue→purple), nav (slate glass), card, glass (backdrop blur)
- Border variants with glow effects and text utilities with drop-shadow
- Helper functions: `getCyberCardClasses()`, `getCyberGlassClasses()`

### Web-Mobile Synchronization Architecture (Nov 24, 2025)

**Comprehensive Sync System:**
- Documented complete architecture ensuring seamless data sync between web app, database, and mobile APK
- Single source of truth: Shared Supabase database with real-time subscriptions for instant sync
- Real-time synchronization: Changes propagate in <500ms between web and mobile platforms
- Offline queue system: Mobile app queues requests when offline, auto-syncs when reconnected
- Version management system with semantic versioning (MAJOR.MINOR.PATCH)

**Version Compatibility Strategy:**
- API versioning with backward compatibility (old mobile APKs work with new web deployments)
- Additive-only database migrations for minor versions (no breaking changes)
- Grace period strategy for major versions (v1.9.0 adds new fields, v2.0.0 removes old after 3 months)
- Version checking on app startup with update notifications
- app_versions table tracks minimum supported version, latest version, and changelogs

**Version Enforcement:**
- Client-side: UpdateDialog blocks app usage when update required, re-checks hourly
- API client sends X-App-Version header with all requests
- Full-screen overlay prevents app usage when force_update is true
- Production recommendation: Deploy Supabase Edge Function for server-side version validation
- Cannot be bypassed when server-side enforcement is implemented

**Documentation Created:**
- WEB_MOBILE_SYNC_ARCHITECTURE.md: Complete sync architecture with real-time flow diagrams
- DEPLOYMENT_CHECKLIST.md: Pre-deployment checks, testing matrix, rollback procedures
- VERSION_UPDATE_GUIDE.md: Step-by-step guides for 4 scenarios (web-only, mobile, new feature, breaking change)
- SERVER_SIDE_VERSION_ENFORCEMENT.md: Production-grade validation using Supabase Edge Functions
- Database migration: 20251124_add_app_versions_table.sql with RLS policies

**Components & Utilities:**
- versionChecker.ts: Semantic version comparison, version info fetching from database
- UpdateDialog.tsx: Cyber-tech themed update notification with forced update enforcement
- apiClient.ts: Sends version headers, handles 426 Upgrade Required responses
- Integrated into MainLayout.tsx for global version checking

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework Stack:** React 18 with TypeScript, React Router DOM v6, Vite, Tailwind CSS v3, Shadcn UI.
**Design System:** Dual-theme support (light/dark mode), custom color palette, responsive design, component-based architecture.
**State Management:** React Context API for global state, TanStack Query for server state, local state with React hooks, Supabase Realtime for subscriptions.
**Key Design Patterns:** Provider pattern, custom hooks, compound components, error boundaries, progressive loading.

### Backend Architecture

**Database:** PostgreSQL via Supabase with Row Level Security (RLS) and real-time subscriptions. Schema includes tables for profiles, roles, projects, MMPs, site visits, budgets, wallets, and cost submissions.
**RLS Security (Nov 23, 2025):** Cost submission tables protected with 7 security policies - data collectors see only their own submissions, admins see all submissions, database-level security prevents unauthorized access.
**Authentication:** Supabase Auth (email/password) with session management and role-based access control.
**Data Flow:** Context providers for CRUD, snake_case to camelCase transformation, optimistic updates, Supabase Storage for files.

### Authorization System

**Permission Model:** Resource-action based (e.g., `mmp:read`, `site_visits:create`) with granular permissions (read, create, update, delete, approve, assign, archive) and admin bypass.
**Enforcement:** Client-side UI rendering and route guards, server-side RLS policies, and a role hierarchy.

### File Processing

**MMP Upload Workflow:** CSV file upload to Supabase Storage, Zod schema validation, row-by-row parsing, database insertion, and rollback on failure.
**Validation Layers:** File format, schema, business rule, and cross-reference validation.

### Real-Time Features

**Live Dashboard:** Supabase Realtime channels for key tables, toast notifications, automatic data refresh.
**Location Sharing:** GPS coordinate capture, real-time location updates, privacy controls, location-based assignment.

### Mobile Support

**Responsive Strategy:** Mobile-first CSS with Tailwind breakpoints, separate mobile/desktop components, touch-friendly UI.
**Progressive Web App:** Service worker ready, app manifest for installability, optimized bundle sizes, lazy loading.

## External Dependencies

### Third-Party Services

**Supabase:** PostgreSQL database, authentication, real-time subscriptions, file storage, Row Level Security.
**GitHub Integration:** Octokit REST API for repository operations.

### UI Libraries

**Shadcn UI Components:** Radix UI primitives, 50+ pre-built components (Dialog, Dropdown, Tabs, etc.), customizable via Tailwind CSS.
**Data Visualization:** Recharts for charts and graphs.
**Icon Library:** Lucide React for consistent iconography.

### Development Tools

**Build & Dev Environment:** Vite, ESLint, TypeScript compiler, PostCSS with Autoprefixer.
**Form Management:** React Hook Form for state, Zod for schema validation.
**Utilities:** date-fns, uuid, clsx/class-variance-authority, Leaflet (map components), jspdf, jspdf-autotable, xlsx (export).

### Deployment

**Hosting:** Replit for development, Vercel-ready configuration.
**Mobile Deployment:** Capacitor for iOS/Android builds, native device API access.
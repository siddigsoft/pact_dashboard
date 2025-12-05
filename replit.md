# PACT Workflow Platform

## Overview
The PACT (Planning, Approval, Coordination, and Tracking) Workflow Platform is a comprehensive field operations management system designed to streamline Monthly Monitoring Plans (MMPs), site visits, and field team coordination. Its core purpose is to enhance efficiency, transparency, and accountability in field operations by offering multi-tier user management, robust role-based access control, real-time collaboration, detailed MMP and site visit workflows, real-time location sharing, advanced financial tracking, comprehensive reporting, and a mobile-responsive Mission Control Dashboard with role-aware navigation. This end-to-end solution optimizes field operations for various organizations.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend, built with React 18, TypeScript, Tailwind CSS v3, and Shadcn UI, features a responsive, component-based design with dual-theme support and a custom color palette. It follows mobile-first design principles, including separate mobile/desktop components, touch-friendly UI, and PWA readiness.

### Technical Implementations
*   **Frontend:** Utilizes React Router DOM v6, Vite, and React Context API for global state. TanStack Query manages server state, and Supabase Realtime handles subscriptions. Data consistency between web and mobile is ensured via a shared Supabase database with real-time subscriptions and an offline queue for mobile.
*   **Backend:** Leverages PostgreSQL via Supabase, employing Row Level Security (RLS) and real-time subscriptions. Supabase Auth provides authentication with email/password, Google OAuth, session management, role-based access control, and TOTP-based Two-Factor Authentication (2FA). The database schema supports core entities like profiles, roles, projects, MMPs, site visits, budgets, wallets, and cost submissions, with audit logs for financial transactions and deletions.
*   **Mobile Offline Infrastructure:** Features IndexedDB for local storage, a Sync Manager for robust offline-to-online data synchronization with configurable conflict resolution, and a Service Worker for caching. Offline-capable features include site visit workflows, GPS capture, photo capture, cost submissions, and cached MMP lists. Online-only features include real-time dashboards, wallet operations, chat, live location maps, reports, user management, and push notifications.
*   **Android APK Build (Optimized):** Capacitor-based mobile deployment with native plugins for app lifecycle, GPS tracking, push notifications, network monitoring, and geofencing.

    **Build Optimizations:**
    - R8/ProGuard enabled for release builds with optimized shrinking and obfuscation
    - ABI splits for smaller APK downloads (arm64-v8a, armeabi-v7a, x86, x86_64)
    - Automated version code from git commit count
    - Firebase Crashlytics integration for crash reporting

    **Security Hardening:**
    - Cleartext traffic disabled by default (HTTPS only except localhost)
    - Network security config with explicit domain rules for Supabase, Firebase, Vercel
    - Permission rationale dialogs before requesting sensitive permissions

    **FCM Push Notifications (Enhanced):**
    - Custom monochrome notification icon for status bar
    - Dual notification channels: default and urgent (high priority)
    - FCM token persistence in SharedPreferences with refresh handling
    - Data-only message handling for background sync triggers
    - Foreground notification deduplication

    **Location Foreground Service:**
    - Android 10+ compliant foreground service for continuous GPS
    - Configurable update intervals (30s default, 15s fastest)
    - Minimum displacement filter (10m) to reduce battery usage

    **Enhanced Offline Sync:**
    - SyncStatusBar component with manual "Sync Now" button
    - OfflineBanner shows connection status prominently
    - Exponential backoff retry (1s to 60s max delay)
    - Conflict resolution strategies: last-write-wins, server-wins, client-wins

    **Mobile-Specific Authentication UI:**
    - Custom MobileAuthScreen with minimalist city map background
    - Touch-optimized design with large 14px height input fields (44px touch targets)
    - Bottom-weighted layout with expandable login form
    - Swipe-up gesture support with visual handle indicator
    - Biometric login button (Fingerprint/Face ID ready)
    - Dark gradient overlay for visual polish
    - Connection status badge and feature pills

### Feature Specifications
*   **Authorization System:** Resource-action based permission model with granular permissions enforced across UI, route guards, and server-side RLS.
*   **File Processing:** MMP Upload Workflow for CSV files includes Zod validation, parsing, and database insertion with rollback and duplicate prevention.
*   **Real-Time Capabilities:** Live Dashboard with automatic data refresh and notifications via Supabase Realtime, and real-time GPS location sharing with privacy controls.
*   **Financial Management:** Advanced transportation cost and down-payment system with a two-tier approval workflow and audit trails. Includes enumerator fee calculation and a Finance Approval page with real-time wallet balances, shortfall warnings, receipt support, and batch processing.
*   **Hub & Field Operations Structure:** Geographical management for hubs, states, and localities, with a master sites registry and interactive Leaflet maps. Supports a Hub-Based Supervision Model.
*   **Site Visits Enhancements:** Redesigned interface, data collector-specific view, geographic filtering, GPS-based proximity matching, and a first-claim dispatch system.
*   **Unified Site Management System:** Prevents duplicate site entries and enables GPS enrichment.
*   **Tracker Preparation Plan:** Analyzes planned vs. actual site coverage, provides real-time updates, and facilitates invoice preparation.
*   **Visit Tracking:** Dedicated database columns for comprehensive tracking of visit start and completion.
*   **GPS Accuracy Display:** Location accuracy displayed across all team location views with color-coded indicators.
*   **Signature & Transaction Module:** Comprehensive digital signature system for wallet transactions and document signing, supporting SHA-256 hashing, cryptographically secure OTP, handwriting signatures, and audit logging. Includes mobile support, security features using Web Crypto API, and pre-verification enforcement for phone/email methods.
*   **Task-Level Budget Tracking:** Granular budget management at individual task/activity level with variance analysis (CPI, SPI, EAC), status classification, trend detection, spending restrictions, and 80% utilization alerts.

### System Design Choices
The project utilizes a unified Supabase client for all Supabase interactions, ensuring consistent authentication and session management. The system integrates the complete Sudan administrative structure.

## External Dependencies
*   **Supabase:** PostgreSQL database, Authentication, Realtime, Storage, Row Level Security.
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
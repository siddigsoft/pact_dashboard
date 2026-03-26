# PACT Architecture Guide

## Executive Summary

PACT is a React + TypeScript platform organized around **feature-first vertical slices**. Each feature owns its UI, state, data access, and domain behavior. Shared concerns are centralized under `src/shared` and app shell concerns under `src/app`.

This structure reduces cross-module coupling, improves onboarding speed, and makes feature changes safer to ship.

## Architectural Principles

- **Feature ownership first:** domain logic stays inside `src/features/<domain>`
- **Shared only when truly cross-cutting:** reuse goes into `src/shared/*`
- **App shell is thin:** routing, global guards, and root providers stay in app-level files
- **Explicit boundaries:** avoid deep imports across unrelated features
- **Prefer alias imports:** `@/*` paths improve readability and refactor safety

## Runtime Architecture

### Client Application Layer

- `src/main.tsx`
  - Initializes Capacitor runtime
  - Configures Crashlytics and global error handlers
  - Mounts React root

- `src/App.tsx`
  - Defines public and protected routes
  - Applies top-level providers and guards
  - Configures lazy-loading for major pages
  - Handles fallback states (loading/config/error)

### Domain Layer (`src/features`)

Each feature contains one or more of:
- page/screen entry files
- components
- context and hooks
- repository/query logic
- domain-specific utilities

### Shared Layer (`src/shared`)

Cross-feature code:
- layout components
- global context providers
- shared hooks and helper components
- non-domain pages and generic UX elements

### Platform Layer (`src/platform`)

Platform-specific concerns:
- mobile initialization
- permissions and device hooks
- crash/telemetry integration
- offline/mobile runtime utilities

### Integration Layer (`src/integrations`, `src/services`)

- Supabase clients and integration setup
- notification trigger services
- cross-cutting service orchestration

## Feature Domain Catalog

Current feature modules:

- `admin` - admin tools, support, broadcast, operational utilities
- `analytics` - dashboard and analysis flows
- `approval` - supervisor and approval dashboards
- `archive` - archived records and retrieval
- `audit` - audit logs and compliance tooling
- `auth` - login, registration, password flows
- `budget` - budget workflows and tracking
- `calendar` - planning calendar experiences
- `calls` - call management and analytics
- `chat` - messaging and communication views
- `classification` - classification and fee management
- `coordinator` - coordinator dashboards and site workflows
- `costApproval` - cost submission and approval
- `dashboard` - core role-based dashboard surfaces
- `documents` - documentation, exports, signatures, sync
- `downPayment` - down payment request and approval flows
- `finance` - finance operations and reconciliation
- `location` - mapping and location tools
- `mmp` - monitoring plan lifecycle
- `notifications` - preferences, history, analytics, in-app notifications
- `project` - project CRUD and activity tracking
- `reports` - report generation and access
- `roleManagement` - roles, permissions, and perspective tools
- `settings` - user and app settings
- `siteVisit` - site visit lifecycle and forms
- `user` - user management and field team pages
- `wallet` - wallet operations, transactions, and approvals

## Routing Strategy

- Public routes include auth, registration, and selected docs pages
- Protected routes are wrapped with authentication and session controls
- Most feature pages are lazy-loaded to optimize initial bundle cost
- Redirect routes maintain backward compatibility for legacy paths

## State and Data Flow

- **Remote data:** TanStack Query and repository/query helpers
- **Global app state:** context providers in shared/app layers
- **Domain-local state:** feature hooks and local component state
- **Notifications/events:** centralized providers and service triggers

## Security and Access

- Auth and route protection are enforced in app shell guards
- Role and permission behaviors are implemented in domain logic and UI gates
- Supabase policies and backend constraints are expected to provide server-side enforcement

## Build and Delivery Architecture

- Vite builds web bundles into `dist/`
- Capacitor workflows support Android packaging and runtime sync
- CI workflow (`.github/workflows/deploy.yml`) automates VPS deployment for configured branches

## Technical Debt and Transition Notes

- Legacy paths/components still exist in parts of `src/components` and related folders
- Ongoing migration should continue consolidating domain concerns inside `src/features`
- Documentation should be updated alongside each feature migration PR

## Recommended Governance

- Every new feature PR should include:
  - architectural boundary check
  - route and access implications
  - docs update impact
  - test impact summary

- Quarterly architecture review should validate:
  - feature boundary drift
  - shared-module bloat
  - route complexity growth
  - bundle size and performance trends

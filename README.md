# PACT Workflow Platform

Production web and mobile operations platform for monitoring plans, approvals, finance, field coordination, and reporting.

## Why This Exists

PACT centralizes operational workflows that are typically scattered across spreadsheets, chat tools, and manual approvals:
- Monthly Monitoring Plan (MMP) lifecycle
- Field visit planning and execution
- Cost submission and finance approvals
- Wallet, down payment, and reconciliation flows
- Notifications, auditability, and role-based governance

## Audience

- **Developers:** build, test, and ship feature-first modules quickly
- **Product and operations stakeholders:** understand workflows, scope, and release behavior
- **Admins and support teams:** run day-to-day operations safely

## Tech Stack

- React 18 + TypeScript + Vite
- Tailwind CSS + Radix UI + shadcn/ui
- React Router + TanStack Query
- Supabase (Auth, Postgres, Functions)
- Capacitor + Firebase Crashlytics (mobile runtime and diagnostics)
- Vitest + Testing Library

## Project Status

- Architecture uses **feature-first vertical slicing** under `src/features/*`
- Shared cross-domain code lives in `src/shared/*`
- App-level bootstrapping/routing is in `src/app/*` and `src/App.tsx`
- Path aliases use `@/* -> src/*` from `tsconfig.json`

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+

### Install and Run

```bash
npm install
npm run dev
```

App runs locally via Vite (default: `http://localhost:5173` unless overridden).

## Environment Configuration

Create `.env` (or `.env.local`) with required Supabase and mobile-related keys.

At minimum, ensure:
- Supabase URL and anon key are defined
- Any runtime config expected by `src/integrations/supabase/*` is available

If Supabase is not configured, the app intentionally shows a configuration guard screen instead of crashing.

## Core Commands

```bash
# Development
npm run dev
npm run build
npm run preview

# Quality
npm run lint
npx tsc --noEmit
npm run test
npm run test:watch
npm run test:coverage

# Mobile (Capacitor / Android)
npm run cap:sync
npm run cap:copy
npm run cap:open:android
npm run cap:build:apk
```

## Repository Structure

```text
src/
  app/                 # App-level routes, boundaries, global shells
  features/            # Domain modules (vertical slices)
  shared/              # Shared context, components, hooks, pages
  platform/            # Mobile/runtime platform integrations
  services/            # Cross-cutting services
  integrations/        # External API and client integrations
  components/          # Legacy/shared UI kept during transition
  utils/, lib/, types/ # Utilities, helpers, and shared types
```

Feature domains currently include:
`admin`, `analytics`, `approval`, `archive`, `audit`, `auth`, `budget`, `calendar`, `calls`, `chat`, `classification`, `coordinator`, `costApproval`, `dashboard`, `documents`, `downPayment`, `finance`, `location`, `mmp`, `notifications`, `project`, `reports`, `roleManagement`, `settings`, `siteVisit`, `user`, `wallet`.

## Routing and App Composition

- Main route definitions are in `src/App.tsx`
- Most pages are lazy-loaded for bundle splitting
- Global providers include:
  - Theme
  - Query client
  - Navigation and app contexts
  - Notification context
  - Activity tracking and live dashboard contexts
- Authentication guard wraps protected routes

## Documentation Index

Start here for role-specific deep dives:

- `docs/ARCHITECTURE.md` - system architecture and module boundaries
- `docs/DEVELOPER_HANDBOOK.md` - onboarding, standards, workflows, testing
- `docs/STAKEHOLDER_OVERVIEW.md` - business capabilities, KPIs, release view
- `docs/README.md` - legacy and specialized guides archive/index

## Deployment

- CI/CD workflow exists in `.github/workflows/deploy.yml`
- Build output is generated into `dist/`
- Deployment strategy should align with your environment (VPS/static hosting/mobile release)

## Security Notes

- Never commit secrets in code or workflow files
- Keep deployment credentials in secure secret stores (e.g., GitHub Actions Secrets)
- Review Supabase RLS, access policies, and role boundaries before production changes

## Contributing

1. Create feature branch
2. Keep changes scoped by feature module
3. Run lint, typecheck, tests, and build before PR
4. Prefer `@/` imports and feature-local ownership
5. Update docs for behavior or workflow changes

## Maintainers

PACT engineering and operations teams.

# Developer Handbook

## Purpose

This handbook helps engineers onboard quickly, implement changes safely, and ship consistent, high-quality releases in PACT.

## 1) Local Setup

### Requirements

- Node.js 20+
- npm 10+
- Git
- (Optional) Android Studio for Capacitor Android work

### Install and Start

```bash
npm install
npm run dev
```

### Validate Before Committing

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

## 2) Source Layout

Primary code organization:

- `src/features/*` - domain modules (preferred location for feature code)
- `src/shared/*` - shared UI/context/hooks for multiple domains
- `src/app/*` - app shell concerns (routes, boundaries, not-found)
- `src/platform/*` - mobile/platform-specific implementation
- `src/integrations/*` - external system clients/config
- `src/services/*` - cross-cutting orchestration logic

## 3) Coding Standards

- Prefer feature-local ownership over global utility placement
- Use `@/` alias imports instead of long relative paths
- Keep components small; move business logic to hooks/services
- Avoid silent side effects in render paths
- Add narrow, meaningful comments only when logic is non-obvious

## 4) Feature Development Workflow

1. Identify owning feature domain
2. Add/update screen/component inside that feature
3. Add/update hooks/context/repository in the same feature when possible
4. Register or update route in `src/App.tsx` only if needed
5. Add tests for critical logic and role-sensitive flows
6. Update documentation and changelog notes

## 5) Routing and Auth

- Routes are centralized in `src/App.tsx`
- Public vs protected routes are enforced by app-level guards
- Any new protected page must be validated for:
  - unauthenticated redirect behavior
  - role visibility
  - navigation discoverability

## 6) Data and API Integration

- Supabase integration is centralized under `src/integrations/supabase/*`
- Use query/repository patterns in feature modules for clarity
- Keep network schema assumptions explicit and typed
- Favor typed return values and stable query keys

## 7) Testing Strategy

### Unit and Component

- Use Vitest + Testing Library
- Target reducers/hooks/domain helpers and role-sensitive UI states

### Integration-Level Checks

- Core route navigation
- Protected route behavior
- Key submission/approval workflows
- Notifications and side effects

### Build-Time Checks

- `npx tsc --noEmit` for type safety
- `npm run build` for module resolution and production bundling safety

## 8) Mobile and Platform Notes

- Mobile runtime is initialized in `src/main.tsx`
- Capacitor sync/copy/open scripts are available in `package.json`
- Crashlytics initialization is performed during app bootstrap
- Validate mobile permissions and platform behavior for device-specific changes

## 9) CI/CD and Deploy

- Deployment workflow exists in `.github/workflows/deploy.yml`
- Production deploy currently rebuilds on target host
- For secure CI:
  - use repository secrets for keys/tokens
  - avoid embedding credentials in tracked files

## 10) Documentation Requirements

For every significant PR, update at least one of:
- `README.md` (if onboarding, run commands, or architecture changes)
- `docs/ARCHITECTURE.md` (if boundaries/system design change)
- feature-specific guides in `docs/` (if workflow behavior changes)

## 11) Troubleshooting

### Build passes locally but route fails in app

- Verify route path and lazy import path in `src/App.tsx`
- Confirm moved files were updated to `@/` imports

### TypeScript passes but Vite build fails

- Check unresolved import paths and dynamic import strings
- Validate file rename/move consistency after refactors

### Unexpected auth redirect

- Verify route is allowed in public paths list
- Confirm `authReady` and current user hydration behavior

## 12) Definition of Done

A feature/task is done when:
- behavior works for intended roles
- lint, typecheck, tests, and build pass
- no obvious regressions in route guards/navigation
- documentation is updated
- rollout risks are called out in PR notes

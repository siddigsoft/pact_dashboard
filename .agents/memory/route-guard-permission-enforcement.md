---
name: Route Guard & Button Permission Enforcement
description: How the universal PageRouteGuard works and the pattern for button-level Security Panel control
---

# Universal Route Guard (PageRouteGuard)

**Location:** `src/App.tsx` — `PageRouteGuard` + `PageRouteGuardAsync` components  
**Placed:** wraps entire protected route group (one line in AppRoutes)

**Two enforcement layers:**
1. Sync: `canSeePage(slug, role)` against PAGE_DEFS — instant, no DB
2. Async: `canSeePageWithOverrides(slug, role, userId)` — checks `page_access_overrides` table

**Slug resolution:** `resolveSlug(pathname)` in `src/lib/page-roles.ts` walks progressively shorter prefix paths to handle dynamic routes like `/mmp/abc123/edit` → slug `mmp`.

**SuperAdmin bypass:** `isSuperAdmin()` skips both layers.

**Fail-open:** unknown paths (no PAGE_DEFS entry) are allowed through so new pages don't break the app.

# Button-Level Permission Pattern

**Safe AND pattern** (preserves existing business logic, adds Security Panel REVOKE):
```tsx
const canApprove = (roleCheck) && checkPermission('resource', 'action');
```

**Pure checkPermission** (full Security Panel control, both GRANT and REVOKE):
```tsx
const canRead = checkPermission('mmp', 'read');
```
Only safe when DEFAULT_ROLE_PERMISSIONS correctly maps all intended roles.

**Why:** `checkPermission` reads from: user_permission_overrides → permissions table (Security Panel toggles) → DEFAULT_ROLE_PERMISSIONS fallback. Without `checkPermission`, Security Panel toggles have no effect on buttons.

# New Page Checklist
1. Add to PAGE_DEFS (PageAccessControl.tsx) → route guard + sidebar auto-enforced
2. Add to MODULE_REGISTRY (moduleRegistry.ts) → Security Panel shows actions  
3. Use `checkPermission('resource','action')` on buttons → Security Panel controls them

# Known Gaps (future work)
- FinanceHub sub-panels (Budget, FinancialOps, WalletReports etc.) — no checkPermission on buttons
- HRHub — uses isSuperAdmin/hasAnyRole, not checkPermission
- AdminHub — no checkPermission on user management buttons
- CostSubmission — uses non-standard `cs()` action names (mark_paid, revert_paid) that don't match MODULE_REGISTRY's standard action types — these bypass Security Panel toggles

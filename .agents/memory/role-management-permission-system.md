---
name: Role Management & Permission System
description: Architecture decisions, known gaps, and wiring patterns for the role/permission system
---

## System Architecture (3 layers)
1. `DEFAULT_ROLE_PERMISSIONS` in `src/types/roles.ts` — static defaults per role for 34 resources
2. `user_permission_overrides` Supabase table — per-user grant/block overrides on top of role defaults
3. `page_access_overrides` Supabase table — per-user page visibility overrides

## Key constraint: `checkPermission()` must be used for overrides to work
Pages that use raw role checks (`currentUser.role === 'admin'`) BYPASS the override system.
Only pages that call `checkPermission(resource, action)` from `useAuthorization()` will respect per-user overrides.

CostSubmission.tsx already uses per-user overrides for `mark_paid`, `revert_paid`, `reconcile`, `send_to_finance`, `recall` via `hasMarkPaidOverride` etc. (loaded from `user_permission_overrides` table directly). Tier approval checks still use raw role checks.

## isSuperAdmin bug (FIXED)
Old: RoleManagement.tsx line 53 had `currentUser.role === 'admin'` in isSuperAdmin logic — Admin got SA tab access.
Fix: `isSuperAdmin = isSuperAdminFn()` from `useAuthorization()` hook only. `isSuperAdminFn()` checks normalizeRole === 'superAdmin', never 'admin'.

**Why:** Admin and SuperAdmin are different access levels. Admin should not see Super Admin-only tabs.

## ResourceType coverage
34 resources as of this build. All exported from `src/types/roles.ts` as RESOURCE_LABELS.
Missing before: hr, payroll, leave, surveys, tasks, notifications, broadcast, whatsapp, calendar, signatures, integrations, transactions, accounting, down_payments, cost_submissions, portfolio, analytics, safety, incidents, equipment, coverage_map.

## useAuthorization helpers
`src/hooks/use-authorization.ts` exports 20+ semantic helpers (canSubmitCostRequest, canApproveLeave, etc.) that combine `checkPermission()` with role fallbacks. These are the recommended way to gate features — they check BOTH role defaults AND DB overrides.

## ROLE_HAS_PERM in UserPermissionOverrides.tsx
Pre-existing function uses `normalizeRole()` which returns camelCase ('admin') but DEFAULT_ROLE_PERMISSIONS keys are PascalCase ('Admin'). May always return false for role baseline display. Don't modify without fixing the case mismatch too.

## Page Access vs Permission Overrides — two separate systems
- `page_access_overrides` → which pages a user can visit (controlled by Manage Access modal + new Page Access tab)
- `user_permission_overrides` → which actions a user can take within pages (User Permission Overrides tab, SA only)
These are separate tables and do NOT sync to each other.

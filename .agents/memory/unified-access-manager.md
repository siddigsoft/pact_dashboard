---
name: unified-access-manager
description: Architecture of the Unified Access Manager — how access dimensions are wired, stored, and enforced
---

# Unified Access Manager Architecture

## Overview
Replaces the old SecurityPanel tab in RoleManagement.tsx with a 5-tab system for managing every dimension of access per user.

## Access dimensions
| Dimension | Table | Slug format |
|---|---|---|
| Page access | `page_access_overrides` | plain slug e.g. `admin-hub` |
| Tab access | `page_access_overrides` | `{hubSlug}:{tabId}` e.g. `admin-hub:users` |
| Action permissions | `user_permission_overrides` | — |
| Column visibility | `column_visibility_config` | — |
| Data scope | `data_scope_config` | — |

**Why tab access uses the same table:** avoids a new table; slugs with `:` are unambiguously tabs.

## Hub tab slug naming convention
- AdminHub: `admin-hub:{tabId}` (e.g. `admin-hub:role-management`)
- SuperAdminHub: `super-admin-hub:{tabId}`
- FinanceHub: `finance-hub:{tabId}`
- HRHub: `hr-hub:{tabId}`
- Tab IDs match the `id` fields in each hub's local SECTIONS constant (not from hub-tab-defs.ts)

## Data flow
- `CurrentUserAccessContext` — global provider (inside `CompositeContextProvider` in AppProviders) that caches the logged-in user's page_access_overrides; exposes `isTabBlocked(slug)` for hub filtering
- `SelectedUserAccessProvider` — scoped provider inside UnifiedAccessManager that loads all 4 override tables for the selected (target) user; all 5 tab components read from this via `useSelectedUserAccess()`
- Both providers load on mount and re-load when user changes

## Hub tab filtering (live enforcement)
AdminHub and SuperAdminHub both:
1. Call `useCurrentUserAccess()` to get `isTabBlocked`
2. Compute `visibleSections` via `useMemo` filtering out blocked tabs from SECTIONS
3. Compute `visibleAllTabs` from `visibleSections`
4. Resolve `activeTab` from `visibleAllTabs` (falls back to first visible tab)
5. Pass `visibleSections` to HubLayout (or use it in custom JSX)

FinanceHub and HRHub NOT YET updated — need the same pattern applied.

## Migration status
`column_visibility_config` and `data_scope_config` tables exist in migration file `20260811_access_management_tables.sql` but must be run manually in Supabase Studio. Column visibility and data scope UI is built; query-level enforcement is not yet implemented in individual components.

## Component locations
- `src/components/role-management/UnifiedAccessManager.tsx` — main assembler
- `src/components/role-management/unified/` — OverviewTab, PageAccessTab, TabAccessTab, PermissionsTab, DataScopeTab, types.ts
- `src/context/role-management/SelectedUserAccessContext.tsx` — data provider for selected user
- `src/context/CurrentUserAccessContext.tsx` — live access cache for logged-in user
- `src/lib/hub-tab-defs.ts` — registry of hub slugs and their tab IDs
- `src/lib/column-registry.ts` — defines sensitive columns per page

**Why:** previous SecurityPanel was read-heavy but had confusing UX and no tab access or column visibility controls. Unified system adds all dimensions in one consistent interface with role defaults + per-user overrides pattern (Option C).

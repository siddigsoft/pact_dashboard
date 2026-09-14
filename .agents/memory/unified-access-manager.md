---
name: unified-access-manager
description: Architecture of the Unified Access Manager — how access dimensions are wired, stored, and enforced
---

# Unified Access Manager Architecture

## Overview
Role Management is the single inline access-control surface. Keep roles, pages, tabs, buttons/actions, reports, columns, data scope, and overrides separated so administrators can distinguish each access layer.

## Access dimensions
| Dimension | Table | Slug format |
|---|---|---|
| Page access | `page_access_overrides` | plain slug e.g. `admin-hub` |
| Tab access | `page_access_overrides` | `{hubSlug}:{tabId}` e.g. `admin-hub:users` |
| Action permissions | `user_permission_overrides` | — |
| Report permissions | `user_permission_overrides` | existing resource/action pairs such as `mmp:export` |
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
- `SelectedUserAccessProvider` — scoped provider inside UnifiedAccessManager that loads override data for the selected target user; all access tabs read from this via `useSelectedUserAccess()`
- Both providers load on mount and re-load when user changes

## Hub tab filtering (live enforcement)
AdminHub and SuperAdminHub both:
1. Call `useCurrentUserAccess()` to get `isTabBlocked`
2. Compute `visibleSections` via `useMemo` filtering out blocked tabs from SECTIONS
3. Compute `visibleAllTabs` from `visibleSections`
4. Resolve `activeTab` from `visibleAllTabs` (falls back to first visible tab)
5. Pass `visibleSections` to HubLayout (or use it in custom JSX)

FinanceHub and HRHub require the same live-filtering pattern whenever their tab controls are exposed.

## Reports
Page access controls entry to the report area; a report action controls opening/exporting the report itself. MMP Full, State, and Hub reports use `mmp:export` in addition to the `mmp-full-report` page gate.

**Why:** page access and report-button access are separate decisions. A user may enter MMP Management without being allowed to open or export sensitive reports.

## Migration status
`column_visibility_config` and `data_scope_config` tables exist in migration file `20260811_access_management_tables.sql` but must be run manually in Supabase Studio. Column visibility and data scope UI is built; query-level enforcement is not yet implemented in individual components.

## Component locations
- `src/components/role-management/UnifiedAccessManager.tsx` — main assembler
- `src/components/role-management/unified/` — OverviewTab, PageAccessTab, TabAccessTab, PermissionsTab, DataScopeTab, types.ts
- `src/context/role-management/SelectedUserAccessContext.tsx` — data provider for selected user
- `src/context/CurrentUserAccessContext.tsx` — live access cache for logged-in user
- `src/lib/hub-tab-defs.ts` — registry of hub slugs and their tab IDs
- `src/lib/column-registry.ts` — defines sensitive columns per page

**Why:** separate modal and nested controls made it unclear where to manage a page, tab, button, report, or column. The inline system keeps one consistent role-default plus per-user-override model.

**How to apply:** add new access controls to the correct existing dimension and registry. Do not create parallel permission tables or hide button/report controls inside unrelated tabs.

## User-facing page names
Access Control must display the same page names and destinations users see in the sidebar. Stored page slugs remain stable even when a sidebar label or destination is an alias.

**Why:** administrators assign access based on visible navigation names; internal registry names and legacy paths made it unclear which page a rule controlled.

**How to apply:** treat sidebar labels and destinations as the display authority, but never rename an existing permission slug or database override solely to change its presentation.

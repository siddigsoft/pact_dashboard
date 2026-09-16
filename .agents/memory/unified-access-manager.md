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
Page access controls entry to the report area; a report action controls opening/exporting the report itself. MMP Full, State, and Hub reports have separate permissions and server-authorized report scopes; never combine them behind `mmp:export`.

**Why:** page access and report-button access are separate decisions, and each MMP report exposes a different data scope. A user may enter MMP Management or use one report without receiving the other two.

Visible launch, export, download, and generate controls belong under Buttons & Actions. Reports contains access to report pages, dashboards, and report content rather than their clickable controls.

**Why:** administrators expect every UI button to be managed in one place, even when the button opens or downloads a report.

## Migration status
`column_visibility_config` and `data_scope_config` originate in the access-management migrations and must be applied manually in Supabase Studio. Cost Submission now has resource-specific, database-enforced scope; other resources still need their own query-level enforcement.

## Resource-specific Data Scope
Cost Submission scope is enforced by one shared database predicate used by RLS and every list/payment RPC. Policy replacement and arbitrary-user preview are restricted to the canonical Super Admin database helper and saved atomically.

**Why:** client filtering and permissive RPC fallbacks let direct reads disagree with the access editor; multi-request policy saves could also leave partial or stale scope.

**How to apply:** each new scoped resource needs one server predicate shared by RLS and RPCs, a fail-closed client path, and one transactional Super Admin-only policy replacement operation. User Role Default means inheritance, not a stored bypass row.

## Super Admin bypass
True Super Admins are unrestricted even when a user-level deny override exists. Enforce this before overrides and scope filters at every database or Edge Function authorization boundary, not only in the client.

**Why:** the UI correctly allowed Super Admin, but server-side report helpers still required permission rows and applied hub scope, causing an access-denied response.

**How to apply:** use the canonical current-user Super Admin predicate before checking deny overrides, role grants, or data scope. View As remains a client-only simulation and must not change the authenticated database identity.

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

Management-role naming has precedence over additional field roles. Super Admin, Admin, FOM, and other management users must see `MMP Management`; `My Sites Management` is only for field-role-only users.

**Why:** a Super Admin with an additional field role was incorrectly given the field-user sidebar alias even though the page and permissions remained managerial.

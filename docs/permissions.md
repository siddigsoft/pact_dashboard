# Authorization and Permissions Guide

## Overview
This app uses granular, resource/action-based permissions with a single admin bypass. Pages and sensitive UI controls are gated by specific permissions, and admin can access everything. This guide covers what each permission does, where it’s enforced, how to manage permissions, how to use them in code, and how to test and troubleshoot.

## Core Concepts
- Resources: Logical domains you protect (e.g., `mmp`, `site_visits`).
- Actions: What a user can do on a resource (e.g., `read`, `create`, `update`, `delete`, `approve`, `assign`, `archive`).
- Admin bypass: Admin users always pass authorization checks.
- Client enforcement: Sidebar items are hidden, page routes guarded, and buttons/controls are shown only with permission.
- Server enforcement: Mirror rules in your backend (e.g., Supabase RLS) for real security.

## Resources
- users: User and field team management
- roles: Role definitions
- permissions: Role permission records
- projects: Project-related artifacts
- mmp: Monthly Monitoring Plans (files, verification, approvals)
- site_visits: Site visit listings, creation, visibility
- finances: Financial reads, updates, approvals
- reports: Reporting, Data Visibility
- settings: System settings

## Actions
- create: Create a new entity under a resource
- read: View a resource or page
- update: Modify or edit an entity
- delete: Remove an entity
- approve: Approve/verify workflows for a resource
- assign: Assign tasks (for future flows)
- archive: Move entity to archived state (restricted to read-only afterwards)

## Admin Bypass
- Admin role has a full bypass for all resources and actions.
- In code: `hasAnyRole(['admin'])` passes all checks.

---

## Permission-to-Feature Mapping

### Sidebar Visibility (menu items)
A menu item shows only if the user has the listed permission (or admin):
- Field Team → `users:read`
- Archive → `reports:read`
- Monitoring Plan → `mmp:read`
- Site Visits → `site_visits:read`
- Data Visibility → `reports:read`
- Reports → `reports:read`
- Role Management → internal `canManageRoles()` or admin
- Settings → `settings:read`

### Page-Level Gating (routes)
- Field Team page → `users:read`
- Archive page → `reports:read`
- Monitoring Plan page → `mmp:read`
- Site Visits page → `site_visits:read`
- Data Visibility page → `reports:read`
- Reports page → `reports:read`
- MMP list/management page → `mmp:read`
- MMP Upload page → `mmp:create`
- MMP Verification pages (basic & detailed) → `mmp:approve`

### MMP Capabilities
- View MMP list/details → `mmp:read`
- Upload MMP → `mmp:create`
- Edit MMP → `mmp:update`
- Delete MMP → `mmp:delete`
- Archive MMP → `mmp:archive`
- Verify/Approve MMP → `mmp:approve`
- View-only role (MMP): grant only `mmp:read`.

### Site Visits Capabilities
- View site visits → `site_visits:read`
- Create site visit → `site_visits:create`
- Edit site visit → `site_visits:update`
- Delete site visit → `site_visits:delete`

### Reports & Data Visibility
- View Reports & Data Visibility → `reports:read`
- Create/Export reports (optional) → `reports:create`

### Roles / Permissions / Settings
- Role Management visibility → `canManageRoles()` or admin
- Settings page → `settings:read` (updates usually `settings:update`)

---

## Managing Permissions in the UI
1. Go to Role Management and select a role.
2. Each resource lists action chips (e.g., for MMP: Create, View, Edit, Delete, Approve, Assign, Archive).
3. Toggle chips to grant or revoke; click Save.
4. If you don’t see “Archive MMP,” rebuild/redeploy to ensure the UI is using the latest ACTIONS set.

Typical configurations:
- View-only MMP: `mmp:read` only.
- Uploader: `mmp:read`, `mmp:create`.
- Editor: `mmp:read`, `mmp:update`.
- Deleter: `mmp:read`, `mmp:delete`.
- Verifier/Approver: `mmp:read`, `mmp:approve`.
- Archivist: `mmp:read`, `mmp:archive`.

---

## Using Permissions in Code

### Hook
Use `useAuthorization()`:
- `checkPermission(resource, action): boolean`
- `hasAnyRole(['admin']): boolean`

### Button/Control Gating (example)
```tsx
const { checkPermission, hasAnyRole } = useAuthorization();
const isAdmin = hasAnyRole(['admin']);
const canCreate = checkPermission('mmp', 'create') || isAdmin;

{canCreate && (
  <Button onClick={() => navigate('/mmp/upload')}>Upload MMP</Button>
)}
```

### Page-Level Guard (example)
```tsx
const { checkPermission, hasAnyRole } = useAuthorization();
const isAdmin = hasAnyRole(['admin']);
const canRead = checkPermission('mmp', 'read') || isAdmin;

if (!canRead) {
  return (
    <AccessDeniedCard
      title="Access Denied"
      message="You don't have permission to access this page."
      backTo="/dashboard"
    />
  );
}
```

---

## Testing Scenarios
- MMP View-only: `mmp:read` only → Can view lists/details; upload/edit/delete/archive/approve hidden and blocked.
- MMP Uploader: `mmp:read`, `mmp:create` → Upload enabled; other modifications blocked.
- MMP Verifier: `mmp:read`, `mmp:approve` → Verification pages and approve controls available.
- MMP Archivist: `mmp:read`, `mmp:archive` → Archive control available.
- Site Visits Creator: `site_visits:read`, `site_visits:create` → Create button visible.
- Reports Viewer: `reports:read` → Data Visibility and Reports visible.
- Admin: Everything available by bypass.

---

## Troubleshooting
- Missing “Archive” action in Role Management:
  - Ensure app is rebuilt/redeployed after adding `archive` to ACTIONS.
- A button shows for an unauthorized user:
  - Confirm the component uses `checkPermission` and hides when unauthorized.
- User can’t access a page despite being granted:
  - Verify resource/action pair matches the guard (e.g., Monitoring Plan uses `mmp:read`).
- Remember client-side guards are not security boundaries; enforce the same rules server-side (e.g., Supabase RLS).

---

## Extending the System
- Add a new action (e.g., `verify`):
  1. Update `ActionType` and `ACTIONS` in `src/types/roles.ts`.
  2. The PermissionManager renders new actions automatically via ACTIONS.
  3. Gate UI with `checkPermission('resource','newAction')`.
  4. Rebuild/redeploy.
- Add a new resource:
  1. Update `ResourceType` and `RESOURCES` in `src/types/roles.ts`.
  2. Add UI/route guards and sidebar visibility for the resource.
  3. Rebuild/redeploy.

---

## Quick Reference
- View-only MMP: `mmp:read`
- Upload: `mmp:create`
- Edit: `mmp:update`
- Delete: `mmp:delete`
- Archive: `mmp:archive`
- Verify/Approve: `mmp:approve`
- Site Visits: `site_visits:read` (+ `create`/`update`/`delete` as needed)
- Reports/Data Visibility: `reports:read`

---

Last Updated: 2025-11-01

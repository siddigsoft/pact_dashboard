---
name: Profile role vs user_roles permission gap
description: hasPermission only checks user_roles table, not profiles.role — fix is profileRolesCache populated in refreshUserPermissions
---

## The Rule
`hasPermission` and the Permission Tester must check BOTH the `user_roles` table AND the `profiles.role` column when falling back to `DEFAULT_ROLE_PERMISSIONS`. The Supabase `get_user_permissions` RPC only reads `user_roles`, so a user with `role='admin'` in profiles but `dataCollector` in user_roles will show 0/11 granted in the tester and be denied in `hasPermission`.

**Why:** The system has two sources of truth for a user's role:
1. `profiles.role` — the "primary" role set during user creation/edit
2. `user_roles` — the custom-role assignment table used by the Role Management UI

They can diverge. `get_user_permissions` (Supabase RPC, security definer, no migration file) only joins `user_roles`. If a user's profile role is not also in `user_roles`, their permissions are silently understated.

**How to apply:**
- `refreshUserPermissions` in RoleManagementContext now fetches `profiles.role` and stores it in `profileRolesCache[userId]`
- `hasPermission` step 5: checks `DEFAULT_ROLE_PERMISSIONS` for `profileRolesCache[userId]` after the `user_roles` fallback
- PermissionTester `resolveSource`: 6th param `profileRole` (= `selectedUser.role`) enables a `'profile-role'` source (purple badge) as the final fallback
- Any future change to the permission resolution chain must keep these two sources in sync

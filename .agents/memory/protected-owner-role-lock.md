---
name: Protected owner role lock
description: The protect_owner_profile DB trigger silently reverts the ENTIRE profiles row when role changes — never include role in update payload for the owner.
---

## The rule
`UserContext.tsx` must always override `currentUser.role` to `'superAdmin'` when `isProtectedOwner(userId)` is true — at 3 points: localStorage restore, login path 1, login path 2.

**Why:** A DB trigger `protect_owner_profile()` fires on any UPDATE where `NEW.role != OLD.role` for `PROTECTED_OWNER_ID`. It does NOT raise an exception — it silently reverts the **entire row** back to OLD values (including `full_name`, `phone`, etc.), returns no error. This causes "User updated" toast to appear (local cache updated) but all profile changes are lost on next login when the DB is re-loaded.

**How to apply:**
- Any time you rebuild/refactor UserContext, ensure these 3 role-override lines stay:
  - `useState` init: `role: isProtectedOwner(parsedUser.id) ? 'superAdmin' : (parsedUser.role || 'dataCollector')`
  - Login path 1 (re-auth): `role: isProtectedOwner(authUser.id) ? 'superAdmin' : ((userProfile as any).role || userRole)`
  - Login path 2 (sign-in): `role: isProtectedOwner(authData.user.id) ? 'superAdmin' : (userProfile.role || userRole)`
- In `updateUser`: NEVER include `role` in the DB update payload for the protected owner. Use `if (!isProtectedOwner(updatedUser.id)) updatePayload.role = updatedUser.role`.
- Same for the RPC fallback: pass `new_role: isProtectedOwner(updatedUser.id) ? null : updatedUser.role`.

## Stale user_roles issue (other users e.g. Ibrahim)
- Root cause: `user_roles` has UNIQUE constraint on `user_id` (one row per user). After permissions change the row may still say `dataCollector`.
- Fix: `UPDATE user_roles ur SET role = p.role FROM profiles p WHERE ur.user_id = p.id AND ur.role = 'dataCollector' AND lower(p.role) NOT IN ('datacollector','data_collector');`
- After DB fix, affected users must **log out and back in** — session is cached from login time.
- Do NOT use DELETE + INSERT — unique constraint on user_id causes duplicate key error.

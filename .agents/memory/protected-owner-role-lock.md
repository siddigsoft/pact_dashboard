---
name: Protected owner role lock
description: The protect_owner_profile DB trigger permanently blocks profiles.role updates for PROTECTED_OWNER_ID — fix must be in code, not DB.
---

## The rule
`UserContext.tsx` must always override `currentUser.role` to `'superAdmin'` when `isProtectedOwner(userId)` is true — at 3 points: localStorage restore, login path 1, login path 2.

**Why:** A DB trigger `protect_owner_profile()` blocks any UPDATE to `profiles.role` for `PROTECTED_OWNER_ID = 'eeaf10a4-84ad-42d7-8042-ab0a42e69e5b'`. Even `SET session_replication_role = 'replica'` and `ALTER TABLE DISABLE TRIGGER` fail from the Supabase SQL Editor. The only bypass is `CREATE OR REPLACE FUNCTION protect_owner_profile() ... BEGIN RETURN NEW; END` (no-op), but this is risky and temporary.

**How to apply:** Any time you rebuild/refactor UserContext, ensure these 3 lines stay:
- `useState` init: `role: isProtectedOwner(parsedUser.id) ? 'superAdmin' : (parsedUser.role || 'dataCollector')`
- Login path 1 (re-auth): `role: isProtectedOwner(authUser.id) ? 'superAdmin' : ((userProfile as any).role || userRole)`
- Login path 2 (sign-in): `role: isProtectedOwner(authData.user.id) ? 'superAdmin' : (userProfile.role || userRole)`

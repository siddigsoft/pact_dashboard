# Own User Profile Access — Design

**Date:** 2026-09-21  
**Status:** Approved for planning  
**Decision:** Option A + Approach 1 — every signed-in user may open their own `/users/:id` without User Management access.

## Problem

`/users/:id` resolves to the **User Management** (`users`) page slug. `PageRouteGuard` denies anyone without that grant before `UserDetail` mounts.

`UserDetail` already allows own-profile viewing (and restricted own edits), and the navbar links to `/users/{currentUser.id}`. Non-admin roles (Supervisor, Coordinator, Field Assistant, etc.) therefore hit **Access Restricted** on their own profile.

## Goals

- Any authenticated user can open `/users/{theirOwnId}`.
- User Management directory (`/users`) remains role/override gated.
- Other users’ profiles remain gated (User Management grant, or existing `UserDetail` view-all roles after the guard allows them through).
- No new Page Access Control toggle; own profile is a baseline right.
- An explicit block on the `users` page does **not** block own profile.
- No change to own-profile edit rules already implemented in `UserDetail`.

## Non-goals

- New “My Profile” page or slug.
- Redesigning `UserDetail` UI.
- Granting User Management (list or other profiles) to non-admin roles.
- Changing who may edit employment/HR fields beyond existing `isOwnProfile` / admin rules.

## Approach

Mirror the existing project membership exception:

- `isProjectMembershipDetailPath` + My Projects in `evaluateManifestRouteAccess`
- Here: `isOwnUserProfilePath` + match against `manifest.user_id`

### 1. Path helper (`src/lib/page-roles.ts`)

Add:

```ts
isOwnUserProfilePath(pathname: string, userId: string | null | undefined): boolean
```

- True only for `/users/:id` (optional trailing slash) where `:id` equals `userId`.
- False for `/users`, empty/missing `userId`, and any non-matching id.
- Do not treat static segments as ids (none today under `/users/` besides `:id`).

### 2. Manifest route evaluation (`src/lib/current-user-access.ts`)

In `evaluateManifestRouteAccess`, after the normal page check (and existing projects exception):

- If still denied, and `target.slug === 'users'`, and `isOwnUserProfilePath(pathname, manifest.user_id)`, set `allowed = true`.
- Own profile wins over an explicit `users` page block (baseline right).

### 3. View As path (`src/App.tsx` / `PageRouteGuard`)

Normal navigation uses the manifest path above.

View As still uses `canSeePageWithOverridesResult`. Apply the same own-profile exception so impersonation does not re-block `/users/{viewedUserId}` when that id is the View As subject (or, when role-only View As, the signed-in admin’s own id if that is what they open — prefer matching the effective viewed user id used by the guard).

Concrete rule for View As async guard:

- If slug is `users` and path id equals the guard’s effective `userId` (View As user mode subject, else current user), allow without requiring User Management.

### 4. `UserDetail` (no behavior change required)

Retain existing checks:

- Non-admin, non view-all → only own profile.
- Own-profile edit affordances unchanged.

The route guard change is what unblocks entry; page-level logic remains the second line of defense for other people’s profiles.

## Data / security notes

- Comparison is UUID string equality between path param and authenticated (or View As) user id.
- Fail closed: missing user id → no own-profile exception.
- Does not expose the `/users` catalogue or create a sidebar User Management entry for roles that lack it.
- RLS / API permissions for profile fields are unchanged; this is navigation authorization only.

## Tests

Add/extend unit tests in:

- `src/lib/__tests__/page-roles.test.ts` — `isOwnUserProfilePath` true/false cases
- `src/lib/__tests__/current-user-access.test.ts` — Supervisor (or other non-users role) with no `users` grant:
  - `/users/{manifest.user_id}` → allowed
  - `/users/{otherId}` → denied
  - `/users` → denied
  - explicit `users` page block still allows own profile path

## Rollout

- Frontend-only change; no migration.
- Verify with a Supervisor account: navbar profile → own page loads; paste another user’s UUID → still Access Restricted (or `UserDetail` own-only message if somehow past guard).

## Success criteria

1. Roles without User Management can open their own profile URL and navbar profile link.
2. Those roles still cannot open `/users` or another user’s profile via the route guard.
3. Existing admin / view-all profile access unchanged.
4. Unit tests above pass.

# Own User Profile Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every signed-in user open `/users/{theirId}` without User Management access, while keeping `/users` and other profiles gated.

**Architecture:** Add `isOwnUserProfilePath` beside the existing project-detail helper. Allow that path in `evaluateManifestRouteAccess` when the path id matches `manifest.user_id`. Apply the same exception in View As `PageRouteGuardAsync`.

**Tech Stack:** TypeScript, Vitest, React Router access guard in `App.tsx`

**Spec:** `docs/superpowers/specs/2026-09-21-own-user-profile-access-design.md`

## Global Constraints

- Own profile is a baseline right (wins over an explicit `users` page block).
- No new Page Access Control toggle or My Profile page.
- No `UserDetail` edit-rule changes.
- Fail closed when user id is missing.

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/page-roles.ts` | `isOwnUserProfilePath(pathname, userId)` |
| `src/lib/current-user-access.ts` | Own-profile exception in `evaluateManifestRouteAccess` |
| `src/App.tsx` | View As guard own-profile exception |
| `src/lib/__tests__/page-roles.test.ts` | Path helper tests |
| `src/lib/__tests__/current-user-access.test.ts` | Manifest route exception tests |

---

### Task 1: Path helper + tests

**Files:**
- Modify: `src/lib/page-roles.ts`
- Modify: `src/lib/__tests__/page-roles.test.ts`

**Interfaces:**
- Produces: `isOwnUserProfilePath(pathname: string, userId: string | null | undefined): boolean`

- [ ] **Step 1: Write failing tests** in `page-roles.test.ts` (import `isOwnUserProfilePath`):

```ts
it('recognizes own user profile paths only when the path id matches', () => {
  const id = '21602d5c-22ef-43e2-b178-606400d3b659';
  expect(isOwnUserProfilePath(`/users/${id}`, id)).toBe(true);
  expect(isOwnUserProfilePath(`/users/${id}/`, id)).toBe(true);
  expect(isOwnUserProfilePath(`/users/${id}`, 'other-id')).toBe(false);
  expect(isOwnUserProfilePath('/users', id)).toBe(false);
  expect(isOwnUserProfilePath(`/users/${id}`, null)).toBe(false);
  expect(isOwnUserProfilePath(`/users/${id}`, undefined)).toBe(false);
});
```

- [ ] **Step 2: Run test — expect FAIL** (export missing)

```bash
npx vitest run src/lib/__tests__/page-roles.test.ts -t "own user profile"
```

- [ ] **Step 3: Implement** after `isProjectMembershipDetailPath` in `page-roles.ts`:

```ts
/**
 * True for /users/:id when :id equals userId (own profile).
 * False for /users catalogue, missing userId, or a different user's id.
 */
export function isOwnUserProfilePath(
  pathname: string,
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  const cleanPath = splitLocation(pathname).pathname.replace(/\/$/, '') || '/';
  const match = cleanPath.match(/^\/users\/([^/]+)$/);
  return !!match && match[1] === userId;
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit** `feat: add isOwnUserProfilePath helper`

---

### Task 2: Manifest route exception + tests

**Files:**
- Modify: `src/lib/current-user-access.ts`
- Modify: `src/lib/__tests__/current-user-access.test.ts`

**Interfaces:**
- Consumes: `isOwnUserProfilePath` from `@/lib/page-roles`
- Produces: `evaluateManifestRouteAccess` allows own `/users/:id`

- [ ] **Step 1: Write failing tests** after the My Projects cases:

```ts
it('lets any role open their own user profile without User Management', () => {
  const ownId = '21602d5c-22ef-43e2-b178-606400d3b659';
  const otherId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const context = manifest({
    user_id: ownId,
    roles: ['Supervisor'],
    page_role_configs: {},
    page_overrides: {},
  });
  expect(evaluateManifestRouteAccess(context, `/users/${ownId}`)).toBe(true);
  expect(evaluateManifestRouteAccess(context, `/users/${otherId}`)).toBe(false);
  expect(evaluateManifestRouteAccess(context, '/users')).toBe(false);
});

it('keeps own profile reachable when User Management is explicitly blocked', () => {
  const ownId = '21602d5c-22ef-43e2-b178-606400d3b659';
  const context = manifest({
    user_id: ownId,
    roles: ['Supervisor'],
    page_overrides: { users: { is_blocked: true } },
  });
  expect(evaluateManifestRouteAccess(context, `/users/${ownId}`)).toBe(true);
  expect(evaluateManifestRouteAccess(context, '/users')).toBe(false);
});
```

- [ ] **Step 2: Run — expect FAIL** on own profile allowed cases

```bash
npx vitest run src/lib/__tests__/current-user-access.test.ts -t "own user profile"
```

- [ ] **Step 3: Implement** — import `isOwnUserProfilePath`; after projects exception:

```ts
if (
  !allowed &&
  target.slug === 'users' &&
  isOwnUserProfilePath(pathname, manifest.user_id)
) {
  allowed = true;
}
```

Update the function comment to mention own user profile.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit** `feat: allow own user profile without User Management`

---

### Task 3: View As guard exception

**Files:**
- Modify: `src/App.tsx` (`PageRouteGuardAsync` and optionally `PageRouteGuard`)

**Interfaces:**
- Consumes: `isOwnUserProfilePath`, `useLocation` (already in parent)

- [ ] **Step 1: Pass pathname into async guard** (or call `useLocation` inside `PageRouteGuardAsync`).

Minimal change inside `PageRouteGuardAsync` `useEffect` / status resolution:

```ts
const location = useLocation();
// ...
if (slug === 'users' && isOwnUserProfilePath(location.pathname, userId)) {
  setStatus('ok');
  return;
}
```

Import `isOwnUserProfilePath` from `./lib/page-roles` (or existing import path). Run effect deps must include `location.pathname`.

When `userId` is missing (role-only View As), own-profile exception does not apply (fail closed) unless product later passes `currentUser.id` — do **not** widen without spec change. Spec: match guard’s effective `userId` (View As user mode subject).

- [ ] **Step 2: Typecheck / tests still pass**

```bash
npx vitest run src/lib/__tests__/page-roles.test.ts src/lib/__tests__/current-user-access.test.ts
```

- [ ] **Step 3: Commit** `fix: allow own profile under View As page guard`

---

## Spec coverage

| Spec requirement | Task |
|------------------|------|
| `isOwnUserProfilePath` | 1 |
| Manifest own-profile allow | 2 |
| Own profile beats `users` block | 2 |
| `/users` and other id denied | 2 |
| View As exception | 3 |
| No UserDetail changes | (none) |

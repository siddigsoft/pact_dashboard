---
name: UserDetail profile loading pattern
description: How UserDetail loads profiles — two-effect split, context cache + DB fetch
---

# UserDetail Profile Loading Pattern

## The rule — TWO separate effects

**Effect 1** (`[id]` only): Fires on profile navigation. Checks context first; if found serves immediately and returns. If not found, fetches from Supabase directly.
**Effect 2** (`[id, users]`): Silently syncs the displayed user from context when `fetchUsers` completes or realtime updates arrive. Never touches `isLoadingUser`.

**Why:** Putting `users`, `editMode`, `toast`, `navigate` in Effect 1's deps caused it to re-run on every render tick. With multiple re-runs, `fallbackFetchingRef` could be set before the DB fetch completed, or the stale-result guard could fire prematurely, leaving `isLoadingUser = true` forever.

## How to apply
- `usersRef` and `editModeRef` are kept as live refs updated every render so Effect 1 can read current values without listing them as deps.
- Effect 1 uses `loadingForIdRef` (set to `id` at top) as a stale-result guard: discard async results if `loadingForIdRef.current !== targetId`.
- On context hit (fast-render path): return early — no DB fetch.
- On context miss (DB fetch path): do NOT call `navigate('/users')` on failure. Show `setLoadTimedOut(true)` so the user sees a Retry button instead of silently disappearing.
- Effect 2 guards on `!isLoadingUser` to avoid overwriting in-flight state.

## Previous bugs fixed
1. Separate navigation-reset effect set `user=null` async → stale-closure race.
2. `users`, `editMode`, `toast`, `navigate` in Effect 1 deps → spurious re-runs → fetch guard blocked the real DB fetch.
3. `navigate('/users')` in catch block → profile "disappeared" silently when DB fetch errored (e.g. column not found, network timeout).
4. "Always DB fetch even when cached" approach caused a DB fetch after the fast-render which then failed and navigated away.

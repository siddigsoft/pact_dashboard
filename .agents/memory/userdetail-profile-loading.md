---
name: UserDetail profile loading pattern
description: How UserDetail loads profiles — context cache + mandatory DB fetch on id change
---

# UserDetail Profile Loading Pattern

## The rule
On every `:id` change, **always fire a direct Supabase SELECT** for the profile, regardless of whether the context `users` array already has the user. The context is used only as a fast-first-render optimisation (show cached data immediately, no spinner), not as the sole data source.

**Why:** FOM and other non-field-staff users are occasionally missing from the context `users` array (stale localStorage, hub-scoping edge cases, or fetchUsers in-flight). If the DB fetch is gated on the context miss, those profiles spin forever.

## How to apply
- `loadingForIdRef` tracks the last id we fetched; reset it and start a fresh fetch whenever `id` changes.
- `fallbackFetchingRef` prevents concurrent fetches for the *same* id (e.g. from rapid `users` array updates).
- On id change: show cached context user immediately if available (`setIsLoadingUser(false)`) **and** still kick off the DB fetch to confirm/update the data.
- On same-id re-run (users changed): silently sync from context; skip DB fetch if one is already in-flight or if `idChanged === false`.
- Stale-result guard: `if (loadingForIdRef.current !== targetId) return` inside the async closure discards results if the user navigated away.

## Previous bugs fixed
1. Separate navigation-reset effect set `user=null` async → main effect saw stale `user` in closure → `if (user || fallbackFetchingRef) return` blocked fallback → infinite spinner. Fixed by merging into one effect.
2. DB fetch gated on context miss only → FOM (not in context) never loaded if something set `fallbackFetchingRef=true` prematurely. Fixed by always fetching on id change.
3. `if (user || fallbackFetchingRef.current) return` guard used stale `user` reference. Removed entirely.

# Runbook: Prevent Self-Deactivation Trigger

## Purpose

Adds a PostgreSQL trigger (`trg_prevent_self_deactivation`) that blocks any
authenticated user from setting their own profile's `is_active` column to
`false`.  This closes a server-side gap where the client-side UI guard (disabled
button) could be bypassed via a direct API call or browser console.

## When to apply

Apply once to your Supabase database (dev and production).

## How to apply

1. Open the Supabase Dashboard → **SQL Editor**.
2. Copy and paste the contents of
   `supabase/migrations/prevent_self_deactivation.sql`.
3. Click **Run**.
4. Verify the trigger was created:
   ```sql
   SELECT trigger_name, event_manipulation, action_timing
   FROM information_schema.triggers
   WHERE event_object_table = 'profiles'
     AND trigger_name = 'trg_prevent_self_deactivation';
   ```
   You should see one row.

## Behaviour

| Caller | `auth.uid()` | Result |
|--------|--------------|--------|
| Regular user session (JWT) | own UUID | `RAISE EXCEPTION` — deactivation blocked |
| Regular user session (JWT) | other user's UUID | allowed (admin deactivating another user) |
| Service-role key (no JWT) | NULL | allowed (internal/migration operations) |

## Rolling back

```sql
DROP TRIGGER IF EXISTS trg_prevent_self_deactivation ON public.profiles;
DROP FUNCTION IF EXISTS public.prevent_self_deactivation();
```

## Related changes

- `src/pages/Users.tsx` — `executeAction` now also checks for self-deactivation
  before calling Supabase, so the user sees a clear toast even if the trigger
  migration has not yet been applied.

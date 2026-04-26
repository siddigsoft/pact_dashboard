# Apply: `public_landing_kpis()` RPC for the public landing page

**Migration file:** `supabase/migrations/20260426_public_landing_kpis_rpc.sql`
**Task:** #53 — Show landing page KPI numbers to anonymous visitors too
**Standing rule:** SQL is applied **manually** in the pactdb Supabase SQL editor. NO `db:push`, NO Drizzle, NO Replit auto-push.

---

## Why

The landing page (`/`, `src/pages/Index.tsx`) is publicly reachable, but its KPI strip ("Live Sites", "Active Teams", "Tasks Completed", "Efficiency") was aggregating client-side over `mmp_site_entries` and `profiles`. Both tables are protected by RLS, so unauthenticated visitors saw `0 / 0 / 0 / 0%` — exactly the audience the strip is meant to impress.

This migration adds a SECURITY DEFINER RPC that returns only the four aggregated numbers and their 30-day trends, callable by the `anon` role. No row-level data, no PII — just counts and percentages.

---

## Step 1 — Apply the SQL

1. Open the pactdb Supabase project → **SQL Editor**.
2. Open a new query tab.
3. Paste the entire contents of `supabase/migrations/20260426_public_landing_kpis_rpc.sql`.
4. Run it. You should see `Success. No rows returned.` (or equivalent for both `BEGIN` and `COMMIT`).

---

## Step 2 — Verify (run as separate queries; not part of the migration tx)

```sql
-- 2a. Anonymous role can call it and gets a JSON object.
SET ROLE anon;
SELECT public.public_landing_kpis();
RESET ROLE;
-- Expected: { "live_sites": <int>, "active_teams": <int>, "tasks_completed": <int>,
--             "efficiency": <numeric>, "live_sites_trend": <int>,
--             "active_teams_trend": <int>, "tasks_completed_trend": <int>,
--             "efficiency_trend": <int> }
```

```sql
-- 2b. Authenticated role gets the same numbers (sanity vs the UI).
SET ROLE authenticated;
SELECT public.public_landing_kpis();
RESET ROLE;
```

```sql
-- 2c. PUBLIC was revoked (defense-in-depth).
SELECT has_function_privilege('public', 'public.public_landing_kpis()', 'EXECUTE');
-- Expected: false
```

```sql
-- 2d. anon + authenticated explicitly granted.
SELECT has_function_privilege('anon',          'public.public_landing_kpis()', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.public_landing_kpis()', 'EXECUTE');
-- Expected: true, true
```

---

## Step 3 — UI smoke test

1. Open the app in an **incognito / private window** (no Supabase session).
2. Land on `/`.
3. The KPI strip should show real numbers within ~1 second, not `0 / 0 / 0 / 0%`.
4. Open the same URL in your normal logged-in window — the numbers must match the incognito window exactly.

---

## Rollback (if ever needed)

```sql
BEGIN;
DROP FUNCTION IF EXISTS public.public_landing_kpis();
COMMIT;
```

The frontend will fall through to the catch block and the strip will show zeros — no crash, no broken layout.

---

## What's in the JSON

| Key | Type | Meaning |
|---|---|---|
| `live_sites` | int | MMP site entries currently in active workflow (dispatched / assigned / accepted / in progress / ongoing / started) |
| `active_teams` | int | Distinct profiles touched in the last 30 days |
| `tasks_completed` | int | MMP site entries in a terminal-success state (completed / verified / closed / cp-verified) |
| `efficiency` | numeric | `tasks_completed / total_entries × 100`, rounded to 1 decimal |
| `live_sites_trend` | int | % change in live count, last 30d vs prior 30d |
| `active_teams_trend` | int | Synthetic heuristic matching the original JS: `min(round(active_teams / 5), 50)` |
| `tasks_completed_trend` | int | % change in completed count, last 30d vs prior 30d |
| `efficiency_trend` | int | % change in windowed efficiency, last 30d vs prior 30d |

Status normalization (lowercase + strip whitespace/`_`/`-`) is identical to the previous JS aggregation in `Index.tsx`, so numbers don't shift when this RPC takes over.

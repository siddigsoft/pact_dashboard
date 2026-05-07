# PACT Accounting — Phase 5 Expansion · Manual Apply Runbook

## What this migration does

`supabase/migrations/20260502_acct_phase5_expansion.sql` (131 lines)

Extends the accounting module with grant tracking, cost allocation, depreciation
runs, and cash flow adjustment tables. All fully idempotent via `CREATE TABLE IF
NOT EXISTS` and `ON CONFLICT DO NOTHING`.

| Part | Table | Purpose |
|---|---|---|
| 1 | `acct_grants` | Grant registry — donor, award amount, dates, status, fund link |
| 1 | `acct_grant_expenses` | Individual expense lines linked to grants and GL journal lines |
| 2 | `acct_cost_allocation_rules` | Cost pool allocation rules (equal / budget\_pct / headcount basis) |
| 2 | `acct_allocation_runs` | Run log for cost allocation jobs |
| 3 | `acct_depreciation_runs` | Run log for depreciation batch jobs |
| 4 | `acct_cash_flow_adjustments` | Manual inflow/outflow adjustments for the cash flow forecast |
| 5 | 3 feature flags: `acct.grants.enabled` (true), `acct.cost_allocation.enabled` (false), `acct.depreciation_auto` (false) | |

> **Note:** These tables overlap with `hr_advances_grant_milestones.sql` which
> was applied as the Phase 3 prerequisite. Both files use `IF NOT EXISTS` so
> re-applying is safe — only the missing tables will be created.

---

## Prerequisites

- ✅ Phase 1 applied (provides `acct_journal_entries`, `acct_journal_lines`, `acct_funds`)
- ✅ Phase 3 pre-requisite (`hr_advances_grant_milestones.sql`) applied — most of these tables already exist

Since `hr_advances_grant_milestones.sql` was applied before Phase 3, most of
these tables will already exist in pactdb. This migration will skip existing
tables and only apply the gaps. **Safe to run.**

---

## Apply steps

1. Open **Supabase Dashboard → SQL Editor** for `abznugnirnlrqnnfkein`
2. Create a new query tab
3. Paste the **entire** content of `supabase/migrations/20260502_acct_phase5_expansion.sql`
4. Click **Run**

The last line returns:
```
Phase 5 migration complete — acct_grants, acct_grant_expenses, acct_cost_allocation_rules, acct_allocation_runs, acct_depreciation_runs, acct_cash_flow_adjustments
```

---

## Pre-flight checks

```sql
-- 1. Check which tables already exist (from hr_advances_grant_milestones.sql)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'acct_grants', 'acct_grant_expenses',
    'acct_cost_allocation_rules', 'acct_allocation_runs',
    'acct_depreciation_runs', 'acct_cash_flow_adjustments'
  )
ORDER BY table_name;
-- Expect 4–6 rows. Missing ones will be created by this migration.

-- 2. acct_funds present (grants FK)
SELECT count(*) FROM public.acct_funds;        -- must not error
```

---

## Smoke tests

```sql
-- 1. All 6 tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'acct_grants', 'acct_grant_expenses',
    'acct_cost_allocation_rules', 'acct_allocation_runs',
    'acct_depreciation_runs', 'acct_cash_flow_adjustments'
  )
ORDER BY table_name;   -- expect 6 rows

-- 2. Feature flags
SELECT key, is_enabled
FROM public.feature_flags
WHERE key IN (
  'acct.grants.enabled',
  'acct.cost_allocation.enabled',
  'acct.depreciation_auto'
)
ORDER BY key;          -- expect 3 rows; grants.enabled = true

-- 3. Insert a test grant and verify
INSERT INTO public.acct_grants (grant_name, donor_name, award_amount, currency, start_date, end_date)
VALUES ('TEST_GRANT_DELETE_ME', 'Test Donor', 100000, 'USD', current_date, current_date + 365);

SELECT id, grant_name, status FROM public.acct_grants
WHERE grant_name = 'TEST_GRANT_DELETE_ME';    -- expect 1 row

DELETE FROM public.acct_grants WHERE grant_name = 'TEST_GRANT_DELETE_ME';

-- 4. RLS policies
SELECT tablename, policyname
FROM pg_policies
WHERE tablename IN ('acct_grants', 'acct_grant_expenses', 'acct_cost_allocation_rules', 'acct_allocation_runs', 'acct_depreciation_runs', 'acct_cash_flow_adjustments')
ORDER BY tablename;     -- expect 2 policies per table (6 tables = up to 12 rows)
```

---

## After applying — re-run notifications file

Re-run `supabase/migrations/20260502_acct_accounting_notifications.sql` after
Phase 5 is applied so the grant expiry trigger (`acct_notify_grant_expiry`) is
bound to `acct_grants` if it was skipped earlier.

---

## Rollback

```sql
-- Drop all Phase 5 tables (cascade removes FK children)
DROP TABLE IF EXISTS public.acct_grant_expenses        CASCADE;
DROP TABLE IF EXISTS public.acct_grants                CASCADE;
DROP TABLE IF EXISTS public.acct_allocation_runs       CASCADE;
DROP TABLE IF EXISTS public.acct_cost_allocation_rules CASCADE;
DROP TABLE IF EXISTS public.acct_depreciation_runs     CASCADE;
DROP TABLE IF EXISTS public.acct_cash_flow_adjustments CASCADE;

-- Remove Phase 5 feature flags
DELETE FROM public.feature_flags
WHERE key IN (
  'acct.grants.enabled',
  'acct.cost_allocation.enabled',
  'acct.depreciation_auto'
);

SELECT 'Phase 5 rollback complete.' AS result;
```

> **Warning:** If Phase 4 GL bridge triggers are live, they may reference
> `acct_depreciation_runs` and `acct_allocation_runs`. Apply
> `PHASE4_GL_BRIDGES_ROLLBACK.sql` first, then this rollback.

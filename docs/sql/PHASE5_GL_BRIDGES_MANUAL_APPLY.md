# PACT Accounting — Phase 5 GL Bridges · Manual Apply Runbook

## What this migration does

`supabase/migrations/accounting_gl_bridges_phase5.sql`

Extends the GL Bridge Engine with grant and cash-flow visibility triggers plus
a grant utilization RPC.

| Part | What |
|---|---|
| B | `acct_trig_cash_flow_adj()` + trigger on `acct_cash_flow_adjustments` — optional journal post when a cash flow adjustment is created |
| C | `acct_trig_grant_status()` + trigger on `acct_grants` — logs bridge entry on every grant status change |
| D | `acct_trig_grant_milestone()` + trigger on `acct_grant_milestones` — logs bridge entry when milestone status → `accepted` |
| E | `acct_grant_utilization()` RPC — returns per-grant spend, utilization %, burn rate, days to expiry |
| F | `v_acct_phase5_coverage` view — health summary for Phase 5 bridge tables |
| G | Trigger bindings (all guarded with `to_regclass`) |
| H | 3 feature flags: `acct.bridge.cash_flow_adj` (false), `acct.bridge.grants` (true), `acct.bridge.milestones` (true) |

---

## Prerequisites

All must be applied first:

| # | File | Status |
|---|---|---|
| 1 | `20260501_acct_phase1_sprint1_1.sql` + seed | ✅ Applied |
| 2 | `20260520_acct_phase2_gl_bridges.sql` | ✅ Applied |
| 3 | `hr_advances_grant_milestones.sql` | ✅ Applied |
| 4 | `accounting_gl_bridges_phase3.sql` | ✅ Applied (adds `je_reference`/`je_description` to bridge log) |
| 5 | `20260520_acct_phase4_advanced.sql` | ⏳ Apply Phase 4 first |
| 6 | `accounting_gl_bridges_phase4.sql` | ⏳ Apply Phase 4 first |
| 7 | `20260502_acct_phase5_expansion.sql` | ⏳ Apply this file **before** Phase 5 bridges |

**Apply order within Phase 5:**
1. `20260502_acct_phase5_expansion.sql` → `docs/sql/PHASE5_EXPANSION_MANUAL_APPLY.md`
2. `accounting_gl_bridges_phase5.sql` ← **this file**

---

## Pre-flight checks

```sql
-- 1. Phase 4 bridge tables exist
SELECT count(*) FROM public.acct_gl_bridge_log;         -- must not error
SELECT column_name FROM information_schema.columns
WHERE table_name = 'acct_gl_bridge_log'
  AND column_name IN ('je_reference','je_description'); -- expect 2 rows

-- 2. Phase 5 expansion tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('acct_grants','acct_cash_flow_adjustments','acct_grant_milestones')
ORDER BY table_name;                                    -- expect 3 rows

-- 3. feature_flags table present
SELECT count(*) FROM public.feature_flags;             -- must not error
```

---

## Apply steps

1. Open **Supabase Dashboard → SQL Editor** for `abznugnirnlrqnnfkein`
2. Create a new query tab
3. Paste the **entire** content of `supabase/migrations/accounting_gl_bridges_phase5.sql`
4. Click **Run**

### Expected NOTICE messages

```
NOTICE:  acct_bridge_cash_flow_adj created on acct_cash_flow_adjustments.
NOTICE:  acct_bridge_grant_status created on acct_grants.
NOTICE:  acct_bridge_grant_milestone created on acct_grant_milestones.
```

Any `SKIP:` notice means the target table was absent — apply the prerequisite migration then re-run this file.

---

## Smoke tests

```sql
-- 1. Trigger functions exist
SELECT proname FROM pg_proc
WHERE proname IN (
  'acct_trig_cash_flow_adj',
  'acct_trig_grant_status',
  'acct_trig_grant_milestone',
  'acct_grant_utilization'
)
ORDER BY proname;  -- expect 4 rows

-- 2. Triggers registered
SELECT event_object_table, trigger_name
FROM information_schema.triggers
WHERE trigger_name IN (
  'acct_bridge_cash_flow_adj',
  'acct_bridge_grant_status',
  'acct_bridge_grant_milestone'
)
ORDER BY trigger_name;  -- expect 3 rows

-- 3. Grant utilization RPC works
SELECT * FROM public.acct_grant_utilization();
-- Returns rows if acct_grants has data; empty set is fine

-- 4. Phase 5 coverage view
SELECT * FROM public.v_acct_phase5_coverage;

-- 5. Feature flags
SELECT key, is_enabled FROM public.feature_flags
WHERE key IN (
  'acct.bridge.cash_flow_adj',
  'acct.bridge.grants',
  'acct.bridge.milestones'
)
ORDER BY key;  -- expect 3 rows
```

---

## Live integration tests

```sql
-- TEST 1: Grant status bridge — insert a grant, update its status, check log
INSERT INTO public.acct_grants
  (grant_name, donor_name, award_amount, currency, start_date, end_date)
VALUES ('TEST_BRIDGE_GRANT', 'Test Donor', 50000, 'USD', current_date, current_date + 180);

UPDATE public.acct_grants SET status = 'closed' WHERE grant_name = 'TEST_BRIDGE_GRANT';

SELECT source_table, event_type, status, je_description
FROM public.acct_gl_bridge_log
WHERE source_table = 'acct_grants'
ORDER BY created_at DESC LIMIT 1;
-- Expect: status='success', event_type='status_closed'

-- Clean up
DELETE FROM public.acct_grants WHERE grant_name = 'TEST_BRIDGE_GRANT';

-- TEST 2: Grant utilization RPC
SELECT grant_name, award_amount, total_spent, utilization_pct, remaining
FROM public.acct_grant_utilization()
LIMIT 5;
```

---

## Enabling the cash flow adjustment bridge

By default `acct.bridge.cash_flow_adj` is **disabled** because it needs a seeded
COA with accounts `1110` (Cash) and `4990` (Adjustment Clearing).

Once those accounts exist:
```sql
UPDATE public.feature_flags
SET is_enabled = true
WHERE key = 'acct.bridge.cash_flow_adj';
```

---

## Rollback

Apply `docs/sql/PHASE5_GL_BRIDGES_ROLLBACK.sql`.

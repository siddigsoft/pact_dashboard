# PACT Accounting — Phase 4 GL Bridge Extension · Manual Apply Runbook

## What this migration does

`supabase/migrations/accounting_gl_bridges_phase4.sql` (446 lines)

Adds five more GL bridge triggers focused on fixed assets, budget encumbrances,
and leave liability:

| Part | What | Source table | Journal | Default |
|---|---|---|---|---|
| C | Depreciation run visibility log | `acct_depreciation_runs` INSERT (status=completed) | Bridge log only (no new journal — the Depreciation Run page posts the journal) | **ON** |
| D | Cost allocation run visibility log | `acct_allocation_runs` INSERT (status=completed, journal set) | Bridge log cross-reference | **ON** |
| E | Budget encumbrance journal | `acct_budget_encumbrances` INSERT (status=open, amount>0) | DR [expense GL] / CR 2105 PO Encumbrance Reserve | **OFF** — enable after COA + GENERAL fund confirmed |
| F | Leave approval liability | `leave_requests` UPDATE (status→approved, days_count>0) | DR 6110 Management Benefits / CR 2240 Leave Payable (amount = base_salary ÷ 30 × days) | **OFF** — enable after payroll/EOSB data populated |
| G | `payroll_run_items.user_id` column guard | — | Schema patch — adds `user_id` generated column if `staff_id` exists instead | — |

Also adds:
- 4 new COA accounts: 1600 (Accumulated Depreciation), 2105 (PO Encumbrance Reserve),
  2240 (Leave Payable), 6400 (Depreciation Expense)
- 5 feature flags (C/D enabled; E/F disabled by default)

---

## Prerequisites

**All must be applied before Phase 4:**

1. ✅ Phase 1 (1.1 + 1.2 + 1.3) — GL engine
2. ✅ Phase 2 (`20260520_acct_phase2_gl_bridges.sql`) — bridge engine + P2P
3. ✅ Phase 3 (`accounting_gl_bridges_phase3.sql`) — HR/grant bridges + RPCs

Phase 4 has self-contained infrastructure guards (PART 0) so it applies safely
even without Phase 2/3, but the triggers will be non-functional.

---

## Pre-flight checks

```sql
-- 1. Phase 3 coverage view is present (confirms Phase 3 was applied)
SELECT count(*) FROM public.acct_gl_bridge_coverage;   -- must not error

-- 2. Source tables present
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'acct_depreciation_runs',
    'acct_allocation_runs',
    'leave_requests'
  )
ORDER BY table_name;     -- expect 3 rows

-- 3. acct_budget_encumbrances (from 20260520_acct_phase4_advanced.sql)
SELECT count(*) FROM public.acct_budget_encumbrances;  -- must not error (0 OK)

-- 4. Open fiscal period
SELECT id, name_en, status
FROM public.acct_fiscal_periods
WHERE status = 'open'
LIMIT 3;
```

---

## Apply steps

1. Open **Supabase Dashboard → SQL Editor** for `abznugnirnlrqnnfkein`
2. Create a new query tab
3. Paste the **entire** content of `supabase/migrations/accounting_gl_bridges_phase4.sql`
4. Click **Run** — no outer `BEGIN … COMMIT`; each statement auto-commits. Idempotent.

### Expected NOTICE messages (not errors)

```
NOTICE: acct_budget_encumbrances trigger created.
```
or if `acct_budget_encumbrances` is absent:
```
NOTICE: SKIP: acct_budget_encumbrances does not exist ...
```

---

## Smoke tests

```sql
-- 1. New COA accounts
SELECT code, name_en
FROM public.acct_accounts
WHERE code IN ('1600','2105','2240','6400')
ORDER BY code;                    -- expect 4 rows

-- 2. Feature flags
SELECT key, is_enabled
FROM public.feature_flags
WHERE key LIKE 'acct.bridge.acct_%' OR key LIKE 'acct.bridge.leave%'
ORDER BY key;
-- expect 5 rows:
--   acct.bridge.acct_allocation_runs     → true
--   acct.bridge.acct_budget_encumbrances → false
--   acct.bridge.acct_depreciation_runs   → true
--   acct.bridge.acct_fixed_assets        → true
--   acct.bridge.leave_requests           → false

-- 3. Triggers registered
SELECT tgname, relname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE tgname LIKE 'acct_bridge_%'
  AND relname IN ('acct_depreciation_runs','acct_allocation_runs',
                  'acct_budget_encumbrances','leave_requests')
ORDER BY tgname;                  -- expect 3-4 rows (budget_encumbrances only if table exists)

-- 4. Test depreciation-run bridge
INSERT INTO public.acct_depreciation_runs
  (period_label, total_depreciation, asset_count, status)
VALUES ('2026-05', 500.00, 3, 'completed');
SELECT source_table, event_type, status, error_message
FROM public.acct_gl_bridge_log
WHERE source_table = 'acct_depreciation_runs'
ORDER BY created_at DESC LIMIT 3;

-- 5. payroll_run_items user_id guard result
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'payroll_run_items'
  AND column_name  IN ('user_id', 'staff_id');
```

---

## Enabling the two disabled-by-default bridges

### Budget encumbrance bridge

Enable only after the GENERAL fund and COA are confirmed in pactdb:

```sql
UPDATE public.feature_flags
SET is_enabled = true
WHERE key = 'acct.bridge.acct_budget_encumbrances';
```

Test:
```sql
INSERT INTO public.acct_budget_encumbrances
  (source_type, source_id, amount, currency, status)
VALUES ('purchase_order', gen_random_uuid(), 1000, 'SDG', 'open');

SELECT * FROM public.acct_gl_bridge_log
WHERE source_table = 'acct_budget_encumbrances'
ORDER BY created_at DESC LIMIT 3;
```

### Leave liability bridge

Enable after payroll or EOSB data is populated (the trigger looks up base salary to
calculate the liability amount; without salary data it logs `skipped`):

```sql
UPDATE public.feature_flags
SET is_enabled = true
WHERE key = 'acct.bridge.leave_requests';
```

---

## Disabling any bridge

```sql
UPDATE public.feature_flags
SET is_enabled = false
WHERE key = 'acct.bridge.acct_depreciation_runs';  -- replace key as needed
```

---

## Rollback

Apply `docs/sql/PHASE4_GL_BRIDGES_ROLLBACK.sql`.
Posted journals are not affected.

---

## After apply — update STATUS_DASHBOARD.md

Change Phase 4 apply log to `✅ APPLIED <date>` in `docs/STATUS_DASHBOARD.md`.

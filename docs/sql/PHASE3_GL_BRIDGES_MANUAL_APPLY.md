# PACT Accounting — Phase 3 GL Bridge Extension · Manual Apply Runbook

## What this migration does

`supabase/migrations/accounting_gl_bridges_phase3.sql` (899 lines)

Extends the Phase 2 GL Bridge Engine with four new automatic journal triggers
and two utility RPCs:

| Part | What | Source table | Journal |
|---|---|---|---|
| D | EOSB monthly provision | `eosb_accruals` INSERT | DR 6200 EOSB Expense / CR 2350 EOSB Provision Liability |
| E | Salary advance disbursed | `hr_salary_advances` INSERT (status=active) | DR 1520 Advances Receivable / CR 1200 Cash |
| F | Salary advance recovery | `hr_salary_advance_recoveries` INSERT | DR 1200 Cash / CR 1520 Advances Receivable |
| G | Grant programme expense | `acct_grant_expenses` INSERT | DR 5600 Grant Expense / CR 2100 AP |
| J | Payroll → advance auto-recovery | `payroll_run_items` INSERT (salary_advance_deduction > 0) | (inserts hr_salary_advance_recoveries row; GL from trigger F) |
| H | Period close allocation RPC | `run_period_close_allocation(period_id)` | DR [target accts] / CR [pool acct] |
| I | GL bridge log RPC | `get_gl_bridge_log(...)` | Read-only enriched log view |
| L | Coverage matrix view | `acct_gl_bridge_coverage` | Operational health view |

Also adds:
- `profiles.hire_date` column (EOSB calculation)
- 4 new COA accounts: 1520, 2350, 5600, 6200
- 4 feature flags (`acct.bridge.eosb_accruals`, `acct.bridge.hr_salary_advances`,
  `acct.bridge.hr_salary_advance_recoveries`, `acct.bridge.acct_grant_expenses`)
- `acct_cost_allocation_rules.rule_name` alias column (back-filled from `pool_name`)
- `payroll_run_items.salary_advance_deduction` + `.salary_advance_ids` columns (guarded)

---

## Prerequisites

**All three must be applied before running Phase 3:**

1. ✅ Phase 1 (`20260501_acct_phase1_sprint1_1.sql` + 1.2 + 1.3) — GL engine
2. ✅ Phase 2 (`20260520_acct_phase2_gl_bridges.sql`) — bridge engine + P2P tables
3. ✅ `hr_advances_grant_milestones.sql` — creates `hr_salary_advances`,
   `hr_salary_advance_recoveries`, `acct_grant_expenses`, `acct_allocation_runs`,
   `acct_depreciation_runs`. If not yet applied, paste it first (it is idempotent).

---

## Pre-flight checks

Run these queries in pactdb SQL Editor **before** applying:

```sql
-- 1. Phase 2 bridge engine present
SELECT count(*) FROM public.acct_gl_bridge_log;           -- must not error

-- 2. Prerequisite tables present (all 5 must return rows)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'eosb_accruals',
    'hr_salary_advances',
    'hr_salary_advance_recoveries',
    'acct_grant_expenses',
    'acct_cost_allocation_rules'
  )
ORDER BY table_name;   -- expect 5 rows

-- 3. Existing feature flags (Phase 2 flags must exist)
SELECT key, is_enabled FROM public.feature_flags
WHERE key LIKE 'acct.bridge.%'
ORDER BY key;

-- 4. Open fiscal period present (required by bridge posting function)
SELECT id, name_en, start_date, end_date, status
FROM public.acct_fiscal_periods
WHERE status = 'open'
LIMIT 3;
```

---

## Apply steps

1. Open **Supabase Dashboard → SQL Editor** for project `abznugnirnlrqnnfkein`
2. Create a new query tab
3. Paste the **entire** content of `supabase/migrations/accounting_gl_bridges_phase3.sql`
4. Click **Run** — no outer `BEGIN … COMMIT` by design; each statement auto-commits.
   All statements are idempotent — safe to re-run from any failed step.

### Expected NOTICE messages (not errors)

```
NOTICE: SKIP Part J: payroll_run_items not found ...
```
This is normal if the HR payroll tables have not yet been applied. The rest of Phase 3
applies cleanly; bind the `acct_payroll_advance_recovery` trigger manually later.

---

## Smoke tests

Run after applying to verify everything is in place:

```sql
-- 1. New COA accounts
SELECT code, name_en, account_type
FROM public.acct_accounts
WHERE code IN ('1520','2350','5600','6200')
ORDER BY code;                        -- expect 4 rows

-- 2. New feature flags
SELECT key, is_enabled
FROM public.feature_flags
WHERE key IN (
  'acct.bridge.eosb_accruals',
  'acct.bridge.hr_salary_advances',
  'acct.bridge.hr_salary_advance_recoveries',
  'acct.bridge.acct_grant_expenses'
)
ORDER BY key;                         -- expect 4 rows, all true

-- 3. Triggers registered
SELECT tgname, relname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE tgname LIKE 'acct_bridge_%'
  AND relname IN ('eosb_accruals','hr_salary_advances',
                  'hr_salary_advance_recoveries','acct_grant_expenses')
ORDER BY tgname;                      -- expect 4 rows

-- 4. Coverage view renders
SELECT * FROM public.acct_gl_bridge_coverage;

-- 5. GL bridge log RPC works
SELECT * FROM public.get_gl_bridge_log(null, null, null, null, 5);

-- 6. hire_date column present on profiles
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'profiles'
  AND column_name  = 'hire_date';    -- expect 1 row

-- 7. rule_name back-filled
SELECT id, pool_name, rule_name
FROM public.acct_cost_allocation_rules
LIMIT 5;                             -- rule_name = pool_name for existing rows
```

---

## Live integration test

To verify the EOSB bridge end-to-end (if `accrue_eosb_for_period` exists):

```sql
-- Run the EOSB accrual for current period
SELECT public.accrue_eosb_for_period(to_char(now(), 'YYYY-MM'));

-- Then check the bridge log
SELECT source_table, event_type, status, error_message, created_at
FROM public.acct_gl_bridge_log
WHERE source_table = 'eosb_accruals'
ORDER BY created_at DESC
LIMIT 5;
```

---

## Disabling a bridge

```sql
UPDATE public.feature_flags
SET is_enabled = false
WHERE key = 'acct.bridge.eosb_accruals';  -- replace with any Phase 3 flag
```

The trigger still fires but `acct_bridge_post_journal` logs `skipped` instead of posting.

---

## Rollback

If you need to revert all Phase 3 changes, apply `docs/sql/PHASE3_GL_BRIDGES_ROLLBACK.sql`.
Note: this does **not** delete journals already posted — posted entries are immutable.

---

## After apply — update STATUS_DASHBOARD.md

Change Phase 3 sprint 3.1 apply log to `✅ APPLIED <date>` in `docs/STATUS_DASHBOARD.md`.

> Phase 3 GL Bridge Extension is now active. EOSB monthly provisions, salary advance
> disbursements and recoveries, and grant programme expenses are now automatically
> journalised in the General Ledger. Monitor all bridge activity on
> **Accounting → GL Bridge Engine**.

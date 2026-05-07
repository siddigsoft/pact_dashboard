# Phase 2 GL Bridge Engine — Manual Apply Runbook

**Migration file:** `supabase/migrations/20260520_acct_phase2_gl_bridges.sql`  
**Target DB:** Supabase project `abznugnirnlrqnnfkein`  
**Prerequisite:** Phase 1 fully applied (Sprint 1.1 + 1.2 + 1.3 + Sudan COA seed)

---

## Pre-flight checklist

Before pasting the migration SQL, verify all items below pass.

```sql
-- 1. Phase 1 schema present
SELECT COUNT(*) FROM public.acct_accounts;           -- expect > 0
SELECT COUNT(*) FROM public.acct_fiscal_periods;     -- expect > 0 (at least 1 open period)
SELECT public.feature_enabled('acct.posting_engine.enabled');  -- expect true

-- 2. Default fund seeded
SELECT id, code, name_en FROM public.acct_funds WHERE code = 'GENERAL';  -- expect 1 row

-- 3. Sudan COA accounts present (key codes used by bridges)
SELECT code, name_en FROM public.acct_accounts
WHERE code IN ('1200','1500','1510','2100','2110','2200','5100','6100')
ORDER BY code;   -- expect 8 rows

-- 4. Source tables present
SELECT COUNT(*) FROM public.payroll_runs;                   -- table must exist (0 is OK)
SELECT COUNT(*) FROM public.withdrawal_requests;            -- table must exist
SELECT COUNT(*) FROM public.operational_cost_submissions;   -- table must exist
SELECT COUNT(*) FROM public.down_payment_requests;          -- table must exist
SELECT COUNT(*) FROM public.salary_advances;                -- table must exist
SELECT COUNT(*) FROM public.wallet_transactions;            -- table must exist
```

---

## Apply steps

1. Open **Supabase Dashboard → SQL Editor** for project `abznugnirnlrqnnfkein`
2. Create a new query tab
3. Paste the **entire** content of `supabase/migrations/20260520_acct_phase2_gl_bridges.sql`
4. Click **Run** — the migration has **no outer `BEGIN … COMMIT` wrapper by design**: each statement auto-commits so exclusive locks are released immediately, preventing deadlocks with the live app's RLS queries. All statements are idempotent — safe to re-run from any failed step.

### Expected output

```
INSERT 0 6        -- 6 new COA accounts (2600, 2610, 2620, 5050, 5060, 5070)
INSERT 0 7        -- 7 new feature flags
CREATE TABLE      -- acct_gl_bridge_log
CREATE FUNCTION   -- acct_bridge_post_journal
CREATE FUNCTION   -- acct_bridge_ops_cost_account
CREATE FUNCTION   -- acct_trig_payroll_runs
CREATE FUNCTION   -- acct_trig_withdrawal_requests
CREATE FUNCTION   -- acct_trig_operational_cost_submissions
CREATE FUNCTION   -- acct_trig_down_payment_requests
CREATE FUNCTION   -- acct_trig_salary_advances
CREATE FUNCTION   -- acct_trig_wallet_reward
CREATE FUNCTION   -- acct_trig_invoice_approved
CREATE FUNCTION   -- acct_trig_payment_processed
CREATE TRIGGER    -- (×7 triggers bound to source tables + 2 P2P tables)
CREATE TABLE      -- (×11 P2P + cheque tables)
CREATE SEQUENCE   -- (×6 document-number sequences)
CREATE FUNCTION   -- (×6 acct_next_* helpers)
CREATE FUNCTION   -- acct_recon_subledger_check
CREATE VIEW       -- v_acct_gl_bridge_summary
...GRANT...
COMMIT
```

---

## Smoke tests (run after apply)

```sql
-- Verify bridge audit log is empty (no events yet)
SELECT COUNT(*) FROM public.acct_gl_bridge_log;   -- expect 0

-- Verify all 7 bridge flags are enabled
SELECT key, is_enabled
FROM public.feature_flags
WHERE key LIKE 'acct.bridge.%'
ORDER BY key;

-- Verify new COA accounts
SELECT code, name_en, account_type
FROM public.acct_accounts
WHERE code IN ('2600','2610','2620','5050','5060','5070')
ORDER BY code;

-- Verify P2P tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'acct_purchase_requisitions','acct_pr_lines',
    'acct_purchase_orders','acct_po_lines',
    'acct_grn_receipts','acct_grn_lines',
    'acct_invoices','acct_invoice_lines',
    'acct_payments','acct_payment_allocations',
    'acct_cheque_register'
  )
ORDER BY table_name;  -- expect 11 rows

-- Verify triggers are registered
SELECT tgname, relname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE tgname LIKE 'acct_bridge_%'
ORDER BY tgname;   -- expect 7 triggers

-- Verify reconciliation function runs cleanly
SELECT * FROM public.acct_recon_subledger_check();
-- All rows should have passed = true when balances are both 0.

-- Test bridge function is accessible (will error if flags OFF or no period)
-- SELECT public.acct_bridge_post_journal(
--   'test', gen_random_uuid(), 'test_event', current_date,
--   'Test', 'اختبار',
--   '[{"account_code":"1200","debit_credit":"DR","amount":100,"currency":"SDG","description":"Test DR","function":"none"},
--    {"account_code":"2200","debit_credit":"CR","amount":100,"currency":"SDG","description":"Test CR","function":"none"}]'::jsonb,
--   NULL
-- );
```

---

## Live integration test

To verify an end-to-end bridge, update a real row in a source table to the trigger status and check the bridge log:

```sql
-- Example: manually trigger a down_payment_requests bridge
-- (only do this in a test environment with a real row)
-- UPDATE public.down_payment_requests
--   SET status = 'fully_paid', total_paid_amount = 1000, admin_processed_by = '<your-admin-uuid>'
-- WHERE id = '<test-row-uuid>';
--
-- SELECT * FROM public.acct_gl_bridge_log
-- WHERE source_table = 'down_payment_requests'
-- ORDER BY created_at DESC LIMIT 1;
--
-- SELECT * FROM public.acct_journal_entries
-- WHERE source_type = 'down_payment_requests'
-- ORDER BY created_at DESC LIMIT 1;
```

---

## Disabling a bridge

Each bridge has an independent feature flag. To turn off a bridge without dropping the trigger:

```sql
UPDATE public.feature_flags
SET is_enabled = false
WHERE key = 'acct.bridge.payroll_runs';   -- replace with the bridge you want to disable
```

The trigger will still fire but `acct_bridge_post_journal` will log a `skipped` event instead of posting.

---

## Rollback

If you need to revert all Phase 2 changes, apply `docs/sql/PHASE2_GL_BRIDGES_ROLLBACK.sql`.

---

## What to tell the user after apply

> Phase 2 GL Bridge Engine is now active. Every time a payroll run is approved, a withdrawal is processed, an operational cost is marked paid, a field advance is fully disbursed, or a salary advance is disbursed, a balanced journal entry is automatically created in the General Ledger.
>
> You can monitor all bridge activity on the **Accounting → GL Bridge Engine** page.

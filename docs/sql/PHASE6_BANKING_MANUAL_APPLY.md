# PACT Accounting — Phase 6 Banking & Treasury · Manual Apply Runbook

## What this migration does

`supabase/migrations/accounting_phase6_banking.sql`

Provides the database layer for the Bank Reconciliation and Cheque Register
pages that already exist in the frontend but were waiting for their tables.

| Part | Object | Purpose |
|---|---|---|
| B | `acct_bank_accounts` | Multi-bank account registry (used by BankRecon, ChequeRegister, CashFlowForecast) |
| C | `acct_bank_statement_lines` | Uploaded / manually entered statement lines for matching |
| D | `acct_bank_recon_summary(uuid?)` | Per-bank reconciliation stats RPC |
| E | `acct_trig_bank_line_matched()` | GL bridge visibility when a line is matched/unmatched |
| F | `v_acct_phase6_coverage` | Phase 6 bridge health view |
| G | Trigger bindings (to_regclass guarded) | |
| H | 2 feature flags | `acct.bridge.bank_recon` (true), `acct.bank_recon.auto_suggest` (false) |

---

## Prerequisites

| # | File | Status |
|---|---|---|
| 1 | `20260501_acct_phase1_sprint1_1.sql` | ✅ Applied |
| 2 | `20260520_acct_phase2_gl_bridges.sql` | ✅ Applied (provides `acct_gl_bridge_log`, `acct_cheque_register`, `acct_invoices`) |
| 3 | `accounting_gl_bridges_phase3.sql` | ✅ Applied (adds `je_reference`/`je_description` on bridge log) |

Phase 4 and Phase 5 SQL do **not** need to be applied first — this file is independent.

---

## Pre-flight checks

```sql
-- 1. GL bridge log is available (from Phase 2)
select count(*) from public.acct_gl_bridge_log;  -- must not error

-- 2. je_reference column on bridge log (from Phase 3)
select column_name from information_schema.columns
where table_name = 'acct_gl_bridge_log'
  and column_name = 'je_reference';  -- expect 1 row

-- 3. Confirm tables don't exist yet (clean slate)
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('acct_bank_accounts', 'acct_bank_statement_lines');
-- expect 0 rows (if already applied, script is safe to re-run)
```

---

## Apply steps

### If you have already run `supabase/bank_recon_migration.sql` (most users)

The tables already exist. Run the hot-patch instead:

1. Open **Supabase Dashboard → SQL Editor** for `abznugnirnlrqnnfkein`
2. Paste the **entire** content of `docs/sql/PHASE6_BANKING_HOTPATCH.sql`
3. Click **Run** — it adds `current_balance`, recreates the RPC and trigger, inserts feature flags

Expected output: the final select returns `Phase 6 hot-patch complete.`

### Fresh install (bank_recon_migration.sql was never applied)

1. Open **Supabase Dashboard → SQL Editor** for `abznugnirnlrqnnfkein`
2. Create a new query tab
3. Paste the **entire** content of `supabase/migrations/accounting_phase6_banking.sql`
4. Click **Run**

### Expected NOTICE (both paths)

```
NOTICE:  acct_bridge_bank_line_matched (re)created.
```

---

## Smoke tests

```sql
-- 1. Tables exist
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('acct_bank_accounts', 'acct_bank_statement_lines')
order by table_name;  -- expect 2 rows

-- 2. RPC runs
select * from public.acct_bank_recon_summary();
-- Returns 0 rows until banks are created — no error is correct

-- 3. Trigger registered
select trigger_name, event_object_table
from information_schema.triggers
where trigger_name = 'acct_bridge_bank_line_matched';  -- expect 1 row

-- 4. Feature flags
select key, is_enabled from public.feature_flags
where key in ('acct.bridge.bank_recon', 'acct.bank_recon.auto_suggest')
order by key;  -- expect 2 rows
```

---

## Live integration test

```sql
-- Create a test bank account
insert into public.acct_bank_accounts
  (account_name, bank_name, currency)
values
  ('TEST_BANK_P6', 'Test Bank', 'USD')
returning id;

-- Insert a statement line (use the id returned above as :bank_id)
-- Then verify acct_bank_recon_summary() returns it
select * from public.acct_bank_recon_summary();

-- Clean up
delete from public.acct_bank_accounts where account_name = 'TEST_BANK_P6';
```

---

## What the pages can do after this migration

| Page | Now works |
|---|---|
| **Bank Reconciliation** (`/accounting/bank-recon`) | Create bank accounts, enter/import statement lines, match to journal entries |
| **Cheque Register** (`/accounting/cheque-register`) | Bank account dropdown populated |
| **Cash Flow Forecast** (`/accounting/cash-flow-forecast`) | `current_balance` field read from `acct_bank_accounts` — no more missing-table banner |

---

## Rollback

Apply `docs/sql/PHASE6_BANKING_ROLLBACK.sql`.

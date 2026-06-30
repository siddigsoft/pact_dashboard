# Pre-Funding Management System — Setup Runbook

## Overview
The Pre-Funding Management System adds a top-level section at `/pre-funding` for Finance and Admin users. It manages incoming pre-funds, approval chains, transaction reconciliation, GL postings, multi-currency balances, and donor PDF statements.

## Step 1 — Apply All SQL Files

### ✅ Fresh install (recommended — single file)

Run **only `pre_funding_ALL_IN_ONE.sql`** in Supabase Dashboard → SQL Editor → New query.
This file is the canonical, always-up-to-date single source and covers everything: core tables,
RLS, GL bridge accounts, allocations table, transaction extensions, and all RPCs.

> **Do NOT also run the individual files below on a fresh install.** Running both will cause
> duplicate-object errors (`already exists`) because `pre_funding_ALL_IN_ONE.sql` already
> includes their content.

### ⚙️ Existing install (incremental patch)

If you already have the base tables from a previous deployment, run **only the files that
introduce new objects** you don't have yet, in this order:

| # | File | When to run |
|---|---|---|
| 1 | `pre_funding_migration.sql` | First-time base schema only (skip if tables already exist) |
| 2 | `pre_funding_atomic_rpcs.sql` | Always run — safe `CREATE OR REPLACE` RPCs |
| 3 | `pre_funding_rls_fix.sql` | Run if you see RLS policy errors |
| 4 | `pre_fund_allocations.sql` | Run if `pre_fund_allocations` table is missing |
| 5 | `pre_fund_user_txn_patch.sql` | Run if `pre_fund_transactions.user_id` column is missing |

> All individual files use `IF NOT EXISTS` / `CREATE OR REPLACE` guards — safe to re-run.

**Key transactional guarantee in `link_payment_atomically_rpc`:** All allocation eligibility checks (`NOT FOUND`, `v_alloc_remaining < p_amount`) are evaluated **before** any INSERT or UPDATE. Failures raise `RAISE EXCEPTION` (not `RETURN`), which rolls back the entire transaction atomically. The `RETURN jsonb_build_object('success', false, ...)` pattern is only used for pure read-phase errors (fund not found, insufficient balance) where no writes have yet occurred.

**What the base migration (file 1) creates:**
| Table | Purpose |
|---|---|
| `pre_fund_period_types` | Period type definitions (Weekly, Monthly, etc.) |
| `pre_fund_settings` | System-wide defaults (currency, thresholds, bank API) |
| `pre_fund_requests` | Main pre-fund records |
| `pre_fund_approval_steps` | Per-fund approval chain steps |
| `pre_fund_transactions` | Individual transactions (receipt, payment, etc.) |
| `pre_fund_reconciliations` | Period close records with surplus disposition |

**What the allocations file (file 4) creates:**
| Object | Purpose |
|---|---|
| `pre_fund_allocations` | Per-user budget limits within a fund |
| `deduct_pf_allocation()` RPC | Atomically increments `spent_amount` when a payment links |

**What the patch file (file 5) adds:**
| Change | Detail |
|---|---|
| `pre_fund_transactions.user_id` | Field staff who made the payment (separate from `created_by` which is the finance admin) |
| `pre_fund_transactions.receipt_url` | URL of the uploaded payment receipt/attachment |
| Extended `link_payment_atomically_rpc` | New optional params `p_user_id`, `p_receipt_url` — old callers with 9 params still work |

**Verify after all files:**
```sql
SELECT COUNT(*) FROM pre_fund_period_types;  -- Should return 7
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'pre_fund_transactions'
    AND column_name IN ('user_id', 'receipt_url');  -- Should return 2 rows
SELECT COUNT(*) FROM pre_fund_allocations;   -- Should return 0 (empty, no error)
```

## Step 2 — Add GL Bridge Accounts (if not already present)

The migration includes:
```sql
INSERT INTO acct_accounts (code, name, type, normal_balance, is_active, description)
VALUES
  ('2400', 'Pre-Fund Liability', 'liability', 'CR', true, '...'),
  ('2401', 'Pre-Fund Liability (Next Period)', 'liability', 'CR', true, '...')
ON CONFLICT (code) DO NOTHING;
```

If `acct_accounts` already has codes 2400/2401, the ON CONFLICT clause prevents duplicates. Verify in Accounting Hub → Chart of Accounts.

## Step 3 — RLS Policy Check

The migration creates RLS policies referencing your `profiles` table with a `role` column. The enforced roles are `super_admin`, `admin`, and `financialAdmin`. If your profiles table uses a different column name, adjust the policy before running:

```sql
-- Default (as written):
EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin'))

-- If your role column is named differently (e.g. 'user_role'), change to:
EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND LOWER(user_role) IN ('super_admin','superadmin','admin','financialadmin'))
```

Note: `countryDirector` is **not** a Pre-Funding finance role and does not grant write access to pre-fund records. It can view read-only reports if your org adds it via a custom RLS policy.

## Step 4 — Verify the UI

1. Log in as a user with `admin` or `financialAdmin` role
2. Confirm **Pre-Funding** appears in the sidebar under Finance (between Finance Hub and Accounting)
3. Navigate to `/pre-funding` — you should see the Pre-Funding hub (Fund Registry, Approval Flow, Reconciliation, Balance Dashboard, Settings)

## Step 5 — Configure Settings

1. Go to **Pre-Funding → Settings**
2. Click **Seed Built-ins** if period types table is empty
3. Set your default display currency (e.g. USD)
4. Configure low-balance threshold % and warning days
5. Toggle integration flags (Bank Reconciliation, Cash Flow Forecast, Budget Encumbrance)
6. (Optional) Enable Bank API Feed and paste your webhook URL

## Step 6 — Create Your First Pre-Fund

1. Go to **Pre-Funding → Fund Registry → New Fund**
2. Fill in: Name, Source/Donor, Amount, Currency, Period
3. Choose Matching Scope (Country + Project recommended)
4. Click **Create Fund**

## Step 7 — Build the Approval Chain

1. Go to **Pre-Funding → Approval Flow Manager**
2. Select the newly created fund
3. Click **Add Step** for each approver (e.g. Finance Manager → Country Director)
4. Return to Fund Registry and click **Submit** to send for approval

## Step 8 — Approve & Activate

1. Each approver sees the fund in Approval Flow Manager
2. They click **Approve** on their assigned step
3. When all required steps are approved, status changes to **Awaiting Receipt**
4. Finance uploads the bank receipt → status becomes **Active**
5. Balance Dashboard now shows the fund with full balances

## Step 9 — Record Transactions & Reconcile

1. Go to **Reconciliation**, select the active fund
2. Click **Add Transaction** to record payments as they happen
3. Check the ✓ box on each transaction to mark it reconciled
4. At period end, click **Close Period** and choose surplus action
5. Download the **Recon PDF** or **Donor PDF** for reporting

## GL Bridge Template Summary

| Event | DR | CR |
|---|---|---|
| Fund Activated | 1200 Cash at Bank | 2400 Pre-Fund Liability |
| Payment Made | 2400 Pre-Fund Liability | 5000 Programme Expenses |
| Carry-Forward | 2400 (Current) | 2401 (Next Period) |
| Return to Donor | 2400 Pre-Fund Liability | 1200 Cash at Bank |
| FX Revaluation | 2400 (FX gain) | 8200 FX Gain/Loss |

## Sidebar Access Control

| Role | Access |
|---|---|
| super_admin | Full access |
| admin | Full access |
| financialAdmin | Full access |
| All others | Hidden |

> `countryDirector` is not in the enforced finance role list. If your org requires directors to view pre-fund data, add a read-only RLS policy manually after running the migration.

## Finance Dashboard Integration

The Accounting Hub → Finance Dashboard now shows a **Pre-Funding** KPI section with:
- Active fund count
- Total available balance
- Low balance alert count
- Pending approval count

This section auto-hides if the `pre_fund_requests` table does not yet exist (graceful degradation).

## Troubleshooting

| Issue | Fix |
|---|---|
| "Run migration" shown in KPI cards | Run `pre_funding_migration.sql` in Supabase SQL Editor |
| Period types list empty | Click "Seed Built-ins" in Pre-Funding → Settings |
| RLS error when inserting | Check your profiles table role column name matches the policies |
| GL accounts 2400/2401 conflict | Skip those INSERT lines if you already have them |
| Fund not visible in sidebar | Ensure your user has `admin`, `financialAdmin`, or `countryDirector` role |

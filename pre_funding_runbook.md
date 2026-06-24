# Pre-Funding Management System — Setup Runbook

## Overview
The Pre-Funding Management System adds a top-level section at `/pre-funding` for Finance and Admin users. It manages incoming pre-funds, approval chains, transaction reconciliation, GL postings, multi-currency balances, and donor PDF statements.

## Step 1 — Apply the Database Migration

1. Open Supabase Dashboard → SQL Editor → New query
2. Paste the contents of `pre_funding_migration.sql`
3. Click **Run**

**What the migration creates:**
| Table | Purpose |
|---|---|
| `pre_fund_period_types` | Period type definitions (Weekly, Monthly, etc.) |
| `pre_fund_settings` | System-wide defaults (currency, thresholds, bank API) |
| `pre_fund_requests` | Main pre-fund records |
| `pre_fund_approval_steps` | Per-fund approval chain steps |
| `pre_fund_transactions` | Individual transactions (receipt, payment, etc.) |
| `pre_fund_reconciliations` | Period close records with surplus disposition |

**Verify:**
```sql
SELECT COUNT(*) FROM pre_fund_period_types;
-- Should return 7
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

The migration creates RLS policies referencing your `profiles` table with a `role` column. If your profiles table uses a different column name, adjust the policy before running:

```sql
-- Default (as written):
EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin','financialAdmin','countryDirector'))

-- If your role column is named differently (e.g. 'user_role'), change to:
EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_role IN ('super_admin','admin','financialAdmin','countryDirector'))
```

## Step 4 — Verify the UI

1. Log in as a user with `admin`, `financialAdmin`, or `countryDirector` role
2. Confirm **Pre-Funding** appears in the sidebar under Finance (between Finance Hub and Accounting)
3. Navigate to `/pre-funding` — you should see the 5-tab hub

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
| countryDirector | Full access |
| All others | Hidden |

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

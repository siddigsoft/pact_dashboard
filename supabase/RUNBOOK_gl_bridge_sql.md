# GL Bridge Engine — SQL Runbook

Run these files **in order** in the Supabase SQL editor (Dashboard → SQL Editor → New query → paste → Run).
Each file is idempotent — safe to re-run if you are unsure whether it was already applied.

---

## Step 1 — Phase 3 (foundation + HR/Grant bridges)

**File:** `supabase/migrations/accounting_gl_bridges_phase3.sql`

Creates:
- `acct_gl_bridge_log` table (the log all badges read from)
- `acct_bridge_post_journal()` core function
- Bridge triggers for:
  - `eosb_accruals` → fires on insert (EOSB panel badge)
  - `hr_salary_advances` → fires on status = `disbursed` (Salary Advances badge)
  - `hr_salary_advance_recoveries` → fires on insert (Salary Advances badge)
  - `acct_grant_expenses` → fires on insert (Grants page badge)

**Must be applied before Steps 2 and 3.**

---

## Step 2 — Phase 2 (operational bridges)

**File:** `supabase/migrations/20260520_acct_phase2_gl_bridges.sql`

Creates bridge triggers for:
- `payroll_runs` → fires on status = `approved` or `locked`
- `withdrawal_requests` → fires on status = `approved`
- `operational_cost_submissions` → fires on status = `paid`
- `down_payment_requests` → fires on status = `fully_paid` ← **needed for Down Payment Approval GL badge**
- `salary_advances` (old wallet table) → fires on status = `disbursed`
- `wallet_transactions` (reward type) → fires on insert
- `acct_invoices` → fires on status = `approved` / `posted` / `paid` (AP Invoices badge)
- `acct_payments` → fires on status = `processed`

Also inserts feature flags (`acct.bridge.*`) that act as on/off switches per bridge.

---

## Step 3 — Phase 4 (accounting module bridges)

**File:** `supabase/migrations/accounting_gl_bridges_phase4.sql`

Creates bridge triggers for:
- `acct_depreciation_runs` → fires on status = `completed` (Depreciation page badge)
- `acct_allocation_runs` → fires on status = `completed` (Cost Allocation page badge)
- `acct_budget_encumbrances` → fires on insert with status = `open` (Budget Encumbrance badge)
- `leave_requests` → fires on status = `approved` (Leave Requests page badge)

---

## Verification query (run after all 3 steps)

```sql
-- Check all bridge feature flags are enabled
select key, is_enabled
from public.feature_flags
where key like 'acct.bridge.%'
order by key;

-- Check bridge log has entries (will be empty until transactions occur)
select source_table, status, count(*)
from public.acct_gl_bridge_log
group by source_table, status
order by source_table;

-- Spot-check: down payment bridge for any existing fully_paid requests
select dp.id, dp.status, gl.status as gl_status, gl.created_at
from public.down_payment_requests dp
left join public.acct_gl_bridge_log gl
  on gl.source_table = 'down_payment_requests' and gl.source_id = dp.id
where dp.status = 'fully_paid'
order by dp.updated_at desc
limit 10;
```

---

## Backfill — GL badge for existing fully_paid down payment requests

The bridge trigger only fires on **new** status changes (AFTER UPDATE). Records that were
already `fully_paid` before the trigger was created will show **GL Pending** in the UI.

To backfill those records, run this after Step 2:

```sql
-- Backfill down_payment_requests already in fully_paid status
-- Safe to run multiple times (idempotent via the ON CONFLICT DO NOTHING)
insert into public.acct_gl_bridge_log
  (source_table, source_id, event_type, status, error_message, created_at)
select
  'down_payment_requests',
  dp.id,
  'down_payment_fully_paid',
  'skipped',
  'Backfill: record was already fully_paid before bridge trigger was installed',
  now()
from public.down_payment_requests dp
where dp.status = 'fully_paid'
  and not exists (
    select 1 from public.acct_gl_bridge_log gl
    where gl.source_table = 'down_payment_requests'
      and gl.source_id = dp.id
  );
```

This marks pre-existing records as **GL Skipped** (grey badge) rather than leaving them
as **GL Pending** (white badge), which is more accurate — there was no journal to post
because the trigger did not exist yet.

---

## No SQL needed for these changes

The following fixes were **pure frontend error-handling** — no database changes required:

| Pass | Pages fixed |
|------|------------|
| 4 | Helpline, CRMOpportunities, PerformanceReviews, Offboarding, MyTasks |
| 5 | WorkspaceHub (12 file/folder functions), RoleManagement |
| Latest | EditMMP site entry save loop now properly surfaces DB errors |

---

## Future bridge opportunities (not yet done)

These tables have DB bridge triggers (from Step 2) but **no UI badge** yet:

| Table | Trigger fires when | Natural page to add badge |
|---|---|---|
| `payroll_runs` | status → `approved` / `locked` | PayrollAdmin |
| `withdrawal_requests` | status → `approved` | Wallet / FinancialOperations |
| `operational_cost_submissions` | status → `paid` | FinancialOperations |
| `acct_payments` | status → `processed` | AP Invoices (payment tab) |

These can be added as a follow-up when needed.

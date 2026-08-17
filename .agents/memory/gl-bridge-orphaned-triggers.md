---
name: GL Bridge Orphaned Triggers
description: The acct_trig_down_payment_requests and acct_trig_operational_cost_submissions functions existed but were never attached — the CREATE TRIGGER statements were missing.
---

## Rule

The GL trigger functions for `down_payment_requests` and `operational_cost_submissions` were created in migration `20260511_acct_country_coa_partitioning.sql` (steps 7 and 8) but the `CREATE TRIGGER` statements that attach them to the tables were omitted from that migration. The triggers only became live after running `20260817_gl_bridge_advances_ops.sql`.

**Why:** The migration file created the functions as `CREATE OR REPLACE FUNCTION` but had no corresponding `CREATE TRIGGER trg_dpr_gl_post ON down_payment_requests` or `CREATE TRIGGER trg_ocs_gl_post ON operational_cost_submissions`. This is a common omission pattern — if bridge functions exist but no records appear in `acct_gl_bridge_log`, check whether the trigger is actually attached to the table, not just whether the function exists.

**How to apply:** When debugging "why aren't GL entries being created?", check `pg_trigger` for the table name before diving into the function logic. A function without an attached trigger is silent.

## Bridge Architecture (as of 2026-08-17)

| Source Table | GL Trigger Function | Trigger Name | Fires on |
|---|---|---|---|
| `down_payment_requests` | `acct_trig_down_payment_requests` | `trg_dpr_gl_post` | `UPDATE WHERE new.status = 'fully_paid'` |
| `operational_cost_submissions` | `acct_trig_operational_cost_submissions` | `trg_ocs_gl_post` | `UPDATE WHERE new.status = 'paid'` |
| `pre_fund_transactions` | (manual RPC only) | — | `post_prefunding_to_gl()` RPC |
| `hr_salary_runs` | (manual RPC only) | — | `post_payroll_to_gl()` RPC |

## Manual Retroactive RPCs (added 20260817)

- `post_downpayments_to_gl()` — posts all `fully_paid` down-payment requests missing a `success` bridge log row
- `post_cost_submissions_to_gl()` — posts all `paid` operational cost submissions missing a `success` bridge log row

Account mapping:
- Down-payments: DR 1510 (Staff/Travel Advances) · CR 1200 (Cash/Bank)
- Ops costs: DR category-mapped via `acct_bridge_ops_cost_account()` · CR 1200 (Cash/Bank)

## UI

`AccountingGLBridgeAdvances.tsx` tab in AccountingHub under id `gl-bridge-advances`. Shows pending counts, runs bridge RPCs, shows bridge log for both tables.

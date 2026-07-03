---
name: Pre-Fund Spend Attribution Fallback
description: Why per-staff "spent" can show 0 on Allocation Dashboard even when the fund's Total Paid Out is correct, and how it's resolved
---

## Rule
`pre_fund_transactions.user_id` is frequently NULL even when the payment is clearly tied to a specific
staff member, because several creation paths don't set it:
- Reconciliation → Add Transaction: `user_id` defaults to NULL unless a Super Admin manually picks a staff member.
- Down-payment/cost-submission auto-linking: if the staff member has no `pre_fund_allocations` row yet,
  the linkage code passes `p_user_id = null` to avoid an RPC exception, even though the source record
  (`down_payment_requests.requested_by` / `operational_cost_submissions.submitted_by`) identifies the owner.

The fund's `paid_amount` (used for the "Total Paid Out" KPI) is always incremented correctly regardless of
`user_id`, so that KPI can be correct while every per-staff "spent" row shows 0 — this looks like a bug but is
actually a missing-attribution issue, not a missing-money issue.

**Why:** Two independent sources of truth (fund-level `paid_amount` vs. per-user `pre_fund_transactions`/`pre_fund_allocations.spent_amount`) diverge whenever a transaction lacks user attribution.

**How to apply:** When computing per-staff spend (e.g. `src/pages/PreFundingAllocations.tsx`), don't only trust `transaction.user_id`. For transactions with `source_table` = `down_payment_requests` or `operational_cost_submissions` and `user_id IS NULL`, resolve the owner from the source record (`requested_by` / `submitted_by`) and attribute the spend to that user before falling back to flagging it as "unattributed."

---
name: Pre-Fund Spend Attribution Fallback
description: Why per-staff "spent" can show 0 on Allocation Dashboard even when the fund's Total Paid Out is correct, and how it's resolved
---

## Rule
Per-staff "spent" on the Allocation Dashboard can show 0 for an allocated staff member even though they
personally disbursed the fund's entire paid_amount. Two distinct causes exist, both must be handled:

1. **NULL user_id:** Reconciliation → Add Transaction defaults `user_id` to NULL unless a Super Admin
   manually picks a staff member; down-payment/cost-submission auto-linking also passes `p_user_id = null`
   when the recipient has no `pre_fund_allocations` row yet — even though the source record
   (`down_payment_requests.requested_by` / `operational_cost_submissions.submitted_by`) identifies the owner.
2. **user_id ≠ allocation holder (confirmed real-world case, not hypothetical):** some funds allocate budget
   to a *disbursing officer* (e.g. a Finance/Ops lead responsible for a slice of the pool) rather than to the
   individual field beneficiaries who receive each down-payment. Every transaction's `user_id` is correctly
   the recipient (e.g. a site/location requester), but `created_by` is the officer who actually approved/spent
   from their allocation. Verified example: a WFP-TPM fund where 100% of paid_amount (308/308 transactions)
   had `created_by` = the allocated officer, but `user_id` never matched either allocated staff member.

The fund's `paid_amount` (Total Paid Out KPI) is always incremented correctly regardless of attribution, so
that KPI can look right while every per-staff "spent" row shows 0 — looks like a missing-money bug but is
actually a missing/wrong-attribution issue.

**Why:** Multiple independent signals (fund-level `paid_amount`, transaction `user_id`, transaction `created_by`, `pre_fund_allocations.spent_amount`) can diverge, and the "allocation holder" is not always the same person as the "payment recipient."

**How to apply:** When computing per-staff spend (e.g. `src/pages/PreFundingAllocations.tsx`), build an attribution chain per fund: (a) transaction.user_id if present; (b) else resolve owner from the source record (`requested_by`/`submitted_by`) when user_id is NULL; (c) if the resolved owner still isn't one of the fund's allocated staff, fall back to `transaction.created_by` when *that* is an allocated staff member (treats them as the disbursing officer). Only count it unattributed if none of these match an allocated user. When debugging "spent=0" issues like this, query the live DB directly (Supabase Management API `/v1/projects/{ref}/database/query` with `SUPABASE_ACCESS_TOKEN`, after using `/v1/projects` to find the correct project ref — env-var URL/anon-key project refs can be stale/mismatched) rather than guessing from code alone.

---
name: Down Payment batch-pay basis calculation
description: How to correctly compute the payable amount for bulk/batch payment actions when requests can already be partially paid
---

When a bulk/batch "pay" action can act on rows in more than one status (e.g. `approved` and `partially_paid`), the amount basis must be status-aware:

- `approved` (never paid) → basis = full approved amount.
- `partially_paid` (already received a partial payment) → basis = `remaining_amount` only. Adding the new payment to the existing `total_paid_amount` (accumulate, don't overwrite) is required so history isn't lost.

**Why:** A batch-pay code path was originally written only for `approved` rows and later reused (via copy-paste) for a "Processing" tab whose rows are all `partially_paid`. The reused filter still checked `status === 'approved'`, so the count was always 0 and every batch button in that tab was silently disabled — with no error, just a dead button. The underlying `batch_mark_advances_paid` SQL RPC had the same hardcoded `status = 'approved'` requirement.

**How to apply:** Whenever adding a new status to a list/tab that can trigger bulk payment/completion actions, grep every place that filters by `status === 'approved'` in that flow (both the SQL RPC and the JS fallback/dialog code) and confirm the filter, the amount basis, and the accumulation logic all handle the new status. Don't assume "add the status to the tab filter" is sufficient — the amount-calculation basis is a separate, easy-to-miss spot.

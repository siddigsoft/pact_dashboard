---
name: Paid Down Payment reopen integrity
description: Rules for returning a paid Down Payment to an approval state without breaking Pre-Fund and wallet reconciliation.
---

A paid Down Payment must never be reset to pending or approved through a direct source-table update. Its active Pre-Fund payment events, wallet evidence, instalment markers, and source fields must be changed together by an authorized atomic operation. Database guards must reject direct paid-to-unpaid reductions while ledger or wallet evidence remains active.

**Why:** Clearing `total_paid_amount` or changing status alone makes payment screens exclude the event while Pre-Fund allocation and wallet evidence continue to count it, producing irreconcilable balances.

**How to apply:** Use the controlled reopen or cancellation path for status reversions. Before adding any new write-off, exception, or bulk-revert UI, verify it either uses that operation or does not mutate payment state.
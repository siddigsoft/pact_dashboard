---
name: Reconciliation compensated-event visibility
description: Keeping stale compensated payments out of the Reconciliation working queue.
---

The reconciliation ledger view can omit a compensating reversal after its source returns to an earlier approval state, even though the immutable reversal remains in the underlying transaction table.

**Why:** A stale original payment can otherwise remain actionable in the working queue and receive a safe backend rejection because its payment has already been compensated.

**How to apply:** Before offering a payment action, supplement the view data with direct reversal-link checks from the immutable ledger. Treat no-active-event responses as no-op safety outcomes, refresh the queue, and do not infer or manufacture a fund event for legacy paid sources.
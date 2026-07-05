---
name: HR admin batch tools need idempotency/partial-failure handling
description: Carry-forward, broadcast, and similar bulk HR admin actions must guard against double-apply on re-run and must not treat partial failure as total failure.
---

Bulk/batch admin tools in the HR hub (e.g. annual-leave carry-forward, staff broadcast messaging) tend to be written as simple loops that either:
1. Additively update a running total (carry-forward adds `carryForward` onto `annual_days` every time it runs), or
2. Use `Promise.all` across a batch, so one failed item rejects the whole batch and the UI reports a misleading result.

**Why:** Admin users double-click buttons, retry after a timeout, or run the same tool again next cycle without realizing it already ran. Additive updates silently inflate balances (e.g. leave days) on every re-run. `Promise.all` batching means a single failed notification send can either abort still-pending sends or make the success count wrong.

**How to apply:**
- For additive batch updates, add a marker/state column (e.g. `carried_forward_days` on `leave_entitlements`) so the tool can detect "already applied for this period" and skip instead of re-adding. Ship this as a manual-apply SQL migration per project convention.
- For batches of independent async calls (e.g. per-recipient sends), use `Promise.allSettled` and tally real success/failure counts instead of `Promise.all`, so the UI reports accurate partial results and the whole operation doesn't abort on one failure.

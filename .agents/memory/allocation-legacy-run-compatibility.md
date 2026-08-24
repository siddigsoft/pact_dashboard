---
name: Allocation legacy-run compatibility
description: How to add atomic period-level allocation safeguards without breaking or replaying historical per-rule runs.
---

New Cost Allocation posting treats one completed run as the business outcome for a fiscal period, but older period-close workflows wrote one completed audit row per rule.

**Why:** A plain unique constraint on completed `period_id` values fails when historical multi-rule periods already exist. Re-running an allocation for a legacy period would also duplicate the original allocation source activity.

**How to apply:** Scope new singleton constraints to records carrying the new atomic idempotency marker. When a period has legacy completed allocation history, return an explicit no-replay result rather than creating a new journal. Test migrations with a multi-rule legacy period before changing allocation-run constraints.
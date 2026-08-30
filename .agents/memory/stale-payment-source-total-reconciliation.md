---
name: Stale payment source total reconciliation
description: Safe handling when a payment source total is lower than its existing immutable Pre-Fund links.
---

When an approved payment source has a stale cumulative paid total below its net immutable Pre-Fund payment links, align the source total to those links atomically before recording the next payment, but only if the linked total remains within the approved amount.

**Why:** Treating a valid historical link as unavailable evidence blocks every later installment, while blindly raising the source total can conceal a genuinely incorrect over-link.

**How to apply:** Lock the source, calculate net payments minus reversals/returns across all funds, compare that value with both the recorded and approved totals, and update only the stale source cache in the same transaction. If net links exceed approval, preserve all records and require an audited reversal.
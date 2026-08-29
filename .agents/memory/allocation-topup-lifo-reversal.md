---
name: Allocation top-up LIFO reversal
description: Audit and integrity rules for reversing staff allocation Add Funds entries.
---

Staff allocation Add Funds entries may only be reversed newest-first. Reversal must be atomic, verify the caller's expected latest entry under lock, restore the prior allocation amount and receipt, and retain immutable reversal evidence. The original allocation and expenditure/payment evidence are never part of this deletion flow.

**Why:** Older top-ups are part of the balance chain. Removing one while a newer entry remains breaks running totals and receipt provenance; physically deleting evidence weakens financial accountability.

**How to apply:** Any future staff allocation top-up editor or importer must preserve append order and prior-total/receipt evidence. Reversals must fail if the restored total would be below spent funds or if the selected latest entry became stale.
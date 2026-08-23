---
name: Pre-Fund journal Accounting Fund dimension
description: Assigning the required accounting fund to Pre-Fund payment journal lines.
---

Pre-Fund payment journal lines require an Accounting Fund Registry ID, which is distinct from the operational Pre-Fund request ID. Posting must proceed only when exactly one Accounting Fund is active.

**Why:** Production accounting lines enforce a non-null foreign key to `acct_funds`; the operational fund identifier is not safe to reuse because it refers to a different table and may not be a valid accounting dimension.

**How to apply:** Resolve the active registry fund at the Pre-Fund journal-line boundary before its NOT NULL constraint runs. Scope the rule to Pre-Fund transaction journals and fail atomically with a clear setup error if the active-fund configuration is absent or ambiguous.
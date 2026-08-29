---
name: Direct fund top-up LIFO reversal
description: Safety rule for removing direct top-ups from a main Pre-Fund.
---

Direct main-fund top-ups may only be reversed newest-first. A reversal must preserve the original receipt and journal, add compensating ledger and posted GL events, and reduce both funded amount and available balance atomically.

**Why:** Direct top-ups represent money already received. Physical deletion would erase financial evidence, while reversing money that is already spent, committed, or allocated would underfund recorded obligations.

**How to apply:** Require Finance/Admin authorization and a reason, lock the fund, reject stale or non-latest requests, and reject any reversal that would make availability negative or put funded value below paid, committed, or allocated amounts.
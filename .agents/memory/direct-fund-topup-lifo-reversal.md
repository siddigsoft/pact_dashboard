---
name: Direct fund top-up LIFO reversal
description: Safety rule for removing direct top-ups from a main Pre-Fund.
---

Direct main-fund top-ups may only be reversed newest-first. A reversal must preserve the original receipt and journal, add compensating ledger and posted GL events, and reduce both funded amount and available balance atomically.

If the latest top-up amount was recorded too high after some of the money was used, correct it by fully reversing the original event and posting a replacement receipt for the verified amount. Never mutate the original receipt amount in place.

**Why:** Direct top-ups represent money already received. Physical deletion would erase financial evidence, while reversing money that is already spent, committed, or allocated would underfund recorded obligations.

**How to apply:** Require Finance/Admin authorization and a reason, lock the fund, reject stale or non-latest requests, and reject any reversal or downward correction that would make availability negative or put funded value below paid, committed, or allocated amounts.

Legacy direct top-ups from the first posting RPC may have a complete journal left in `draft`. A correction may finalize that linked journal before compensation, but must still reject missing or line-less journals rather than synthesizing evidence.
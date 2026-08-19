---
name: Cycle Redirect allocation ledger
description: Accounting invariants for allocating one paid transport advance across covered-site fees.
---

Cycle Close Redirects must use a normalized target-allocation ledger. The full
paid advance is allocated exactly once across eligible covered sites; the
not-covered source site and original payment references remain unchanged.
Later cash or bank completion must derive the advance offset from that ledger,
reconcile all components exactly to the gross fee, and roll back the paid state
if its GL journal cannot post.

**Why:** Client-supplied fee components can understate the remaining payment or
repost an advance offset. Source-site mutation also destroys the distinction
between the original disbursement and the covered sites whose fees it settled.

**How to apply:** Any new Redirect UI, report, fee-payment flow, or GL trigger
must read the per-target ledger as authoritative, preserve source payment
references, enforce full-advance allocation and target capacity, and never
silently rewrite legacy journals.
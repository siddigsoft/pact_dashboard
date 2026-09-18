---
name: Claimant settlement serialization
description: Concurrency invariant between site wallet settlement, claimant reassignment, and idempotent retries.
---

Ordinary site wallet earnings and claimant reassignment serialize through the
site row. A settlement whose recipient no longer matches the effective claimant
must fail closed. Replaying an older successful reassignment returns its
original result without changing the current effective claimant.

**Why:** Reassignment-side locking alone still permits a simultaneous settlement
to credit the raw former claimant after effective attribution has changed.
Adding the advisory lock to the wallet trigger creates a row/advisory lock-order
cycle with WFP's AFTER UPDATE settlement. Reapplying an old retry's projection
can also rewind a later claimant transfer.

**How to apply:** Any new path that posts an ordinary site earning must lock the
site row through the trusted settlement guard before claimant validation. Do
not add the claimant advisory lock after that row lock. Keep retries financially
and projection-idempotent when newer reassignment audit rows exist.
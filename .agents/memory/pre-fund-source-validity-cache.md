---
name: Pre-fund source validity cache
description: Rules for keeping cached pre-fund balances aligned with source-validated immutable events.
---

Pre-fund reconciliation is source-led: source corrections and compensating
events must be atomic, authorized, and limited to valid source states.

**Why:** Reversing a ledger event without the matching source transition can
restore funds while the source remains paid, producing an inconsistent ledger.

**How to apply:** Treat a correction as one authorized state transition; reject
the whole batch before mutation if any source is forbidden or invalid.

Finance payment gaps are source-level exceptions. A source may be covered by
multiple pre-funds, so its signed payments must be aggregated before comparing
them with the source total.

**Why:** Attributing the full source total to every participating fund creates
false gaps and can lead to an incorrect historical correction.

**How to apply:** Report a real unmatched remainder once, without guessing a
fund to which it belongs.

Canonical availability is funded amount minus verified signed payments minus
the current committed amount.

**Why:** Commitments reserve cash before payment events exist; ignoring them
releases reserved money and permits overspending.

**How to apply:** Balance refreshes and payment guards must use the same
commitment-aware availability rule.
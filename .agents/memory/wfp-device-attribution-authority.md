---
name: WFP device attribution authority
description: Durable integrity rules for resolving WFP submissions to official Command Center field users.
---

For WFP-confirmed sites, financial reconciliation, fee payment, and final exports must use the resolved Device ID attribution unless a later audited claimant-reassignment overlay exists. Official names come from Command Center profiles; raw claimant, WFP names, and device identifiers remain immutable evidence.

**Why:** A claimant/device-owner mismatch can otherwise be corrected for Cycle Close while Finance still pays the original claimant. Mutable evidence or post-close corrections can also make the live attribution disagree with the immutable close snapshot.

**How to apply:** Preserve raw WFP evidence through audited ingestion, require explicit review for mismatches and unknown devices, and serialize evidence/attribution mutations with Final Close on the parent cycle row. Post-settlement claimant changes must use a separate effective-claimant projection plus compensating wallet entries; never rewrite raw attribution or original earnings. Allow recoverable negative debt only inside that trusted reassignment transaction, not for ordinary withdrawals.
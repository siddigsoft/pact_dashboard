---
name: WFP device attribution authority
description: Durable integrity rules for resolving WFP submissions to official Command Center field users.
---

For WFP-confirmed sites, financial reconciliation, fee payment, and final exports must use the resolved Device ID attribution, not the original claimant fields. Official names come from Command Center profiles; raw WFP names and identifiers remain evidence only.

**Why:** A claimant/device-owner mismatch can otherwise be corrected for Cycle Close while Finance still pays the original claimant. Mutable evidence or post-close corrections can also make the live attribution disagree with the immutable close snapshot.

**How to apply:** Preserve raw WFP evidence through audited ingestion, require explicit review for mismatches and unknown devices, and serialize evidence/attribution mutations with Final Close on the parent cycle row. Reject attribution changes after close unless an audited reopen flow exists.
---
name: Claimant reassignment eligibility
description: Authorization boundary for selecting a replacement claimant without weakening financial transfer integrity.
---

Replacement claimants must be active Data Collectors or Coordinators assigned to the same canonical state as the site. Eligibility includes normalized primary and additive roles and must be enforced server-side before any wallet, audit, or projection write.

**Why:** Browser-only filtering can be bypassed, while the legacy financial RPC accepted only primary collector roles and would reject Coordinators after the UI listed them.

**How to apply:** Resolve the site’s displayed state through the canonical states registry, list candidates through a Super Admin-only RPC, and call a private financial core through an eligibility wrapper. Keep legacy and internal financial RPCs revoked from browser roles.
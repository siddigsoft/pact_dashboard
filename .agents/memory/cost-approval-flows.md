---
name: Cost submission approval flows
description: The 4 approval flows for operational cost submissions, defined by submitter role.
---

## Flows (as of Jun 2026 redesign)

| Submitter | T1 | T2 | T3 | T4 | Finance |
|---|---|---|---|---|---|
| Coordinator | Hub Supervisor | FOM | Country Director | Admin/SuperAdmin | ✓ |
| Supervisor | FOM | Country Director | Admin/SuperAdmin | — | ✓ |
| FOM | Country Director | Admin/SuperAdmin | — | — | ✓ |
| Country Director | Admin/SuperAdmin | — | — | — | ✓ |

**Why:** CD was previously grouped with FOM ("either can approve"). The user requires CD to always be a sequential step after FOM and before Admin, never interchangeable.

**How to apply:**
- isFomSubmission() = FOM role only (NOT countryDirector)
- isCDSubmission() = countryDirector only
- hasThreeTiers() = supervisor only
- hasFourTiers() = coordinator only
- DB column tier4_status added via migration 20260607_add_tier4_approval.sql — must be run in Supabase before coordinator T4 approvals work
- canFOMBypass() = FOM only (CD does NOT have bypass authority)

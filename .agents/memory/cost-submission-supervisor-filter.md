---
name: Cost Submission Supervisor Filter & Hub Scoping
description: Rules for what Supervisors see and can approve in the Cost Submission page
---

## Rule
Supervisor visibility and T1-approve permission for Coordinator submissions must both be hub-scoped.

**Why:** A Supervisor is T1 approver only for Coordinators from their own hub. Without a hub check:
- Every Supervisor saw every Coordinator submission from every hub
- Every Supervisor could click Approve T1 on submissions from other hubs
- The old catch-all `tier1_status === 'pending'` line exposed ALL pending submissions (FOM, CD, etc.) to all Supervisors

**How to apply:**
1. `filteredOperationalCosts` Supervisor branch: use `o.hub_id === currentUser?.hubId` for Coordinator/Enumerator/DataCollector role subs. Falls back to allow if either hub_id is absent. Replace `tier1_status === 'pending'` catch-all with `tier1_approved_by === currentUser?.id` (history).
2. `canTier1Approve`: when `hasFourTiers(oc)` is true, check `oc.hub_id === currentUser?.hubId` in addition to `isSupervisor`. Fall back to `true` when hub data is missing.
3. `currentUser` hub property is `hubId` (camelCase); submission DB column is `hub_id` (snake_case).

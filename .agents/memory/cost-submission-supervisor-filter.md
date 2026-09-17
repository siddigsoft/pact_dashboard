---
name: Cost Submission Supervisor Filter & Hub Scoping
description: Rules for what Supervisors see and can approve in the Cost Submission page
---

## Rule
Supervisor visibility and T1-approve permission for Coordinator submissions must both be hub-scoped.

Kassala Hub Supervisor assignments are the explicit exception: Cost Submission read/payment scope is organization-wide, while Tier 1 approval/rejection remains limited to Kassala Hub Coordinator submissions. Tier 2+ and deletion stay unavailable.

**Why:** A Supervisor is T1 approver only for Coordinators from their own hub. Without a hub check:
- Every Supervisor saw every Coordinator submission from every hub
- Every Supervisor could click Approve T1 on submissions from other hubs
- The old catch-all `tier1_status === 'pending'` line exposed ALL pending submissions (FOM, CD, etc.) to all Supervisors

**How to apply:**
1. Resolve an effective hub from the request hub, then the submitter's hub, then their state. Normalize it before every client visibility, approval, and pending-approver comparison.
2. The database RPC and RLS policy must use the same canonical hub scope as the client. Client-side normalization cannot restore rows already excluded by raw hub equality in the database.
3. Profile hubs use `hubId` in the client while submission rows use `hub_id`; legacy values may contain a state or prefixed state label instead of a canonical hub ID.
4. Keep historical requests actioned by the current Supervisor visible, but never expose another Supervisor's submissions merely because their Tier 1 status is pending.
5. In SQL role normalization, lowercase first and then remove non-letters. Removing non-lowercase characters first turns `Supervisor` into `upervisor`, which silently makes the RPC return only the current user's own requests.
6. For the Kassala exception, keep global read/payment authorization separate from per-row Tier 1 authorization and enforce the latter in both web/mobile controls and the database transition trigger.
7. Detect the special Kassala assignment with `is_kassala_hub_supervisor`; its database resolver must include canonical role assignments plus profile hub/secondary hub, or current Access Manager assignments still render My Submissions/view-only/no-payment UI.

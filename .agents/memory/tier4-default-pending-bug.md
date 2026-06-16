---
name: tier4_status DEFAULT pending bug
description: 20260607 migration poisoned hasFourTiers() for non-coordinator submissions by setting tier4_status DEFAULT 'pending' on all rows.
---

## The Rule
`hasFourTiers()` must classify submissions using **only `submitter_role`** (via `isCoordinatorSubmission()`). Never use `oc.tier4_status != null` as a fallback.

**Why:** `20260607_add_tier4_approval.sql` added `tier4_status TEXT DEFAULT 'pending'`, which stamped every existing row — including Supervisor, FOM, CD submissions — with `tier4_status='pending'` (non-null). The old fallback `oc.tier4_status != null` caused Supervisor submissions to be classified as 4-tier Coordinator flow, routing T1 approval to `isSupervisor` instead of `isFOM`, so FOM never saw approve buttons.

**How to apply:** Any time `hasFourTiers` is written or reviewed, ensure it reads:
```js
return isCoordinatorSubmission(oc); // NO tier4_status != null fallback
```

**DB cleanup:** `supabase/runbooks/fix_tier4_status_default.sql` sets `tier4_status = NULL` for non-coordinator rows that haven't reached T4. Must be applied to Supabase by the user.

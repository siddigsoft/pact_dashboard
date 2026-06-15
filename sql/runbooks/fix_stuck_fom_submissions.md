# Runbook: Fix Stuck FOM Cost Submissions

## What happened

When a Field Operation Manager (FOM) submitted a cost request, the system
failed to recognise their role (`'Field Operation Manager (FOM)'` was not
matching the detection logic). As a result:

- The approval flow display showed **"Tier 1 — Supervisor"** instead of
  **"Tier 1 — Country Director"**
- On-submit email/in-app notifications went to **Hub Supervisors** instead of
  **Country Directors**
- Supervisors received notifications for requests they cannot approve

The **code fix is already deployed** — new submissions will work correctly.
Existing stuck submissions need the steps below.

---

## Step 1 — Diagnose: find stuck FOM submissions

Run `sql/runbooks/01_diagnose_stuck_fom.sql` in the Supabase SQL editor.

This query lists every FOM submission still waiting at Tier 1.

---

## Step 2 — Evaluate

For each submission returned by the diagnostic:

| State | What to do |
|---|---|
| `tier1_status = 'pending'` | Country Director needs to approve Tier 1. No data change needed — the display now correctly shows "Tier 1 — Country Director" after the code fix. |
| Supervisors already approved | Run `sql/runbooks/02_reset_wrongly_approved_tier1.sql` (see below) to revert the tier1 approval so the CD can properly review it. Use your judgment — if the supervisor approval was legitimate (e.g. a supervisor with dual roles), leave it. |

---

## Step 3 — Notify Country Directors

**Option A — Use the Send Reminder button (easiest)**

In the PACT app, navigate to `/cost-submission` as a Super Admin. Find each
stuck submission and click the **"Send Reminder"** button. With the code fix
deployed this will now correctly ping the Country Director.

**Option B — SQL approach (if you want bulk re-notification)**

This cannot be done via SQL alone because notifications go through the app's
edge function. Use Option A or ask your developer to trigger
`NotificationTriggerService.costSubmissionCreated()` for each submission ID.

---

## Step 4 — Verify

After the CD approves Tier 1 on the stuck submissions, the flow will
automatically move to Tier 2 (Admin approval), same as any normal FOM
submission.

---

## Notes

- **No data corruption** — the tier_status columns are all correct (`tier1_status
  = 'pending'`). Only the wrong people were notified and the display was wrong.
- **Supervisors can no longer action these** — the code fix prevents supervisors
  from approving FOM-submitted Tier 1 requests.
- For submissions where a supervisor **already** approved Tier 1 incorrectly,
  use the optional reset script after reviewing each case.

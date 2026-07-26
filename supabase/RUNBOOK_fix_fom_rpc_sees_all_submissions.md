# Runbook: Fix FOM Seeing Zero Cost Submissions

## Root Cause

Migration `20260501_fix_supervisor_cost_submit_rls.sql` accidentally merged
the FOM role into the **Supervisor hub-filter branch** of the RPC
`get_all_operational_cost_submissions()`.

Because FOM accounts have no `hub_id` set on their profile, the condition
`WHERE hub_id = NULL` returns **zero rows** — hence all-zeros for any FOM.

## Fix

Run the SQL in `supabase/migrations/20260726_fix_fom_rpc_sees_all_submissions.sql`
in the **Supabase SQL Editor** (Production).

### Steps

1. Go to [Supabase Dashboard → SQL Editor](https://supabase.com/dashboard)
2. Select the **pact-dashboard** project
3. Paste and run the contents of:
   `supabase/migrations/20260726_fix_fom_rpc_sees_all_submissions.sql`
4. You should see `Success` with no errors

### What the fix does

| Role | Before (broken) | After (fixed) |
|------|----------------|---------------|
| FOM  | Hub-filtered (hub_id = NULL → 0 rows) | Sees ALL submissions |
| Country Director | Hub-filtered | Sees ALL submissions |
| Supervisor | Hub-filtered | Hub-filtered (unchanged) |
| Others | Own only | Own only (unchanged) |

### Verification

After running the SQL, ask Tarig to hard-refresh (`Ctrl+Shift+R`) on
`app.pactorg.com/cost-submission`. He should immediately see all pending
supervisor and coordinator submissions.

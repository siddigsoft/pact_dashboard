# Apply: timesheet_entries INSERT status guard (hot-patch)

**Date:** 2026-04-26
**File:** `supabase/migrations/20260426_timesheet_entries_insert_status_guard.sql`
**Severity:** High (approval bypass / payroll integrity)
**Depends on:** `supabase/migrations/20260409_timesheet_module.sql` already applied (it is — 2026-04-26).

## Why

Architect review of the post-fix Timesheet module flagged this on 2026-04-26:

> The original `timesheet_entries_insert` policy only checks ownership of
> the parent timesheet, **not its status**. An employee can insert new
> `timesheet_entries` into an already-approved week, silently changing
> payable hours after approval and after payroll has read them.

This is an approval bypass: anything tied to "the week was approved at this
hour count" (payroll runs, audit reports, manager sign-off screens) becomes
unreliable.

## What this patch does

Drops the existing INSERT policy and recreates it with the same status
guard the UPDATE/DELETE policies already enforce:

- **Self-service path:** user can insert into their own timesheet only when
  its status is `draft` or `revision`.
- **Manager override:** admin / supervisor / fom can still insert into a
  direct report's week, any status.
- **Finance / super_admin override:** unchanged — full access.

No schema change. No data motion. Idempotent (DROP IF EXISTS + CREATE).

## Apply

1. Open pactdb SQL editor (`abznugnirnlrqnnfkein`).
2. Paste the entire contents of
   `supabase/migrations/20260426_timesheet_entries_insert_status_guard.sql`.
3. Run it. Expect "DROP POLICY" and "CREATE POLICY" success messages, no
   row counts.

## Verify (run immediately after)

```sql
SELECT polname,
       pg_get_expr(polqual, polrelid)       AS using_expr,
       pg_get_expr(polwithcheck, polrelid)  AS check_expr
FROM pg_policy
WHERE polrelid = 'public.timesheet_entries'::regclass
ORDER BY polname;
```

The `timesheet_entries_insert` row should now show `t.status IN ('draft',
'revision')` inside its `check_expr`. If it does not, you pasted the wrong
file — re-copy from the repo.

## Manual smoke (optional, ~30 sec)

Logged in as a non-admin employee whose own week is `approved`:

```sql
-- Should return 0 rows (no draft/revision week of yours):
SELECT id, status, week_start
FROM timesheets
WHERE user_id = auth.uid()
  AND status IN ('draft','revision')
ORDER BY week_start DESC
LIMIT 1;

-- Pick any approved week of yours instead and try to insert:
INSERT INTO timesheet_entries (timesheet_id, date, hours, task_type)
SELECT id, week_start, 1, 'other'
FROM timesheets
WHERE user_id = auth.uid()
  AND status = 'approved'
ORDER BY week_start DESC
LIMIT 1;
-- EXPECTED: ERROR: new row violates row-level security policy
```

If the insert succeeds, the new policy is not in place — re-run step 2.

## Roll-back

If something downstream breaks (unlikely — UPDATE/DELETE already use the
same shape), restore the prior open INSERT:

```sql
DROP POLICY IF EXISTS "timesheet_entries_insert" ON timesheet_entries;
CREATE POLICY "timesheet_entries_insert" ON timesheet_entries
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM timesheets t
            WHERE t.id = timesheet_id AND t.user_id = auth.uid())
  );
```

This re-opens the approval-bypass — only do it as an emergency unblock,
then file a follow-up to fix it properly.

## After it ships

Update `docs/STATUS_DASHBOARD.md` §3 — flip the Apply column for this
file to ✅ + the date.

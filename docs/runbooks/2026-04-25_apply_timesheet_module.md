# Apply Timesheet Module to pactdb

**Date:** 25 April 2026
**Audience:** PACT super-admin (manual SQL paster)
**Migration file in repo:** `supabase/migrations/20260409_timesheet_module.sql`
**Apply mode:** Manual paste into the pactdb Supabase SQL editor.
**Estimated time:** ~30 seconds for the paste, plus a minute to verify.

## Why this runbook exists

The Timesheet page (`/timesheet`) reads from two tables:

- `timesheets` — one row per user per week (the parent record with status,
  approver, etc.)
- `timesheet_entries` — one row per day inside a weekly parent

When neither table exists, the page now shows a yellow **"Setup required"**
banner that points to *this* runbook. After you apply the SQL below the banner
disappears and the page works normally.

## What the migration creates

- Tables: `timesheets`, `timesheet_entries` (both with RLS enabled)
- Columns on `timesheets`: `id`, `user_id`, `week_start (date)`, `status`,
  `submitted_at`, `approved_by`, `approved_at`, `reject_comment`,
  `created_at`, `updated_at`
- Columns on `timesheet_entries`: `id`, `timesheet_id`, `project_id`, `task_id`,
  `task_type`, `date`, `start_time`, `end_time`, `break_minutes`, `hours`,
  `description`, `is_billable`, `created_at`, `updated_at`
- A unique constraint on `(user_id, week_start)` so each employee has only one
  parent per week
- RLS policies so users can only see/edit their own timesheets, supervisors
  can see direct reports, and admins can see everything

## Pre-flight check (2 queries)

Paste these in the pactdb SQL editor first.

**(a) Are the new tables already there?**

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('timesheets', 'timesheet_entries');
```

- Returns **0 rows** → tables are missing, continue.
- Returns **2 rows** → tables already exist; the banner shouldn't be showing.
  Skip to the verification step at the bottom and report what you see.

**(b) Is there a leftover OLD flat-model `timesheets` table to migrate from?**

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'timesheets'
  AND column_name = 'date';
```

- Returns **0 rows** → no old table; the script will run the clean-install
  branch and just create both tables fresh.
- Returns **1 row** → old daily-row table exists; the script will rename it,
  back-fill weekly parents from the daily rows (Monday-of-week grouping),
  back-fill per-day entries, then drop the old table. No manual fix-ups
  needed — the script handles both cases automatically.

## Apply the migration

1. Open the pactdb Supabase project (`abznugnirnlrqnnfkein`) → **SQL editor**
   → **New query**.
2. In the Replit file tree, open `supabase/migrations/20260409_timesheet_module.sql`.
3. **Select all** (Ctrl/Cmd + A) and **copy** the entire file contents.
4. Paste into the pactdb SQL editor.
5. Click **Run**.
6. Expect a "Success. No rows returned" message. If you get an error, copy it
   and ping the agent — do not retry blindly.

## Verify

Paste the pre-flight query again — it should now return both `timesheets` and
`timesheet_entries`. Then in the app:

1. Go to `/timesheet`.
2. The yellow "Setup required" banner is gone.
3. The "My Week" tab shows a fresh empty week (Mon–Sun) you can log into.
4. Saving a row creates a `timesheets` parent and a `timesheet_entries` child
   in pactdb.

## Troubleshooting

If the SQL editor shows `column "week_start" does not exist` or any error
mentioning a column on the *old* `timesheets` table, you're running an
out-of-date copy of the script. Re-copy the **current** contents of
`supabase/migrations/20260409_timesheet_module.sql` from the repo and try
again — the in-repo version derives `week_start` from the daily `date`
column instead of trying to read it directly, so this error can't happen
with the current file.

If the entries back-fill complains about a missing column on the old table
(e.g. `task_type`, `start_time`, `break_minutes`, `is_billable`,
`description`), it means your old flat-model `timesheets` table is even
flatter than expected. Tell me which columns it actually has and I'll
adjust the back-fill SELECT to skip the missing ones.

## Roll-back (only if something goes badly wrong)

The migration is additive — it doesn't touch any existing table. To roll back:

```sql
DROP TABLE IF EXISTS public.timesheet_entries CASCADE;
DROP TABLE IF EXISTS public.timesheets CASCADE;
```

This is destructive (deletes all timesheet data). Only run it if no employees
have logged hours yet, or if you've taken a backup.

## After it ships

- Update `docs/STATUS_DASHBOARD.md` — add a "Timesheet module" entry under
  the apply registry with today's date and your initials.
- The "Setup required" banner will hide automatically on the next page load
  for everyone — no app restart needed.

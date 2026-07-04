# Runbook: Project Stage Deadline Reminder (pg_cron)

## What this does
Schedules a daily 06:30 UTC cron job that calls the `project-stage-deadline-reminder`
edge function. The function scans every active project's Project Flow stages
(`projects.custom_flow_stages`) for stages that have a deadline set (`dueDate` or
`plannedEnd`) and are not skipped or already completed. It sends an in-app +
email reminder to the stage's assignees (or the project team if no stage
assignees are set) at:

- 3 days before the deadline
- 1 day before the deadline
- on the deadline day
- once per day while the stage remains overdue and incomplete

Notifications are dispatched through `dispatch-notification` (event type
`project_stage_deadline_reminder`), so they show up in the in-app bell AND
send an email, exactly like other project notifications.

## Prerequisites
1. `pg_cron` extension enabled in Supabase Dashboard → Database → Extensions
2. `pg_net` extension enabled (same location)
3. The `project-stage-deadline-reminder` edge function deployed:
   ```
   supabase functions deploy project-stage-deadline-reminder
   ```
4. The `dispatch-notification` edge function already deployed with the
   `project_stage_deadline_reminder` event type (already included in this repo).
5. `CRON_SECRET` and `APP_URL` set as secrets on the
   `project-stage-deadline-reminder` function (same `CRON_SECRET` used by the
   other cron functions, e.g. `task-daily-digest`).

## Step 1 — Set the required PostgreSQL runtime settings
Skip this step if you've already run it for another cron job (e.g.
`task-daily-digest`) on this database — the same GUCs are reused.

Run the following in **Supabase Dashboard → SQL Editor**, replacing the values
with your actual project URL and cron secret:

```sql
ALTER DATABASE postgres
  SET "app.supabase_url" = 'https://abznugnirnlrqnnfkein.supabase.co';

ALTER DATABASE postgres
  SET "app.cron_secret" = 'YOUR_CRON_SECRET_VALUE';
```

> **Security note:** Treat `app.cron_secret` like a password — it is only
> readable by database superusers and functions with `SECURITY DEFINER`.
> Never expose it in client-side code or logs.

## Step 2 — Apply the cron schedule
After setting the runtime settings above, run the migration in the SQL Editor:

```sql
\i supabase/migrations/20260704_project_stage_deadline_reminder_cron.sql
```

Or paste the file contents directly into the SQL Editor.

## Step 3 — Verify the job is registered

```sql
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'project-stage-deadline-reminder';
```

Expected output:
```
 jobid | jobname                          | schedule   | active
-------+-----------------------------------+------------+--------
   N   | project-stage-deadline-reminder  | 30 6 * * * | t
```

## Step 4 — Test immediately (optional)

```sql
SELECT cron.run_job('project-stage-deadline-reminder');
```

Then check the notifications table:
```sql
SELECT title, message, created_at
FROM notifications
WHERE type = 'project_stage_deadline_reminder'
ORDER BY created_at DESC
LIMIT 10;
```

You can also check the dedup/audit trail:
```sql
SELECT entity_id, description, created_at
FROM audit_logs
WHERE module = 'project_stage_reminder'
ORDER BY created_at DESC
LIMIT 20;
```

## Removing the job

```sql
SELECT cron.unschedule('project-stage-deadline-reminder');
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ERROR: unrecognized configuration parameter "app.supabase_url"` | Step 1 not run | Run the `ALTER DATABASE` commands first |
| Job registered but no notifications appear | Edge function not deployed, or no stages have a `dueDate` | Deploy the function; confirm stages have `dueDate`/`plannedEnd` set in Project Flow |
| Reminder repeats every run instead of once/day | `audit_logs` dedup window (22h) not being written | Check the function has insert permission on `audit_logs` |
| No email received | `email_notify_project_milestones` preference disabled for the recipient, or `send_email` not reaching `dispatch-notification` | Check user notification preferences; confirm `SUPABASE_SERVICE_ROLE_KEY` is set on the reminder function |
| Notifications sent to wrong people | Stage has explicit assignees you didn't expect | Check `project_stage_assignees` for that project/stage — it takes priority over the team fallback |

## Related files
- `supabase/migrations/20260704_project_stage_deadline_reminder_cron.sql` — the cron schedule SQL
- `supabase/functions/project-stage-deadline-reminder/index.ts` — the edge function
- `supabase/functions/dispatch-notification/index.ts` — notification dispatch (event: `project_stage_deadline_reminder`)
- `src/hooks/useProjectFlow.ts` — `CustomStageEntry` type (`dueDate`, `plannedEnd`, `skipped`)
- `src/components/project/ProjectDetail.tsx` — Project Flow tab (`?tab=flow`)

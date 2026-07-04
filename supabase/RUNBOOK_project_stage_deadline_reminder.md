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

## Step 1 — Store the cron secret in Supabase Vault
Hosted Supabase projects reject `ALTER DATABASE ... SET` for custom settings
(you'll see `permission denied to set parameter`), even from the SQL Editor.
Use Supabase Vault instead — it's built for exactly this.

Run the following in **Supabase Dashboard → SQL Editor**, replacing the value
with your actual cron secret (the same value the edge function's
`CRON_SECRET` environment variable is set to):

```sql
SELECT vault.create_secret('YOUR_CRON_SECRET_VALUE', 'cron_secret');
```

Skip this step if a secret named `cron_secret` already exists from another
cron job (e.g. `task-daily-digest`) — it will be reused automatically.

The project URL isn't sensitive, so it's hardcoded directly in the migration
SQL — no setup needed for that part.

> **Security note:** Vault secrets are encrypted at rest and only readable
> via `vault.decrypted_secrets` by database roles with the right grants
> (the default `postgres`/service role has access). Never expose the secret
> value in client-side code or logs.

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
| `ERROR: 42501: permission denied to set parameter "app.supabase_url"` | You tried `ALTER DATABASE ... SET` — hosted Supabase blocks this | Not needed with this migration — it uses Vault + a hardcoded URL instead. Just run Step 1 (`vault.create_secret`) and Step 2 |
| `ERROR: relation "vault.decrypted_secrets" does not exist` or similar Vault error | Vault extension not enabled | Enable it in Dashboard → Database → Extensions → search "supabase_vault" |
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

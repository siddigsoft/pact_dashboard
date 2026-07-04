-- Project Stage Deadline Reminder: pg_cron schedule for
-- project-stage-deadline-reminder Edge Function.
-- Sends in-app + email reminders for project flow stages that have a
-- dueDate/plannedEnd set, at 3 days before, 1 day before, on the due date,
-- and once per day while overdue.
-- Requires: pg_cron + pg_net extensions enabled, and the
-- project-stage-deadline-reminder edge function deployed.
-- Requires the same "app.supabase_url" / "app.cron_secret" GUCs already used
-- by task-daily-digest (see supabase/RUNBOOK_project_stage_deadline_reminder.md
-- if they are not yet set on this database).

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove old schedule if it exists (idempotent redeploy)
SELECT cron.unschedule('project-stage-deadline-reminder')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'project-stage-deadline-reminder'
);

-- Schedule: every day at 06:30 UTC
-- project-stage-deadline-reminder expects: Authorization: Bearer <CRON_SECRET>
-- (matching the check in supabase/functions/project-stage-deadline-reminder/index.ts)
SELECT cron.schedule(
  'project-stage-deadline-reminder',
  '30 6 * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/project-stage-deadline-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.cron_secret', true)
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Setup instructions for DB GUCs (run once, not part of migration, skip if
-- already set for another cron job on this database):
--   ALTER DATABASE postgres SET "app.supabase_url" = 'https://abznugnirnlrqnnfkein.supabase.co';
--   ALTER DATABASE postgres SET "app.cron_secret" = '<CRON_SECRET_VALUE>';
-- Alternatively, schedule via Supabase Dashboard → Edge Functions → Schedules.

-- Project Stage Deadline Reminder: pg_cron schedule for
-- project-stage-deadline-reminder Edge Function.
-- Sends in-app + email reminders for project flow stages that have a
-- dueDate/plannedEnd set, at 3 days before, 1 day before, on the due date,
-- and once per day while overdue.
-- Requires: pg_cron + pg_net extensions enabled, and the
-- project-stage-deadline-reminder edge function deployed.
--
-- NOTE: This uses Supabase Vault to store the cron secret instead of
-- `ALTER DATABASE ... SET`, because hosted Supabase projects reject custom
-- GUCs with "permission denied to set parameter" even for the postgres role.
-- The project URL is not sensitive, so it is hardcoded directly below.
--
-- BEFORE running this file, store the cron secret in Vault (run once, in the
-- Supabase Dashboard → SQL Editor):
--
--   SELECT vault.create_secret('YOUR_CRON_SECRET_VALUE', 'cron_secret');
--
-- (If a secret named 'cron_secret' already exists from another cron job,
-- e.g. task-daily-digest, you can reuse it — skip this step.)

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
      url := 'https://abznugnirnlrqnnfkein.supabase.co/functions/v1/project-stage-deadline-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'
        )
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Alternatively, schedule via Supabase Dashboard → Edge Functions → Schedules,
-- which handles auth for you without any of the above SQL.

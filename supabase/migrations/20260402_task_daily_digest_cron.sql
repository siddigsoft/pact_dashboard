-- Task #10: pg_cron schedule for task-daily-digest Edge Function
-- Triggers the daily task summary email for all users at 07:00 UTC every day.
-- Requires: pg_cron extension enabled and SUPABASE_URL / task-daily-digest deployed.

-- Enable pg_cron extension (idempotent — no-op if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove old schedule if it exists (idempotent redeploy)
SELECT cron.unschedule('task-daily-digest')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'task-daily-digest'
);

-- Schedule: every day at 07:00 UTC
-- task-daily-digest expects: Authorization: Bearer <CRON_SECRET>
-- (matching the check in supabase/functions/task-daily-digest/index.ts)
SELECT cron.schedule(
  'task-daily-digest',
  '0 7 * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/task-daily-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.cron_secret', true)
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Setup instructions for DB GUCs (run once, not part of migration):
--   ALTER DATABASE postgres SET "app.supabase_url" = 'https://abznugnirnlrqnnfkein.supabase.co';
--   ALTER DATABASE postgres SET "app.cron_secret" = '<CRON_SECRET_VALUE>';
-- Alternatively, schedule via Supabase Dashboard → Edge Functions → Schedules.

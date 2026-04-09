-- Task #26: pg_cron schedule for subscription-renewal-check Edge Function
-- Triggers a daily subscription renewal and cost-threshold check at 08:00 UTC.
-- Follows the same pattern as task-daily-digest cron (20260402_task_daily_digest_cron.sql).
--
-- The function expects: Authorization: Bearer <CRON_SECRET>
-- (matching the isAuthorized() check in supabase/functions/subscription-renewal-check/index.ts)
--
-- Requires pg_cron and pg_net extensions (both available on Supabase by default).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove existing schedule (idempotent redeploy)
SELECT cron.unschedule('subscription-renewal-daily-check')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'subscription-renewal-daily-check'
);

-- Schedule: every day at 08:00 UTC
SELECT cron.schedule(
  'subscription-renewal-daily-check',
  '0 8 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/subscription-renewal-check',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.cron_secret', true)
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- Setup instructions (run once per environment, not part of migration):
--   ALTER DATABASE postgres SET "app.supabase_url" = 'https://<project-ref>.supabase.co';
--   ALTER DATABASE postgres SET "app.cron_secret"  = '<CRON_SECRET_VALUE>';
-- Alternatively, schedule via Supabase Dashboard → Edge Functions → Schedules.

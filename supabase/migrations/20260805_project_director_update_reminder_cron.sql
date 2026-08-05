-- Project Director Update reminders: daily cron for
-- project-director-update-reminder Edge Function.
-- Requires: pg_cron + vault secret named 'cron_secret' (same as other jobs).
--
-- BEFORE first run (once per env, if not already done):
--   SELECT vault.create_secret('YOUR_CRON_SECRET_VALUE', 'cron_secret');

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('project-director-update-reminder')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'project-director-update-reminder'
);

-- Daily at 07:00 UTC (after stage deadline reminder at 06:30)
SELECT cron.schedule(
  'project-director-update-reminder',
  '0 7 * * *',
  $$
    SELECT net.http_post(
      url := 'https://abznugnirnlrqnnfkein.supabase.co/functions/v1/project-director-update-reminder',
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

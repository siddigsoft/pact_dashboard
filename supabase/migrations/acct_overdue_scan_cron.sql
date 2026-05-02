-- ============================================================
-- PACT Accounting: Nightly Overdue Scan — pg_cron Schedule
-- ============================================================
-- Prerequisites:
--   1. pg_cron extension must be enabled (Supabase Dashboard → Extensions → pg_cron)
--   2. pg_net extension must be enabled (Supabase Dashboard → Extensions → pg_net)
--   3. The acct-overdue-scan edge function must be deployed
--      (supabase/functions/acct-overdue-scan/index.ts)
--
-- How to apply:
--   Run this script via the Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- To verify the job was registered:
--   SELECT jobid, schedule, command FROM cron.job WHERE jobname = 'acct-overdue-scan';
--
-- To manually trigger the job immediately:
--   SELECT cron.run_job('acct-overdue-scan');
--
-- To remove the job:
--   SELECT cron.unschedule('acct-overdue-scan');
-- ============================================================

-- Enable required extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any existing schedule with this name before re-registering
SELECT cron.unschedule('acct-overdue-scan') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'acct-overdue-scan'
);

-- Schedule the edge function to run every day at 06:00 UTC
-- Cron expression: minute hour day month weekday
SELECT cron.schedule(
  'acct-overdue-scan',         -- unique job name
  '0 6 * * *',                 -- daily at 06:00 UTC
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url')
                 || '/functions/v1/acct-overdue-scan',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);

-- Confirm registration
SELECT
  jobid,
  jobname,
  schedule,
  active,
  database
FROM cron.job
WHERE jobname = 'acct-overdue-scan';

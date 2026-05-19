-- ============================================================
-- Auto-Close Expired Surveys (pg_cron scheduled job)
-- Apply in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Enable pg_cron (skip if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Function that closes any active survey whose deadline has passed
CREATE OR REPLACE FUNCTION close_expired_surveys()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE surveys
  SET    status = 'closed'
  WHERE  status = 'active'
    AND  (settings->>'expires_at') IS NOT NULL
    AND  (settings->>'expires_at')::timestamptz < NOW();
END;
$$;

-- 3. Remove existing job if it exists (safe first-run)
DO $$
BEGIN
  PERFORM cron.unschedule('close-expired-surveys');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- 4. Schedule: run every 15 minutes
SELECT cron.schedule(
  'close-expired-surveys',
  '*/15 * * * *',
  'SELECT close_expired_surveys()'
);

-- ============================================================
-- To verify the job is registered:
--   SELECT jobname, schedule, command FROM cron.job;
--
-- To remove the job later:
--   SELECT cron.unschedule('close-expired-surveys');
-- ============================================================

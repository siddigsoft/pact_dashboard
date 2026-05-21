-- ============================================================
-- Survey Deadline Reminder — Supabase Cron Setup Runbook
-- ============================================================
-- Run this SQL in the Supabase Dashboard → SQL Editor once to
-- register the daily cron job that sends deadline reminders.
--
-- Prerequisites:
--   1. The `survey-deadline-reminder` edge function is deployed.
--   2. CRON_SECRET is set in Supabase Edge Function secrets.
--   3. APP_URL is set in Supabase Edge Function secrets.
-- ============================================================

-- 1. Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;

-- 3. Schedule the job — daily at 08:00 UTC
SELECT cron.schedule(
  'survey-deadline-reminder-daily',       -- job name (unique)
  '0 8 * * *',                            -- cron expression: every day at 08:00 UTC
  $$
  SELECT net.http_post(
    url     := current_setting('app.settings.supabase_url') || '/functions/v1/survey-deadline-reminder',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ── Alternative: if net.http_post is not available, use pg_net directly ────────
-- SELECT
--   net.http_post(
--     url     := '<YOUR_SUPABASE_URL>/functions/v1/survey-deadline-reminder',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer <YOUR_CRON_SECRET>"}'::jsonb,
--     body    := '{}'::jsonb
--   );

-- ── To verify the job was registered ──────────────────────────────────────────
SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE jobname = 'survey-deadline-reminder-daily';

-- ── To unschedule (if needed) ─────────────────────────────────────────────────
-- SELECT cron.unschedule('survey-deadline-reminder-daily');

-- ============================================================
-- Manual test (run from SQL Editor to trigger immediately):
-- ============================================================
-- Replace <YOUR_SUPABASE_URL> and <YOUR_CRON_SECRET> below:
--
-- SELECT net.http_post(
--   url     := '<YOUR_SUPABASE_URL>/functions/v1/survey-deadline-reminder',
--   headers := jsonb_build_object(
--     'Content-Type',  'application/json',
--     'Authorization', 'Bearer <YOUR_CRON_SECRET>'
--   ),
--   body    := '{}'::jsonb
-- );
-- ============================================================
-- How reminders are configured per survey (in survey settings JSONB):
-- ============================================================
--   reminder_enabled      boolean   -- true = active
--   reminder_emails       text      -- comma-separated emails
--   reminder_phones       text      -- comma-separated intl WhatsApp numbers
--   reminder_days_before  text      -- e.g. "1,3,7" (days before deadline)
--
-- The cron checks how many full days remain until expires_at and sends
-- reminders only on matching days. It deduplicates via audit_logs so
-- it won't send twice even if the cron runs slightly off schedule.
-- ============================================================

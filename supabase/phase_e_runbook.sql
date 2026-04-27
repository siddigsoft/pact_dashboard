-- =============================================================================
-- PHASE E RUNBOOK — Repayment Overdue Escalation Cron Setup
-- =============================================================================
-- This file is a reference / runbook only. Run these statements manually
-- in the Supabase Dashboard > SQL Editor after deploying the edge function.
--
-- Edge function to deploy: supabase/functions/check-repayment-overdue/index.ts
-- Deploy with: supabase functions deploy check-repayment-overdue
--
-- Required environment variables on the edge function:
--   SUPABASE_URL           (auto-set by Supabase)
--   SUPABASE_SERVICE_ROLE_KEY (auto-set by Supabase)
--   CRON_SECRET            (set in Edge Function secrets — same value as existing functions)
--   APP_URL                (e.g. https://app.pactorg.com — set in Edge Function secrets)
-- =============================================================================

-- STEP 1: Verify the escalation flag columns exist on cost_recovery_log
-- (These were added in phase_b_migration.sql — just confirming)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'cost_recovery_log'
  AND column_name IN ('escalation_day0_sent', 'escalation_day7_sent', 'escalation_day14_sent');

-- If any column is missing, run:
-- ALTER TABLE public.cost_recovery_log ADD COLUMN IF NOT EXISTS escalation_day0_sent  boolean DEFAULT false;
-- ALTER TABLE public.cost_recovery_log ADD COLUMN IF NOT EXISTS escalation_day7_sent  boolean DEFAULT false;
-- ALTER TABLE public.cost_recovery_log ADD COLUMN IF NOT EXISTS escalation_day14_sent boolean DEFAULT false;


-- STEP 2: Register the daily cron job via pg_cron
-- Runs at 06:00 UTC every day.
-- Replace <PROJECT_REF> and <CRON_SECRET> with your actual values.

-- Enable pg_cron extension (if not already enabled):
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Register the cron job:
SELECT cron.schedule(
  'repayment-overdue-daily',                     -- job name (unique)
  '0 6 * * *',                                   -- every day at 06:00 UTC
  $$
    SELECT net.http_post(
      url := 'https://<PROJECT_REF>.functions.supabase.co/check-repayment-overdue',
      headers := '{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);

-- Verify the job is registered:
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'repayment-overdue-daily';


-- STEP 3: Test the edge function manually
-- curl -X POST https://<PROJECT_REF>.functions.supabase.co/check-repayment-overdue \
--   -H "x-cron-secret: <CRON_SECRET>" \
--   -H "Content-Type: application/json"
-- Expected response: {"status":"ok","processed":N,"errors":0}


-- STEP 4: To remove the cron job (if needed):
-- SELECT cron.unschedule('repayment-overdue-daily');


-- STEP 5: Seed a test row to verify escalation (in a dev environment only):
-- INSERT INTO public.cost_recovery_log (
--   site_entry_id, mmp_id, amount, amount_currency,
--   decision, enumerator_name, repayment_method, repayment_deadline, repayment_status,
--   decided_by, decided_by_name, decided_by_role
-- ) VALUES (
--   '<some-site-entry-id>',
--   '<some-mmp-id>',
--   1000, 'SDG',
--   'return_required',
--   'Test Enumerator',
--   'cash',
--   (CURRENT_DATE - INTERVAL '1 day')::date,  -- deadline was yesterday = Day 0 overdue
--   'pending',
--   auth.uid(),
--   'Admin Test',
--   'admin'
-- );
-- Then invoke the edge function and check notifications table.

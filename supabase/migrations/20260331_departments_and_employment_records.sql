-- ============================================================
-- Task #9: Departments & Employee Records Module
-- ============================================================
-- Creates the departments table, extends profiles with
-- employment record columns, and schedules the daily
-- contract-expiry check via pg_cron + pg_net.
-- ============================================================

-- 0. Ensure required extensions are available
--    (These are enabled by default on Supabase; guarded for safety)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. departments table
CREATE TABLE IF NOT EXISTS departments (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name                 TEXT NOT NULL,
  description          TEXT,
  parent_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  manager_user_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  hub_id               UUID,
  color                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_departments_parent  ON departments(parent_department_id);
CREATE INDEX IF NOT EXISTS idx_departments_manager ON departments(manager_user_id);

-- 2. Extend profiles with employment record columns
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS department_id       UUID REFERENCES departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS employment_type     TEXT CHECK (employment_type IN ('full-time','part-time','contractor','intern')) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contract_start_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contract_end_date   DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reports_to          UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_department   ON profiles(department_id);
CREATE INDEX IF NOT EXISTS idx_profiles_reports_to   ON profiles(reports_to);
CREATE INDEX IF NOT EXISTS idx_profiles_contract_end ON profiles(contract_end_date)
  WHERE contract_end_date IS NOT NULL;

-- 3. Row Level Security for departments
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

-- Idempotent policy setup (DROP IF EXISTS + CREATE is safe for policies)
DROP POLICY IF EXISTS "departments_select_authenticated" ON departments;
CREATE POLICY "departments_select_authenticated"
  ON departments FOR SELECT
  TO authenticated
  USING (true);

-- super_admin can perform all write operations on departments
DROP POLICY IF EXISTS "departments_all_super_admin" ON departments;
CREATE POLICY "departments_all_super_admin"
  ON departments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND LOWER(profiles.role) IN ('super_admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND LOWER(profiles.role) IN ('super_admin', 'superadmin')
    )
  );

-- 4. Schedule daily contract-expiry check at 08:00 UTC via pg_cron
-- REQUIREMENTS before applying in each target environment:
--   ALTER DATABASE postgres SET app.settings.supabase_url  = 'https://<project>.supabase.co';
--   ALTER DATABASE postgres SET app.settings.cron_secret   = '<your-CRON_SECRET-value>';
-- The CRON_SECRET must match the CRON_SECRET edge-function secret set in the Supabase Dashboard.
-- If either setting is absent the cron job is NOT scheduled and a NOTICE is raised.
DO $$
DECLARE
  v_project_url TEXT;
  v_cron_secret TEXT;
BEGIN
  v_project_url := current_setting('app.settings.supabase_url', true);
  v_cron_secret := current_setting('app.settings.cron_secret', true);

  IF v_project_url IS NULL OR v_project_url = '' THEN
    RAISE NOTICE 'app.settings.supabase_url is not set — skipping contract-expiry-daily cron schedule.';
    RETURN;
  END IF;

  IF v_cron_secret IS NULL OR v_cron_secret = '' THEN
    RAISE NOTICE 'app.settings.cron_secret is not set — skipping contract-expiry-daily cron schedule.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'contract-expiry-daily') THEN
    PERFORM cron.unschedule('contract-expiry-daily');
  END IF;

  PERFORM cron.schedule(
    'contract-expiry-daily',
    '0 8 * * *',
    format(
      $$SELECT net.http_post(
          url     := '%s/functions/v1/contract-expiry-check',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', %L
          ),
          body    := '{}'::jsonb
      ) AS request_id$$,
      v_project_url,
      v_cron_secret
    )
  );
END;
$$;

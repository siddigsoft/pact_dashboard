-- ============================================================
-- Task #9: Departments & Employee Records Module
-- ============================================================
-- Creates the departments table with self-referencing nested
-- structure, extends profiles with employment record fields,
-- and schedules the daily contract-expiry check via pg_cron.
-- ============================================================

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

-- Drop and recreate policies idempotently (DROP IF EXISTS is safe for policies)
DROP POLICY IF EXISTS "departments_select_authenticated" ON departments;
CREATE POLICY "departments_select_authenticated"
  ON departments FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "departments_all_super_admin" ON departments;
CREATE POLICY "departments_all_super_admin"
  ON departments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'superadmin')
    )
  );

-- 4. Schedule daily contract-expiry check at 08:00 UTC via pg_cron
-- This calls the contract-expiry-check Supabase Edge Function.
-- Idempotent: removes existing job with the same name before creating.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'contract-expiry-daily') THEN
    PERFORM cron.unschedule('contract-expiry-daily');
  END IF;
  PERFORM cron.schedule(
    'contract-expiry-daily',
    '0 8 * * *',
    $$SELECT net.http_post(
        url     := 'https://abznugnirnlrqnnfkein.supabase.co/functions/v1/contract-expiry-check',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body    := '{}'::jsonb
    ) AS request_id$$
  );
END;
$$;

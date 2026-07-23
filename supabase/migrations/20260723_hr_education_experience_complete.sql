-- ============================================================
-- COMPLETE SETUP: Education & Experience tables + RLS
-- Safe to run multiple times (idempotent).
-- Run this in Supabase SQL Editor.
-- ============================================================

-- ── 1. Helper function (create if not already present) ───────────────────────
CREATE OR REPLACE FUNCTION public.is_hr_admin_tier()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND lower(role) IN ('admin','super_admin','superadmin','hr_admin','ict','fom')
  );
$$;

-- ── 2. Education table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hr_employee_education (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  degree_level     TEXT NOT NULL,
  institution      TEXT NOT NULL,
  field_of_study   TEXT,
  graduation_year  INTEGER,
  country          TEXT,
  grade            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_employee_education_profile_id
  ON public.hr_employee_education (profile_id);

ALTER TABLE public.hr_employee_education ENABLE ROW LEVEL SECURITY;

-- Drop all old policy variants (safe even if they don't exist)
DO $$ BEGIN
  DROP POLICY IF EXISTS "hr_edu_select"       ON public.hr_employee_education;
  DROP POLICY IF EXISTS "hr_edu_insert"       ON public.hr_employee_education;
  DROP POLICY IF EXISTS "hr_edu_update"       ON public.hr_employee_education;
  DROP POLICY IF EXISTS "hr_edu_delete"       ON public.hr_employee_education;
  DROP POLICY IF EXISTS "hr_education_select" ON public.hr_employee_education;
  DROP POLICY IF EXISTS "hr_education_insert" ON public.hr_employee_education;
  DROP POLICY IF EXISTS "hr_education_update" ON public.hr_employee_education;
  DROP POLICY IF EXISTS "hr_education_delete" ON public.hr_employee_education;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "hr_education_select" ON public.hr_employee_education
  FOR SELECT USING (auth.uid() = profile_id OR public.is_hr_admin_tier());

CREATE POLICY "hr_education_insert" ON public.hr_employee_education
  FOR INSERT WITH CHECK (auth.uid() = profile_id OR public.is_hr_admin_tier());

CREATE POLICY "hr_education_update" ON public.hr_employee_education
  FOR UPDATE USING (auth.uid() = profile_id OR public.is_hr_admin_tier());

CREATE POLICY "hr_education_delete" ON public.hr_employee_education
  FOR DELETE USING (auth.uid() = profile_id OR public.is_hr_admin_tier());

-- ── 3. Experience table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hr_employee_experience (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  employer            TEXT NOT NULL,
  job_title           TEXT NOT NULL,
  employment_type     TEXT,
  start_date          DATE NOT NULL,
  end_date            DATE,
  is_current          BOOLEAN NOT NULL DEFAULT FALSE,
  description         TEXT,
  achievements        TEXT,
  location            TEXT,
  sector              TEXT,
  supervisor_name     TEXT,
  reason_for_leaving  TEXT,
  reference_available BOOLEAN NOT NULL DEFAULT FALSE,
  reference_name      TEXT,
  reference_contact   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add new comprehensive columns to existing tables (safe for re-runs)
ALTER TABLE public.hr_employee_experience ADD COLUMN IF NOT EXISTS employment_type     TEXT;
ALTER TABLE public.hr_employee_experience ADD COLUMN IF NOT EXISTS achievements        TEXT;
ALTER TABLE public.hr_employee_experience ADD COLUMN IF NOT EXISTS supervisor_name     TEXT;
ALTER TABLE public.hr_employee_experience ADD COLUMN IF NOT EXISTS reason_for_leaving  TEXT;
ALTER TABLE public.hr_employee_experience ADD COLUMN IF NOT EXISTS reference_available BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.hr_employee_experience ADD COLUMN IF NOT EXISTS reference_name      TEXT;
ALTER TABLE public.hr_employee_experience ADD COLUMN IF NOT EXISTS reference_contact   TEXT;

CREATE INDEX IF NOT EXISTS idx_hr_employee_experience_profile_id
  ON public.hr_employee_experience (profile_id);

ALTER TABLE public.hr_employee_experience ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "hr_exp_select"        ON public.hr_employee_experience;
  DROP POLICY IF EXISTS "hr_exp_insert"        ON public.hr_employee_experience;
  DROP POLICY IF EXISTS "hr_exp_update"        ON public.hr_employee_experience;
  DROP POLICY IF EXISTS "hr_exp_delete"        ON public.hr_employee_experience;
  DROP POLICY IF EXISTS "hr_experience_select" ON public.hr_employee_experience;
  DROP POLICY IF EXISTS "hr_experience_insert" ON public.hr_employee_experience;
  DROP POLICY IF EXISTS "hr_experience_update" ON public.hr_employee_experience;
  DROP POLICY IF EXISTS "hr_experience_delete" ON public.hr_employee_experience;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "hr_experience_select" ON public.hr_employee_experience
  FOR SELECT USING (auth.uid() = profile_id OR public.is_hr_admin_tier());

CREATE POLICY "hr_experience_insert" ON public.hr_employee_experience
  FOR INSERT WITH CHECK (auth.uid() = profile_id OR public.is_hr_admin_tier());

CREATE POLICY "hr_experience_update" ON public.hr_employee_experience
  FOR UPDATE USING (auth.uid() = profile_id OR public.is_hr_admin_tier());

CREATE POLICY "hr_experience_delete" ON public.hr_employee_experience
  FOR DELETE USING (auth.uid() = profile_id OR public.is_hr_admin_tier());

-- ── 4. updated_at triggers ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_hr_edu_updated_at ON public.hr_employee_education;
CREATE TRIGGER trg_hr_edu_updated_at
  BEFORE UPDATE ON public.hr_employee_education
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_hr_exp_updated_at ON public.hr_employee_experience;
CREATE TRIGGER trg_hr_exp_updated_at
  BEFORE UPDATE ON public.hr_employee_experience
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 5. PostgREST schema reload ────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

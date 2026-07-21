-- ================================================================
-- Create hr_employee_education and hr_employee_experience tables
-- Run in Supabase SQL Editor
-- ================================================================

-- ── Education ────────────────────────────────────────────────────
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

CREATE POLICY "hr_edu_select" ON public.hr_employee_education FOR SELECT USING (
  auth.uid() = profile_id
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('Admin','SuperAdmin','HR_Admin','hr_admin'))
);
CREATE POLICY "hr_edu_insert" ON public.hr_employee_education FOR INSERT WITH CHECK (
  auth.uid() = profile_id
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('Admin','SuperAdmin','HR_Admin','hr_admin'))
);
CREATE POLICY "hr_edu_update" ON public.hr_employee_education FOR UPDATE USING (
  auth.uid() = profile_id
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('Admin','SuperAdmin','HR_Admin','hr_admin'))
);
CREATE POLICY "hr_edu_delete" ON public.hr_employee_education FOR DELETE USING (
  auth.uid() = profile_id
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('Admin','SuperAdmin','HR_Admin','hr_admin'))
);

-- ── Work Experience ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hr_employee_experience (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  employer    TEXT NOT NULL,
  job_title   TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE,
  is_current  BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  location    TEXT,
  sector      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_employee_experience_profile_id
  ON public.hr_employee_experience (profile_id);

ALTER TABLE public.hr_employee_experience ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_exp_select" ON public.hr_employee_experience FOR SELECT USING (
  auth.uid() = profile_id
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('Admin','SuperAdmin','HR_Admin','hr_admin'))
);
CREATE POLICY "hr_exp_insert" ON public.hr_employee_experience FOR INSERT WITH CHECK (
  auth.uid() = profile_id
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('Admin','SuperAdmin','HR_Admin','hr_admin'))
);
CREATE POLICY "hr_exp_update" ON public.hr_employee_experience FOR UPDATE USING (
  auth.uid() = profile_id
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('Admin','SuperAdmin','HR_Admin','hr_admin'))
);
CREATE POLICY "hr_exp_delete" ON public.hr_employee_experience FOR DELETE USING (
  auth.uid() = profile_id
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('Admin','SuperAdmin','HR_Admin','hr_admin'))
);

-- Auto-update updated_at (reuse function created in dependents migration)
DROP TRIGGER IF EXISTS trg_hr_edu_updated_at ON public.hr_employee_education;
CREATE TRIGGER trg_hr_edu_updated_at
  BEFORE UPDATE ON public.hr_employee_education
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_hr_exp_updated_at ON public.hr_employee_experience;
CREATE TRIGGER trg_hr_exp_updated_at
  BEFORE UPDATE ON public.hr_employee_experience
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';

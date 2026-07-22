-- ================================================================
-- Fix RLS policies for hr_employee_education & hr_employee_experience
-- Uses the is_hr_admin_tier() helper created in the dependents fix.
-- Run AFTER: 20260723_hr_employee_dependents_rls_fix.sql
-- ================================================================

-- ── Education ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "hr_edu_select"    ON public.hr_employee_education;
DROP POLICY IF EXISTS "hr_edu_insert"    ON public.hr_employee_education;
DROP POLICY IF EXISTS "hr_edu_update"    ON public.hr_employee_education;
DROP POLICY IF EXISTS "hr_edu_delete"    ON public.hr_employee_education;
DROP POLICY IF EXISTS "hr_education_select" ON public.hr_employee_education;
DROP POLICY IF EXISTS "hr_education_insert" ON public.hr_employee_education;
DROP POLICY IF EXISTS "hr_education_update" ON public.hr_employee_education;
DROP POLICY IF EXISTS "hr_education_delete" ON public.hr_employee_education;

CREATE POLICY "hr_education_select" ON public.hr_employee_education
  FOR SELECT USING (
    auth.uid() = profile_id OR public.is_hr_admin_tier()
  );

CREATE POLICY "hr_education_insert" ON public.hr_employee_education
  FOR INSERT WITH CHECK (
    auth.uid() = profile_id OR public.is_hr_admin_tier()
  );

CREATE POLICY "hr_education_update" ON public.hr_employee_education
  FOR UPDATE USING (
    auth.uid() = profile_id OR public.is_hr_admin_tier()
  );

CREATE POLICY "hr_education_delete" ON public.hr_employee_education
  FOR DELETE USING (
    auth.uid() = profile_id OR public.is_hr_admin_tier()
  );

-- ── Experience ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "hr_exp_select"    ON public.hr_employee_experience;
DROP POLICY IF EXISTS "hr_exp_insert"    ON public.hr_employee_experience;
DROP POLICY IF EXISTS "hr_exp_update"    ON public.hr_employee_experience;
DROP POLICY IF EXISTS "hr_exp_delete"    ON public.hr_employee_experience;
DROP POLICY IF EXISTS "hr_experience_select" ON public.hr_employee_experience;
DROP POLICY IF EXISTS "hr_experience_insert" ON public.hr_employee_experience;
DROP POLICY IF EXISTS "hr_experience_update" ON public.hr_employee_experience;
DROP POLICY IF EXISTS "hr_experience_delete" ON public.hr_employee_experience;

CREATE POLICY "hr_experience_select" ON public.hr_employee_experience
  FOR SELECT USING (
    auth.uid() = profile_id OR public.is_hr_admin_tier()
  );

CREATE POLICY "hr_experience_insert" ON public.hr_employee_experience
  FOR INSERT WITH CHECK (
    auth.uid() = profile_id OR public.is_hr_admin_tier()
  );

CREATE POLICY "hr_experience_update" ON public.hr_employee_experience
  FOR UPDATE USING (
    auth.uid() = profile_id OR public.is_hr_admin_tier()
  );

CREATE POLICY "hr_experience_delete" ON public.hr_employee_experience
  FOR DELETE USING (
    auth.uid() = profile_id OR public.is_hr_admin_tier()
  );

NOTIFY pgrst, 'reload schema';

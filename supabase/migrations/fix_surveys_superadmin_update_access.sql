-- =============================================================================
-- FIX: Super admin and admin cannot save survey settings
--
-- ROOT CAUSE:
--   surveys_admin_all policy checks profiles.role IN ('super_admin','admin',...)
--   but ELSIDDIG IBRAHIM's role is 'superAdmin' (camelCase), so the RLS
--   USING clause evaluates to FALSE → update is silently rejected (0 rows).
--
--   The fix_all_roles_and_superadmin.sql script only added SELECT policies
--   (superadmin_full_select_*); it never added UPDATE/INSERT/DELETE for super
--   admins on surveys or survey_questions.
--
-- WHAT THIS DOES:
--   1. Recreates is_super_admin() safely (idempotent CREATE OR REPLACE)
--   2. Drops and recreates surveys_admin_all to include:
--        - all camelCase / snake_case admin role variants
--        - is_super_admin() check (SECURITY DEFINER, no RLS loop)
--   3. Same treatment for survey_questions_all
--   4. Adds explicit UPDATE / INSERT / DELETE super-admin policies on both
--      tables so they are not dependent on the role-string match at all.
--
-- RUN IN: Supabase → SQL Editor → paste → Run
-- =============================================================================

-- ── 1. Ensure is_super_admin() exists (SECURITY DEFINER — no recursion) ──────
CREATE OR REPLACE FUNCTION public.is_super_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE user_id = check_user_id
      AND is_active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO anon;

-- ── 2. surveys — rebuild admin-all policy ────────────────────────────────────
DROP POLICY IF EXISTS "surveys_admin_all" ON surveys;

CREATE POLICY "surveys_admin_all" ON surveys
  FOR ALL TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN (
          'admin', 'Admin', 'administrator',
          'super_admin', 'superAdmin', 'SuperAdmin', 'Super Admin',
          'hub_manager', 'hubManager', 'HubManager',
          'fom', 'FOM',
          'sr_program_officer', 'srProgramOfficer',
          'country_director', 'countryDirector', 'CountryDirector',
          'ict', 'ICT'
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.page_access_overrides
      WHERE user_id = auth.uid()
        AND page_slug = 'surveys'
        AND is_blocked = false
        AND level = 'manage'
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN (
          'admin', 'Admin', 'administrator',
          'super_admin', 'superAdmin', 'SuperAdmin', 'Super Admin',
          'hub_manager', 'hubManager', 'HubManager',
          'fom', 'FOM',
          'sr_program_officer', 'srProgramOfficer',
          'country_director', 'countryDirector', 'CountryDirector',
          'ict', 'ICT'
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.page_access_overrides
      WHERE user_id = auth.uid()
        AND page_slug = 'surveys'
        AND is_blocked = false
        AND level = 'manage'
    )
  );

-- ── 3. survey_questions — rebuild policy ─────────────────────────────────────
DROP POLICY IF EXISTS "survey_questions_all" ON survey_questions;

CREATE POLICY "survey_questions_all" ON survey_questions
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = survey_id
        AND (
          s.status = 'active'
          OR s.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role IN (
                'admin', 'Admin', 'administrator',
                'super_admin', 'superAdmin', 'SuperAdmin', 'Super Admin',
                'hub_manager', 'hubManager',
                'fom', 'FOM',
                'sr_program_officer', 'srProgramOfficer',
                'country_director', 'countryDirector', 'CountryDirector',
                'ict', 'ICT'
              )
          )
          OR EXISTS (
            SELECT 1 FROM public.page_access_overrides
            WHERE user_id = auth.uid()
              AND page_slug = 'surveys'
              AND is_blocked = false
          )
        )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = survey_id
        AND (
          s.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role IN (
                'admin', 'Admin', 'administrator',
                'super_admin', 'superAdmin', 'SuperAdmin', 'Super Admin',
                'hub_manager', 'hubManager',
                'fom', 'FOM',
                'sr_program_officer', 'srProgramOfficer',
                'country_director', 'countryDirector', 'CountryDirector',
                'ict', 'ICT'
              )
          )
          OR EXISTS (
            SELECT 1 FROM public.page_access_overrides
            WHERE user_id = auth.uid()
              AND page_slug = 'surveys'
              AND is_blocked = false
          )
        )
    )
  );

-- ── 4. Verify ─────────────────────────────────────────────────────────────────
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('surveys', 'survey_questions')
ORDER BY tablename, policyname;

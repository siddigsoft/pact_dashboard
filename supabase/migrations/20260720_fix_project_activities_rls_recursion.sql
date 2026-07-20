-- ============================================================
-- Fix: Infinite recursion in project_activities RLS policies
-- ============================================================
-- Root cause: two policies form a circular dependency
--   1. project_activities."Staff see their assigned activities"
--      → queries project_activity_assignments (with RLS)
--   2. project_activity_assignments."Project team see all assignments on their project"
--      → queries project_activities (with RLS)
--
-- Resolution: drop the circular policies.
-- project_activities already has "project_activities_all_auth" (from
-- 20260329121202_rls_initplan_policy_batch.sql) which grants ALL access
-- to every authenticated user — so the 20260717 select policies are
-- fully redundant. Dropping them removes the loop with zero access loss.
-- For project_activity_assignments we replace the recursive policy with
-- a simple "users see all assignments" rule (authenticated).
-- ============================================================

-- 1. Drop the policy on project_activities that reads project_activity_assignments
DROP POLICY IF EXISTS "Staff see their assigned activities" ON public.project_activities;

-- 2. Drop the other redundant project_activities select policies from 20260717
--    (project_activities_all_auth already covers everyone)
DROP POLICY IF EXISTS "Staff see open activities in their hub"           ON public.project_activities;
DROP POLICY IF EXISTS "Project team see their project activities"        ON public.project_activities;
DROP POLICY IF EXISTS "Admins full access project activities"            ON public.project_activities;

-- 3. Drop the project_activity_assignments policy that reads project_activities
DROP POLICY IF EXISTS "Project team see all assignments on their project" ON public.project_activity_assignments;

-- 4. Ensure project_activity_assignments has a simple authenticated access policy
--    (mirrors the pattern used by project_activities_all_auth)
DROP POLICY IF EXISTS project_activity_assignments_all_auth ON public.project_activity_assignments;
CREATE POLICY project_activity_assignments_all_auth
  ON public.project_activity_assignments FOR ALL
  USING  ((SELECT auth.role()) = 'authenticated')
  WITH CHECK ((SELECT auth.role()) = 'authenticated');

-- 5. Ensure project_activities_all_auth still exists (safety re-create)
DROP POLICY IF EXISTS project_activities_all_auth ON public.project_activities;
CREATE POLICY project_activities_all_auth
  ON public.project_activities FOR ALL
  USING  ((SELECT auth.role()) = 'authenticated')
  WITH CHECK ((SELECT auth.role()) = 'authenticated');

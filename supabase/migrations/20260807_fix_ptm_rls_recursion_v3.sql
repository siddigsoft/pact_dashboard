-- v3: Final fix for infinite recursion on project_team_members.
--
-- Root cause:  20260807_project_comments_documents_checklist_team_rls.sql ran
-- after the v2 recursion fix and re-created project_team_members_select with a
-- direct self-referential subquery:
--
--   EXISTS (SELECT 1 FROM project_team_members ptm WHERE ptm.project_id = p.id …)
--
-- …inside a policy ON project_team_members.  Postgres detects the loop and
-- raises "infinite recursion detected in policy for relation project_team_members".
-- The same direct subquery in project_comments_select / project_documents_select /
-- etc. also triggers the recursion because those policies evaluate
-- project_team_members_select when they scan the ptm table.
--
-- Fix: ensure ALL policies use the SECURITY DEFINER helper
-- is_active_project_team_member(project_id uuid) which reads project_team_members
-- without RLS, breaking every possible recursion path.

-- ── SECURITY DEFINER helper (idempotent) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_active_project_team_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_team_members ptm
    WHERE ptm.project_id = p_project_id
      AND ptm.user_id    = (SELECT auth.uid())
      AND ptm.is_active IS TRUE
  );
$$;

REVOKE ALL  ON FUNCTION public.is_active_project_team_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_project_team_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_project_team_member(uuid) TO service_role;

-- ── project_team_members — non-recursive SELECT ─────────────────────────────
DROP POLICY IF EXISTS "project_team_members_select"         ON public.project_team_members;
DROP POLICY IF EXISTS "Team members see own membership"     ON public.project_team_members;
DROP POLICY IF EXISTS "Project FOM sees their project team" ON public.project_team_members;

CREATE POLICY "project_team_members_select"
  ON public.project_team_members FOR SELECT
  TO authenticated
  USING (
    -- Privileged roles: full read
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    -- Own row — no subquery on this table
    OR project_team_members.user_id = (SELECT auth.uid())
    -- Teammate check via SECURITY DEFINER (no RLS re-entry)
    OR public.is_active_project_team_member(project_team_members.project_id)
    -- PM / teamComposition from projects JSON only
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_team_members.project_id
        AND (
          (p.team->>'projectManagerId') = (SELECT auth.uid())::text
          OR (p.team->>'projectManager') = (SELECT auth.uid())::text
          OR p.team->'teamComposition' @> jsonb_build_array(
               jsonb_build_object('userId', (SELECT auth.uid())::text)
             )
        )
    )
  );

-- ── project_comments ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "project_comments_select" ON public.project_comments;
CREATE POLICY "project_comments_select"
  ON public.project_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_comments.project_id
        AND (
          (p.team->>'projectManagerId') = (SELECT auth.uid())::text
          OR (p.team->>'projectManager') = (SELECT auth.uid())::text
          OR p.team->'teamComposition' @> jsonb_build_array(
               jsonb_build_object('userId', (SELECT auth.uid())::text)
             )
          OR public.is_active_project_team_member(p.id)
        )
    )
  );

-- ── project_documents ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "project_documents_select" ON public.project_documents;
CREATE POLICY "project_documents_select"
  ON public.project_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_documents.project_id
        AND (
          (p.team->>'projectManagerId') = (SELECT auth.uid())::text
          OR (p.team->>'projectManager') = (SELECT auth.uid())::text
          OR p.team->'teamComposition' @> jsonb_build_array(
               jsonb_build_object('userId', (SELECT auth.uid())::text)
             )
          OR public.is_active_project_team_member(p.id)
        )
    )
  );

-- ── project_stage_checklist ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "project_stage_checklist_select" ON public.project_stage_checklist;
CREATE POLICY "project_stage_checklist_select"
  ON public.project_stage_checklist FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_stage_checklist.project_id
        AND (
          (p.team->>'projectManagerId') = (SELECT auth.uid())::text
          OR (p.team->>'projectManager') = (SELECT auth.uid())::text
          OR p.team->'teamComposition' @> jsonb_build_array(
               jsonb_build_object('userId', (SELECT auth.uid())::text)
             )
          OR public.is_active_project_team_member(p.id)
        )
    )
  );

-- ── project_budgets ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "project_budgets_select" ON public.project_budgets;
CREATE POLICY "project_budgets_select"
  ON public.project_budgets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_budgets.project_id
        AND (
          (p.team->>'projectManagerId') = (SELECT auth.uid())::text
          OR (p.team->>'projectManager') = (SELECT auth.uid())::text
          OR p.team->'teamComposition' @> jsonb_build_array(
               jsonb_build_object('userId', (SELECT auth.uid())::text)
             )
          OR public.is_active_project_team_member(p.id)
        )
    )
  );

-- ── project_activities ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "project_activities_select" ON public.project_activities;
CREATE POLICY "project_activities_select"
  ON public.project_activities FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_activities.project_id
        AND (
          (p.team->>'projectManagerId') = (SELECT auth.uid())::text
          OR (p.team->>'projectManager') = (SELECT auth.uid())::text
          OR p.team->'teamComposition' @> jsonb_build_array(
               jsonb_build_object('userId', (SELECT auth.uid())::text)
             )
          OR public.is_active_project_team_member(p.id)
        )
    )
  );

-- ── project_activity_assignments ────────────────────────────────────────────
DROP POLICY IF EXISTS "project_activity_assignments_select" ON public.project_activity_assignments;
CREATE POLICY "project_activity_assignments_select"
  ON public.project_activity_assignments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    OR EXISTS (
      SELECT 1
      FROM public.project_activities pa
      JOIN public.projects p ON p.id = pa.project_id
      WHERE pa.id = project_activity_assignments.activity_id
        AND (
          (p.team->>'projectManagerId') = (SELECT auth.uid())::text
          OR (p.team->>'projectManager') = (SELECT auth.uid())::text
          OR p.team->'teamComposition' @> jsonb_build_array(
               jsonb_build_object('userId', (SELECT auth.uid())::text)
             )
          OR public.is_active_project_team_member(p.id)
        )
    )
  );

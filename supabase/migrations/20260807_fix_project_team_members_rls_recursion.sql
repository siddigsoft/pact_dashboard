-- Fix: infinite recursion in project_team_members RLS
--
-- Cause: projects / project_* SELECT policies query project_team_members, and
-- project_team_members_select also queries project_team_members (and projects),
-- which re-enters the same policies → "infinite recursion detected in policy
-- for relation project_team_members".
--
-- Fix: SECURITY DEFINER helper that reads project_team_members without RLS,
-- then use it everywhere membership is checked. On project_team_members itself,
-- allow own-row reads without a self-join.

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
      AND ptm.user_id = (SELECT auth.uid())
      AND ptm.is_active IS TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_project_team_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_project_team_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_project_team_member(uuid) TO service_role;

-- ── projects ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select"
  ON public.projects FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.profiles pr
        WHERE pr.id = (SELECT auth.uid())
          AND pr.role IN ('employee', 'fom', 'countryDirector', 'hr')
      )
      AND (
        (projects.team->>'projectManagerId') = (SELECT auth.uid())::text
        OR (projects.team->>'projectManager') = (SELECT auth.uid())::text
        OR projects.team->'teamComposition' @> jsonb_build_array(
             jsonb_build_object('userId', (SELECT auth.uid())::text)
           )
        OR public.is_active_project_team_member(projects.id)
      )
    )
  );

-- ── project_team_members (break self-reference) ─────────────────────────────
DROP POLICY IF EXISTS "project_team_members_select" ON public.project_team_members;
CREATE POLICY "project_team_members_select"
  ON public.project_team_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    -- Own membership row — no subquery on this table
    OR project_team_members.user_id = (SELECT auth.uid())
    -- Teammates on a project where I am an active member (via SECURITY DEFINER)
    OR public.is_active_project_team_member(project_team_members.project_id)
    -- PM / teamComposition (JSON only — no ptm self-query)
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

-- v2: previous fix did not stick on comments/documents/ptm select policies.
-- Re-assert helper + non-recursive SELECT policies.

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

DROP POLICY IF EXISTS "project_team_members_select" ON public.project_team_members;
DROP POLICY IF EXISTS "Team members see own membership" ON public.project_team_members;
DROP POLICY IF EXISTS "Project FOM sees their project team" ON public.project_team_members;

CREATE POLICY "project_team_members_select"
  ON public.project_team_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    OR project_team_members.user_id = (SELECT auth.uid())
    OR public.is_active_project_team_member(project_team_members.project_id)
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

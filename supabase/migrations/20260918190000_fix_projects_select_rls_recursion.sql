-- Break projects ↔ project_team_members RLS recursion that zeroed mobile
-- dashboards (project membership fetch fails → all visits client-filtered out).
--
-- 20260916145000_projects_explicit_read_org_scope.sql reintroduced a direct
-- SELECT on project_team_members inside projects_select. That table's SELECT
-- policy still reads projects, which triggers 42P17 infinite recursion.

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
GRANT EXECUTE ON FUNCTION public.is_active_project_team_member(uuid) TO authenticated, service_role;

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
    OR public.user_has_explicit_resource_grant(
      (SELECT auth.uid()),
      'projects',
      ARRAY['read']::text[]
    )
  );

CREATE OR REPLACE FUNCTION public.get_all_projects()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
  SELECT COALESCE(json_agg(p), '[]'::json)
  FROM (
    SELECT
      id, name, project_code, description, project_type, status,
      start_date, end_date, budget, location, team,
      current_flow_stage, custom_flow_stages,
      related_mmps, related_site_visits, archived,
      client_type, client_name, partner_id, crm_opportunity_id,
      created_at, updated_at
    FROM projects proj
    WHERE
      (
        EXISTS (
          SELECT 1 FROM profiles pr
          WHERE pr.id = (SELECT auth.uid())
            AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
        )
        OR (
          EXISTS (
            SELECT 1 FROM profiles pr
            WHERE pr.id = (SELECT auth.uid())
              AND pr.role IN ('employee', 'fom', 'countryDirector', 'hr')
          )
          AND (
            (proj.team->>'projectManagerId') = (SELECT auth.uid())::text
            OR (proj.team->>'projectManager') = (SELECT auth.uid())::text
            OR proj.team->'teamComposition' @> jsonb_build_array(
                 jsonb_build_object('userId', (SELECT auth.uid())::text)
               )
            OR public.is_active_project_team_member(proj.id)
          )
        )
        OR public.user_has_explicit_resource_grant(
          (SELECT auth.uid()),
          'projects',
          ARRAY['read']::text[]
        )
      )
    ORDER BY created_at DESC
  ) p;
$f$;

CREATE OR REPLACE FUNCTION public.get_projects_for_analytics()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
  SELECT COALESCE(json_agg(p), '[]'::json)
  FROM (
    SELECT
      id, name, project_code, project_type, status,
      start_date, end_date, budget, location, team,
      current_flow_stage, custom_flow_stages, archived,
      client_type, client_name, partner_id, crm_opportunity_id,
      created_at, updated_at
    FROM projects proj
    WHERE
      (
        EXISTS (
          SELECT 1 FROM profiles pr
          WHERE pr.id = (SELECT auth.uid())
            AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
        )
        OR (
          EXISTS (
            SELECT 1 FROM profiles pr
            WHERE pr.id = (SELECT auth.uid())
              AND pr.role IN ('employee', 'fom', 'countryDirector', 'hr')
          )
          AND (
            (proj.team->>'projectManagerId') = (SELECT auth.uid())::text
            OR (proj.team->>'projectManager') = (SELECT auth.uid())::text
            OR proj.team->'teamComposition' @> jsonb_build_array(
                 jsonb_build_object('userId', (SELECT auth.uid())::text)
               )
            OR public.is_active_project_team_member(proj.id)
          )
        )
        OR public.user_has_explicit_resource_grant(
          (SELECT auth.uid()),
          'projects',
          ARRAY['read']::text[]
        )
      )
    ORDER BY created_at DESC
  ) p;
$f$;

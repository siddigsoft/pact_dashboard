-- Explicit Access Control projects:read grants unlock the org-wide project
-- catalogue (same pattern as cost_submissions / down_payments).
-- Role-default projects:read must NOT become org-wide — only an active
-- user_permission_overrides grant does.
-- My Projects remains membership-scoped in the app (useUserProjects).

-- ── 1. projects SELECT RLS ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "projects_select" ON projects;

CREATE POLICY "projects_select"
  ON projects FOR SELECT
  TO authenticated
  USING (
    -- Privileged roles (anything not in the restricted list)
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    -- Restricted roles: membership only
    OR (
      EXISTS (
        SELECT 1 FROM profiles pr
        WHERE pr.id = (SELECT auth.uid())
          AND pr.role IN ('employee', 'fom', 'countryDirector', 'hr')
      )
      AND (
        (projects.team->>'projectManagerId') = (SELECT auth.uid())::text
        OR projects.team->'teamComposition' @> jsonb_build_array(
             jsonb_build_object('userId', (SELECT auth.uid())::text)
           )
        OR EXISTS (
          SELECT 1
          FROM project_team_members ptm
          WHERE ptm.project_id = projects.id
            AND ptm.user_id   = (SELECT auth.uid())
            AND ptm.is_active  = TRUE
        )
      )
    )
    -- Explicit Access Control grant → org-wide catalogue
    OR public.user_has_explicit_resource_grant(
      (SELECT auth.uid()),
      'projects',
      ARRAY['read']::text[]
    )
  );

-- ── 2. get_all_projects() ────────────────────────────────────────────────────
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
          SELECT 1
          FROM profiles pr
          WHERE pr.id = (SELECT auth.uid())
            AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
        )
        OR (
          EXISTS (
            SELECT 1
            FROM profiles pr
            WHERE pr.id = (SELECT auth.uid())
              AND pr.role IN ('employee', 'fom', 'countryDirector', 'hr')
          )
          AND (
            (proj.team->>'projectManagerId') = (SELECT auth.uid())::text
            OR proj.team->'teamComposition' @> jsonb_build_array(
                 jsonb_build_object('userId', (SELECT auth.uid())::text)
               )
            OR EXISTS (
              SELECT 1
              FROM project_team_members ptm
              WHERE ptm.project_id = proj.id
                AND ptm.user_id    = (SELECT auth.uid())
                AND ptm.is_active  = TRUE
            )
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

GRANT EXECUTE ON FUNCTION public.get_all_projects() TO authenticated;

-- ── 3. get_projects_for_analytics() ──────────────────────────────────────────
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
          SELECT 1
          FROM profiles pr
          WHERE pr.id = (SELECT auth.uid())
            AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
        )
        OR (
          EXISTS (
            SELECT 1
            FROM profiles pr
            WHERE pr.id = (SELECT auth.uid())
              AND pr.role IN ('employee', 'fom', 'countryDirector', 'hr')
          )
          AND (
            (proj.team->>'projectManagerId') = (SELECT auth.uid())::text
            OR proj.team->'teamComposition' @> jsonb_build_array(
                 jsonb_build_object('userId', (SELECT auth.uid())::text)
               )
            OR EXISTS (
              SELECT 1
              FROM project_team_members ptm
              WHERE ptm.project_id = proj.id
                AND ptm.user_id    = (SELECT auth.uid())
                AND ptm.is_active  = TRUE
            )
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

GRANT EXECUTE ON FUNCTION public.get_projects_for_analytics() TO authenticated;

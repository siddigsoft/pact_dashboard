-- Migration: Patch get_all_projects() and get_projects_for_analytics()
--            to respect caller visibility
--
-- Problem: Both functions are defined with SECURITY DEFINER, which means they
-- run with the function owner's privileges and bypass RLS entirely.  A
-- restricted-role user (employee, fom, countryDirector, hr) who calls either
-- function via the Supabase API receives ALL project rows, not just the ones
-- they are allowed to see.
--
-- Fix: Replace both function bodies so they include an explicit
-- caller-visibility WHERE clause that exactly mirrors the "projects_select"
-- RLS policy introduced in 20260807_projects_rls_member_visibility.sql:
--
--   • Privileged roles (any role NOT in the restricted list) → all rows
--   • Restricted roles (employee, fom, countryDirector, hr) → only rows where
--     the caller is the project manager (team->>'projectManagerId'), appears in
--     the teamComposition array, or has a row in project_team_members
--
-- Column lists reflect the most recent definitions (20260409_crm_project_pipeline.sql).
-- GRANTs are kept identical to the originals.

-- ── 1. get_all_projects() ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_all_projects()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
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
      -- ── Caller-visibility guard (mirrors the projects_select RLS policy) ──
      --
      -- Because this function runs as SECURITY DEFINER it bypasses RLS on the
      -- projects table.  We reproduce the same visibility logic here so that
      -- restricted-role callers cannot read rows for projects they are not a
      -- member of.
      --
      --   Clause 1: privileged roles see everything.
      --   Clause 2: restricted roles see only their own projects.
      --
      (
        -- 1. Caller has a privileged role → unrestricted access.
        --    (Also covers null-role edge-case: NULL NOT IN (...) → NULL → FALSE,
        --    so null-role users fall through to clause 2 and are also denied.)
        EXISTS (
          SELECT 1
          FROM profiles pr
          WHERE pr.id = (SELECT auth.uid())
            AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
        )

        -- 2. Caller has a restricted role AND is a member of this project.
        OR (
          EXISTS (
            SELECT 1
            FROM profiles pr
            WHERE pr.id = (SELECT auth.uid())
              AND pr.role IN ('employee', 'fom', 'countryDirector', 'hr')
          )
          AND (
            -- a) Named as project manager by user-ID
            (proj.team->>'projectManagerId') = (SELECT auth.uid())::text

            -- b) Appears in teamComposition array as a userId
            OR proj.team->'teamComposition' @> jsonb_build_array(
                 jsonb_build_object('userId', (SELECT auth.uid())::text)
               )

            -- c) Has an explicit active row in project_team_members
            OR EXISTS (
              SELECT 1
              FROM project_team_members ptm
              WHERE ptm.project_id = proj.id
                AND ptm.user_id    = (SELECT auth.uid())
                AND ptm.is_active  = TRUE
            )
          )
        )
      )
    ORDER BY created_at DESC
  ) p;
$f$;

-- Re-assert the GRANT (idempotent — safe to run on an existing grant).
GRANT EXECUTE ON FUNCTION public.get_all_projects() TO authenticated, anon;


-- ── 2. get_projects_for_analytics() ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_projects_for_analytics()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
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
      -- ── Caller-visibility guard (mirrors the projects_select RLS policy) ──
      --
      -- Because this function runs as SECURITY DEFINER it bypasses RLS on the
      -- projects table.  We reproduce the same visibility logic here so that
      -- restricted-role callers cannot read rows for projects they are not a
      -- member of.
      --
      --   Clause 1: privileged roles see everything.
      --   Clause 2: restricted roles see only their own projects.
      --
      (
        -- 1. Caller has a privileged role → unrestricted access.
        EXISTS (
          SELECT 1
          FROM profiles pr
          WHERE pr.id = (SELECT auth.uid())
            AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
        )

        -- 2. Caller has a restricted role AND is a member of this project.
        OR (
          EXISTS (
            SELECT 1
            FROM profiles pr
            WHERE pr.id = (SELECT auth.uid())
              AND pr.role IN ('employee', 'fom', 'countryDirector', 'hr')
          )
          AND (
            -- a) Named as project manager by user-ID
            (proj.team->>'projectManagerId') = (SELECT auth.uid())::text

            -- b) Appears in teamComposition array as a userId
            OR proj.team->'teamComposition' @> jsonb_build_array(
                 jsonb_build_object('userId', (SELECT auth.uid())::text)
               )

            -- c) Has an explicit active row in project_team_members
            OR EXISTS (
              SELECT 1
              FROM project_team_members ptm
              WHERE ptm.project_id = proj.id
                AND ptm.user_id    = (SELECT auth.uid())
                AND ptm.is_active  = TRUE
            )
          )
        )
      )
    ORDER BY created_at DESC
  ) p;
$f$;

-- Re-assert the GRANT (idempotent — safe to run on an existing grant).
GRANT EXECUTE ON FUNCTION public.get_projects_for_analytics() TO authenticated, anon;

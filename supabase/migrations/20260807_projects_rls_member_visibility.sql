-- Migration: projects table RLS — member-based visibility for restricted roles
-- 
-- Problem: the projects table had no RLS, so all authenticated users could SELECT
-- every row via the Supabase API regardless of what the client-side filter showed.
--
-- Fix:
--   • Enable RLS on projects.
--   • SELECT: privileged roles (superAdmin, admin, projectManager, seniorOperationsLead,
--     ict, financialAdmin) see all rows.  Restricted roles (employee, fom,
--     countryDirector, hr) see only rows where they are the PM, a teamComposition
--     member, or appear in the project_team_members table.
--   • INSERT / UPDATE / DELETE remain open to any authenticated user so that
--     existing create/edit/delete flows (which are separately guarded in the
--     application layer) are not broken.

-- ── Enable RLS ─────────────────────────────────────────────────────────────
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- ── SELECT ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "projects_select" ON projects;

CREATE POLICY "projects_select"
  ON projects FOR SELECT
  TO authenticated
  USING (
    -- 1. Privileged roles: full, unrestricted read access.
    --    All roles NOT in the restricted list fall through here too.
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    -- 2. Restricted roles: access only when the user is a project member.
    OR (
      -- Caller is a restricted role …
      EXISTS (
        SELECT 1 FROM profiles pr
        WHERE pr.id = (SELECT auth.uid())
          AND pr.role IN ('employee', 'fom', 'countryDirector', 'hr')
      )
      -- … and they are linked to this project in at least one way:
      AND (
        -- a) They are named as project manager by user-ID
        (projects.team->>'projectManagerId') = (SELECT auth.uid())::text

        -- b) They appear in the teamComposition array as a userId
        OR projects.team->'teamComposition' @> jsonb_build_array(
             jsonb_build_object('userId', (SELECT auth.uid())::text)
           )

        -- c) They have an explicit row in project_team_members
        OR EXISTS (
          SELECT 1
          FROM project_team_members ptm
          WHERE ptm.project_id = projects.id
            AND ptm.user_id   = (SELECT auth.uid())
            AND ptm.is_active  = TRUE
        )
      )
    )
  );

-- ── INSERT ─────────────────────────────────────────────────────────────────
-- Keep broadly open (same as pre-RLS behaviour) — application enforces who
-- may create projects.  A separate task can tighten this if needed.
DROP POLICY IF EXISTS "projects_insert" ON projects;

CREATE POLICY "projects_insert"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ── UPDATE ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "projects_update" ON projects;

CREATE POLICY "projects_update"
  ON projects FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── DELETE ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "projects_delete" ON projects;

CREATE POLICY "projects_delete"
  ON projects FOR DELETE
  TO authenticated
  USING (true);

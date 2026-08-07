-- Migration: Extend member-only visibility RLS to project sub-tables
--
-- Problem: project_budgets, project_activities, and project_activity_assignments
-- were still fully queryable by any authenticated user even after the parent
-- `projects` table gained RLS member-visibility in 20260807_projects_rls_member_visibility.sql.
--
-- Fix:
--   • project_budgets SELECT: replace the old policy (which incorrectly treated
--     fom/country_director as privileged) with one mirroring the projects rule.
--   • project_activities SELECT: replace the broad "all authenticated" FOR ALL
--     policy with a member-visibility SELECT; keep INSERT/UPDATE/DELETE open.
--   • project_activity_assignments SELECT: same treatment.
--
-- Privileged roles (NOT restricted): any role not in (employee, fom, countryDirector, hr)
--   → superAdmin, admin, projectManager, seniorOperationsLead, ict, financialAdmin, etc.
-- Restricted roles: employee, fom, countryDirector, hr
--   → may only read sub-table rows whose parent project_id they can see.
--
-- Tables NOT covered (do not exist as physical tables in this codebase):
--   project_field_ops, project_costs, project_professional_fees
--   (project_professional_fees is a SECURITY DEFINER function, not a table)

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. project_budgets — tighten SELECT to match projects visibility pattern
-- ══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "project_budgets_select" ON project_budgets;

CREATE POLICY "project_budgets_select"
  ON project_budgets FOR SELECT
  TO authenticated
  USING (
    -- Privileged roles: unrestricted read access
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    -- Restricted roles: only if they can see the parent project
    OR EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_budgets.project_id
        AND (
          -- a) Named as project manager by user-ID
          (p.team->>'projectManagerId') = (SELECT auth.uid())::text

          -- b) Listed in teamComposition JSONB array
          OR p.team->'teamComposition' @> jsonb_build_array(
               jsonb_build_object('userId', (SELECT auth.uid())::text)
             )

          -- c) Has an explicit row in project_team_members
          OR EXISTS (
            SELECT 1 FROM project_team_members ptm
            WHERE ptm.project_id = p.id
              AND ptm.user_id    = (SELECT auth.uid())
              AND ptm.is_active   = TRUE
          )
        )
    )
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. project_activities — replace broad FOR ALL with member-visibility SELECT
-- ══════════════════════════════════════════════════════════════════════════════

-- Drop the existing all_auth policy (covers ALL operations).
-- We will re-add it split into SELECT + write policies below.
DROP POLICY IF EXISTS project_activities_all_auth ON project_activities;

-- SELECT: restricted roles see only activities on projects they belong to
DROP POLICY IF EXISTS "project_activities_select" ON project_activities;

CREATE POLICY "project_activities_select"
  ON project_activities FOR SELECT
  TO authenticated
  USING (
    -- Privileged roles: unrestricted read access
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    -- Restricted roles: only if they can see the parent project
    OR EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_activities.project_id
        AND (
          (p.team->>'projectManagerId') = (SELECT auth.uid())::text

          OR p.team->'teamComposition' @> jsonb_build_array(
               jsonb_build_object('userId', (SELECT auth.uid())::text)
             )

          OR EXISTS (
            SELECT 1 FROM project_team_members ptm
            WHERE ptm.project_id = p.id
              AND ptm.user_id    = (SELECT auth.uid())
              AND ptm.is_active   = TRUE
          )
        )
    )
  );

-- INSERT / UPDATE / DELETE: keep broadly open (application layer enforces who
-- may write; same posture as the parent projects table).
DROP POLICY IF EXISTS "project_activities_insert" ON project_activities;
CREATE POLICY "project_activities_insert"
  ON project_activities FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "project_activities_update" ON project_activities;
CREATE POLICY "project_activities_update"
  ON project_activities FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "project_activities_delete" ON project_activities;
CREATE POLICY "project_activities_delete"
  ON project_activities FOR DELETE
  TO authenticated
  USING (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. project_activity_assignments — same treatment
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS project_activity_assignments_all_auth ON project_activity_assignments;

DROP POLICY IF EXISTS "project_activity_assignments_select" ON project_activity_assignments;

CREATE POLICY "project_activity_assignments_select"
  ON project_activity_assignments FOR SELECT
  TO authenticated
  USING (
    -- Privileged roles: unrestricted read access
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    -- Restricted roles: visible if the linked activity's project is visible to them
    OR EXISTS (
      SELECT 1
      FROM project_activities pa
      JOIN projects p ON p.id = pa.project_id
      WHERE pa.id = project_activity_assignments.activity_id
        AND (
          (p.team->>'projectManagerId') = (SELECT auth.uid())::text

          OR p.team->'teamComposition' @> jsonb_build_array(
               jsonb_build_object('userId', (SELECT auth.uid())::text)
             )

          OR EXISTS (
            SELECT 1 FROM project_team_members ptm
            WHERE ptm.project_id = p.id
              AND ptm.user_id    = (SELECT auth.uid())
              AND ptm.is_active   = TRUE
          )
        )
    )
  );

-- INSERT / UPDATE / DELETE: keep broadly open
DROP POLICY IF EXISTS "project_activity_assignments_insert" ON project_activity_assignments;
CREATE POLICY "project_activity_assignments_insert"
  ON project_activity_assignments FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "project_activity_assignments_update" ON project_activity_assignments;
CREATE POLICY "project_activity_assignments_update"
  ON project_activity_assignments FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "project_activity_assignments_delete" ON project_activity_assignments;
CREATE POLICY "project_activity_assignments_delete"
  ON project_activity_assignments FOR DELETE
  TO authenticated
  USING (true);

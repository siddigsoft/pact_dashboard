-- Migration: Member-visibility RLS for project_comments, project_documents,
--            project_stage_checklist, and project_team_members
--
-- Problem: the member-visibility guard applied to `projects`, `project_budgets`,
-- `project_activities`, and `project_activity_assignments` still leaves these
-- four related tables readable by any authenticated user via the API.
--
-- Fix: replace / add SELECT policies on each table so that:
--   • Privileged roles (any role NOT in the restricted list) retain full,
--     unrestricted read access.
--   • Restricted roles (employee, fom, countryDirector, hr) may only see rows
--     whose project_id belongs to a project they can see (PM, teamComposition,
--     or project_team_members active row).
--   • INSERT / UPDATE / DELETE are left broadly open — same posture as the
--     parent projects table; application layer enforces write permissions.
--
-- Reference pattern: 20260807_projects_rls_member_visibility.sql
--                    20260807_project_subtables_rls_member_visibility.sql

-- ══════════════════════════════════════════════════════════════════════════════
-- Helper: reusable member-visibility EXISTS sub-query (as a comment for clarity)
--
-- A restricted-role user can see a row tied to project P when:
--   a) they are named as project manager  (projects.team->>'projectManagerId')
--   b) they appear in teamComposition JSONB array                 (team->'teamComposition')
--   c) they have an active row in project_team_members            (ptm.is_active = TRUE)
-- ══════════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════════════
-- 1. project_comments
-- ══════════════════════════════════════════════════════════════════════════════
-- The original SELECT policy (from 20260402_project_comments_documents.sql)
-- used a narrow role whitelist (super_admin, admin, fom) that skips other
-- privileged roles and incorrectly blocks them.  Replace it wholesale.

DROP POLICY IF EXISTS "project_comments_select" ON project_comments;

CREATE POLICY "project_comments_select"
  ON project_comments FOR SELECT
  TO authenticated
  USING (
    -- 1. Privileged roles: unrestricted read access.
    --    Any role NOT in the restricted list (including superAdmin, admin,
    --    projectManager, seniorOperationsLead, ict, financialAdmin, etc.)
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    -- 2. Restricted roles: visible only when the parent project is visible.
    OR EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_comments.project_id
        AND (
          -- a) Named as project manager
          (p.team->>'projectManagerId') = (SELECT auth.uid())::text

          -- b) Listed in teamComposition JSONB array
          OR p.team->'teamComposition' @> jsonb_build_array(
               jsonb_build_object('userId', (SELECT auth.uid())::text)
             )

          -- c) Has an active row in project_team_members
          OR EXISTS (
            SELECT 1 FROM project_team_members ptm
            WHERE ptm.project_id = p.id
              AND ptm.user_id    = (SELECT auth.uid())
              AND ptm.is_active   = TRUE
          )
        )
    )
  );

-- INSERT and DELETE keep the same constraints as before (author_id check, etc.)
-- No changes needed to those policies.


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. project_documents
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "project_documents_select" ON project_documents;

CREATE POLICY "project_documents_select"
  ON project_documents FOR SELECT
  TO authenticated
  USING (
    -- 1. Privileged roles: unrestricted read access.
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    -- 2. Restricted roles: visible only when the parent project is visible.
    OR EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_documents.project_id
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


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. project_stage_checklist
-- ══════════════════════════════════════════════════════════════════════════════
-- RLS was disabled by 20260705_fix_checklist_permissions_rls.sql to unblock
-- the app after a zero-policy RLS incident.  Re-enable it now with correct
-- member-visibility policies so that restricted users cannot enumerate all
-- checklist items via the API.

ALTER TABLE project_stage_checklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_stage_checklist_select" ON project_stage_checklist;

CREATE POLICY "project_stage_checklist_select"
  ON project_stage_checklist FOR SELECT
  TO authenticated
  USING (
    -- 1. Privileged roles: unrestricted read access.
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    -- 2. Restricted roles: visible only when the parent project is visible.
    OR EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_stage_checklist.project_id
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
-- may write).
DROP POLICY IF EXISTS "project_stage_checklist_insert" ON project_stage_checklist;
CREATE POLICY "project_stage_checklist_insert"
  ON project_stage_checklist FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "project_stage_checklist_update" ON project_stage_checklist;
CREATE POLICY "project_stage_checklist_update"
  ON project_stage_checklist FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "project_stage_checklist_delete" ON project_stage_checklist;
CREATE POLICY "project_stage_checklist_delete"
  ON project_stage_checklist FOR DELETE
  TO authenticated
  USING (true);


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. project_team_members
-- ══════════════════════════════════════════════════════════════════════════════
-- The existing SELECT policies from 20260717_project_configuration_engine.sql
-- are too narrow: "Team members see own membership" only exposes the user's
-- own row, and "Project FOM sees their project team" only covers project_fom
-- role holders.  Privileged app roles (admin, projectManager, etc.) have no
-- SELECT grant at all unless they fall under "Admins manage project teams"
-- (FOR ALL), which relies on a legacy role-name list.
--
-- Replace the SELECT side with the standard member-visibility pattern used by
-- the other sub-tables.  Keep write policies (INSERT/UPDATE/DELETE) untouched.

DROP POLICY IF EXISTS "Team members see own membership"    ON project_team_members;
DROP POLICY IF EXISTS "Project FOM sees their project team" ON project_team_members;
DROP POLICY IF EXISTS "project_team_members_select"        ON project_team_members;

CREATE POLICY "project_team_members_select"
  ON project_team_members FOR SELECT
  TO authenticated
  USING (
    -- 1. Privileged roles: unrestricted read access.
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    -- 2. Restricted roles: visible only when the parent project is visible.
    OR EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_team_members.project_id
        AND (
          (p.team->>'projectManagerId') = (SELECT auth.uid())::text

          OR p.team->'teamComposition' @> jsonb_build_array(
               jsonb_build_object('userId', (SELECT auth.uid())::text)
             )

          -- NOTE: self-referential check — is this user an active member?
          OR EXISTS (
            SELECT 1 FROM project_team_members ptm
            WHERE ptm.project_id = p.id
              AND ptm.user_id    = (SELECT auth.uid())
              AND ptm.is_active   = TRUE
          )
        )
    )
  );

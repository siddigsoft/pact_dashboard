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

-- ── NULL / MISSING ROLE SAFETY ANALYSIS ────────────────────────────────────
--
-- This policy is intentionally deny-by-default for two edge cases that arise
-- before a user's profile is fully set up:
--
--   Case A — profile row exists but role IS NULL
--     • Clause 1 (NOT IN):  NULL NOT IN (...) → NULL → treated as FALSE by
--       Postgres.  The EXISTS returns no row, so clause 1 is false.
--     • Clause 2 (IN):      NULL IN (...)     → NULL → treated as FALSE.
--       The EXISTS returns no row, so clause 2 is also false.
--     ➜ Result: no rows visible.  Correct — deny until a role is assigned.
--
--   Case B — profile row is missing entirely (auth user but no profiles row)
--     • Both EXISTS subqueries find no matching profile row → both return
--       false immediately.
--     ➜ Result: no rows visible.  Correct — deny until the profile is created.
--
-- These outcomes are intentional.  Administrators should assign a role (or
-- ensure the profile trigger has run) before the user is expected to access
-- the projects list.  See supabase/RUNBOOK_projects_rls_null_role.md for
-- manual SQL verification steps.
--
-- ── SELECT ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "projects_select" ON projects;

CREATE POLICY "projects_select"
  ON projects FOR SELECT
  TO authenticated
  USING (
    -- 1. Privileged roles: full, unrestricted read access.
    --    All roles NOT in the restricted list fall through here too.
    --    NOTE: if pr.role IS NULL, NOT IN evaluates to NULL (unknown) and
    --    Postgres treats it as FALSE — so null-role users are correctly denied.
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    -- 2. Restricted roles: access only when the user is a project member.
    OR (
      -- Caller is a restricted role …
      -- NOTE: if pr.role IS NULL, IN evaluates to NULL → FALSE, so
      -- null-role users never satisfy this clause either.
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
-- Privileged roles may create any project.
-- Restricted roles may only insert a project where they are the named PM,
-- preventing them from creating projects on behalf of others.
DROP POLICY IF EXISTS "projects_insert" ON projects;

CREATE POLICY "projects_insert"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (
    -- 1. Privileged roles: unrestricted insert.
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    -- 2. Restricted roles: the caller must be the projectManagerId in the new row.
    OR (
      EXISTS (
        SELECT 1 FROM profiles pr
        WHERE pr.id = (SELECT auth.uid())
          AND pr.role IN ('employee', 'fom', 'countryDirector', 'hr')
      )
      AND (team->>'projectManagerId') = (SELECT auth.uid())::text
    )
  );

-- ── UPDATE ─────────────────────────────────────────────────────────────────
-- Mirrors the SELECT guard: privileged roles may update any project;
-- restricted roles may only update projects where they are a member
-- (PM, teamComposition, or project_team_members).
DROP POLICY IF EXISTS "projects_update" ON projects;

CREATE POLICY "projects_update"
  ON projects FOR UPDATE
  TO authenticated
  USING (
    -- 1. Privileged roles: unrestricted update.
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    -- 2. Restricted roles: caller must be a project member.
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
  )
  WITH CHECK (
    -- Same membership check applied to the post-update row shape.
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
  );

-- ── DELETE ─────────────────────────────────────────────────────────────────
-- Privileged roles may delete any project.
-- Restricted roles may only delete projects where they are the named PM —
-- team members can view and edit but not remove the entire project.
DROP POLICY IF EXISTS "projects_delete" ON projects;

CREATE POLICY "projects_delete"
  ON projects FOR DELETE
  TO authenticated
  USING (
    -- 1. Privileged roles: unrestricted delete.
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    -- 2. Restricted roles: only the named PM may delete.
    OR (
      EXISTS (
        SELECT 1 FROM profiles pr
        WHERE pr.id = (SELECT auth.uid())
          AND pr.role IN ('employee', 'fom', 'countryDirector', 'hr')
      )
      AND (projects.team->>'projectManagerId') = (SELECT auth.uid())::text
    )
  );

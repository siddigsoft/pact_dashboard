-- Migration: Add RLS policies for project_budgets
-- The table was created without RLS policies, causing INSERT to time out
-- and SELECT to return no rows for non-service-role clients.
-- Policies are idempotent (DROP IF EXISTS before CREATE).
--
-- FIXED (2026-08-05):
--   • SELECT: removed broken `team->>'projectManagerId'` reference (key is
--     `projectManager` and may store a name, not UUID); added country_director.
--   • Team member access still works via teamComposition JSONB array.
--   • UPDATE/INSERT/DELETE: added country_director to privileged-role list.

ALTER TABLE project_budgets ENABLE ROW LEVEL SECURITY;

-- ── SELECT ─────────────────────────────────────────────────────────────────
-- Privileged roles and project team members can read budgets.
DROP POLICY IF EXISTS "project_budgets_select" ON project_budgets;

CREATE POLICY "project_budgets_select"
  ON project_budgets FOR SELECT
  TO authenticated
  USING (
    -- Privileged roles always have read access
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role IN ('super_admin', 'admin', 'fom', 'country_director')
    )
    -- OR the authenticated user is a team member on the linked project
    OR EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_budgets.project_id
        AND p.team->'teamComposition' @> jsonb_build_array(jsonb_build_object('userId', auth.uid()::text))
    )
  );

-- ── INSERT ─────────────────────────────────────────────────────────────────
-- Only privileged roles can create budget records.
DROP POLICY IF EXISTS "project_budgets_insert" ON project_budgets;

CREATE POLICY "project_budgets_insert"
  ON project_budgets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role IN ('super_admin', 'admin', 'fom', 'country_director')
    )
  );

-- ── UPDATE ─────────────────────────────────────────────────────────────────
-- Privileged roles can update any budget record (covers submit + approve).
DROP POLICY IF EXISTS "project_budgets_update" ON project_budgets;

CREATE POLICY "project_budgets_update"
  ON project_budgets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role IN ('super_admin', 'admin', 'fom', 'country_director')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role IN ('super_admin', 'admin', 'fom', 'country_director')
    )
  );

-- ── DELETE ─────────────────────────────────────────────────────────────────
-- Only super_admin / admin can delete budget records.
DROP POLICY IF EXISTS "project_budgets_delete" ON project_budgets;

CREATE POLICY "project_budgets_delete"
  ON project_budgets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role IN ('super_admin', 'admin')
    )
  );

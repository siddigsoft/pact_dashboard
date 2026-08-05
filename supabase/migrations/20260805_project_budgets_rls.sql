-- Migration: Add RLS policies for project_budgets
-- The table was created without RLS policies, causing INSERT to time out
-- and SELECT to return no rows for non-service-role clients.
-- Policies are idempotent (DROP IF EXISTS before CREATE).

ALTER TABLE project_budgets ENABLE ROW LEVEL SECURITY;

-- ── SELECT ─────────────────────────────────────────────────────────────────
-- Admin roles and project team members can read budgets.
DROP POLICY IF EXISTS "project_budgets_select" ON project_budgets;

CREATE POLICY "project_budgets_select"
  ON project_budgets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_budgets.project_id
        AND (
          -- admin / super_admin / fom always have access
          EXISTS (
            SELECT 1 FROM profiles pr
            WHERE pr.id = auth.uid()
              AND pr.role IN ('super_admin', 'admin', 'fom')
          )
          -- team member
          OR p.team->'teamComposition' @> jsonb_build_array(jsonb_build_object('userId', auth.uid()::text))
          -- project manager
          OR (p.team->>'projectManagerId') = auth.uid()::text
        )
    )
  );

-- ── INSERT ─────────────────────────────────────────────────────────────────
-- Only admin roles can create budget records.
DROP POLICY IF EXISTS "project_budgets_insert" ON project_budgets;

CREATE POLICY "project_budgets_insert"
  ON project_budgets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role IN ('super_admin', 'admin', 'fom')
    )
  );

-- ── UPDATE ─────────────────────────────────────────────────────────────────
-- Only admin roles can update budget records.
DROP POLICY IF EXISTS "project_budgets_update" ON project_budgets;

CREATE POLICY "project_budgets_update"
  ON project_budgets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role IN ('super_admin', 'admin', 'fom')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role IN ('super_admin', 'admin', 'fom')
    )
  );

-- ── DELETE ─────────────────────────────────────────────────────────────────
-- Only super_admin can delete budget records.
DROP POLICY IF EXISTS "project_budgets_delete" ON project_budgets;

CREATE POLICY "project_budgets_delete"
  ON project_budgets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role IN ('super_admin', 'admin', 'fom')
    )
  );

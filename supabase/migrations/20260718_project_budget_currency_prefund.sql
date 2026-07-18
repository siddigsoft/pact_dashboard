-- ============================================================
-- Project Budget: Add currency column + approval fields
-- Pre-fund: ensure project_id linkage is indexed
-- Run this in Supabase SQL editor.
-- ============================================================

-- 1. Add currency column to project_budgets (was hardcoded SDG everywhere)
ALTER TABLE project_budgets
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'SDG';

-- 2. Add approval tracking columns
ALTER TABLE project_budgets
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 3. Add donor/grant fund tagging per budget line (JSONB parallel to category_allocations)
--    Structure: { "transportation_and_visit_fees": "grant-uuid-...", ... }
ALTER TABLE project_budgets
  ADD COLUMN IF NOT EXISTS grant_tags JSONB DEFAULT '{}';

-- 4. Index pre_fund_requests.project_id for budget-tab queries
CREATE INDEX IF NOT EXISTS idx_pre_fund_requests_project_id
  ON pre_fund_requests (project_id)
  WHERE project_id IS NOT NULL;

-- 5. Index project_budgets.project_id (in case missing)
CREATE INDEX IF NOT EXISTS idx_project_budgets_project_id
  ON project_budgets (project_id);

-- 6. Update trigger: auto-set updated_at on project_budgets
CREATE OR REPLACE FUNCTION set_project_budgets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_budgets_updated_at ON project_budgets;
CREATE TRIGGER trg_project_budgets_updated_at
  BEFORE UPDATE ON project_budgets
  FOR EACH ROW EXECUTE FUNCTION set_project_budgets_updated_at();

-- 7. Backfill currency for existing draft budgets that have matching projects
-- (sets currency from project.budget->>'currency' where available)
UPDATE project_budgets pb
SET currency = COALESCE(
  (SELECT p.budget->>'currency' FROM projects p WHERE p.id = pb.project_id),
  'SDG'
)
WHERE pb.currency = 'SDG';

-- ============================================================
-- RUNBOOK
-- After running this migration:
-- 1. The Budget dialogs now show/save the correct currency.
-- 2. Approval workflow: status can be set to 'submitted' → 'approved'.
-- 3. grant_tags JSONB stores per-category donor fund assignments.
-- 4. No existing data is lost — all columns have safe defaults.
-- ============================================================

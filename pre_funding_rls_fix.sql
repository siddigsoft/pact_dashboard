-- ============================================================================
-- Pre-Funding RLS  (re-runnable — safe to run multiple times)
-- Access model:
--   Finance / Admin / Super Admin  →  full CRUD on all tables
--   Step assignees                 →  SELECT on requests + SELECT+UPDATE on steps
--                                     + SELECT on transactions for their funds
--   All others                     →  no access
-- ============================================================================

ALTER TABLE IF EXISTS pre_fund_period_types     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_approval_steps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_reconciliations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_bank_unmatched   ENABLE ROW LEVEL SECURITY;

-- Drop ALL known policy names so re-runs are clean
DROP POLICY IF EXISTS "pf_period_types_finance"      ON pre_fund_period_types;
DROP POLICY IF EXISTS "pf_settings_finance"           ON pre_fund_settings;
DROP POLICY IF EXISTS "pf_requests_finance"           ON pre_fund_requests;
DROP POLICY IF EXISTS "pf_requests_step_assignee"     ON pre_fund_requests;
DROP POLICY IF EXISTS "pf_steps_finance"              ON pre_fund_approval_steps;
DROP POLICY IF EXISTS "pf_steps_assignee_select"      ON pre_fund_approval_steps;
DROP POLICY IF EXISTS "pf_steps_assignee_update"      ON pre_fund_approval_steps;
DROP POLICY IF EXISTS "pf_transactions_finance"       ON pre_fund_transactions;
DROP POLICY IF EXISTS "pf_transactions_assignee_read" ON pre_fund_transactions;
DROP POLICY IF EXISTS "pf_recons_finance"             ON pre_fund_reconciliations;
DROP POLICY IF EXISTS "pf_bank_unmatched_access"      ON pre_fund_bank_unmatched;

-- ── Period types / Settings: finance/admin ONLY ───────────────────────────────
CREATE POLICY "pf_period_types_finance" ON pre_fund_period_types FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

CREATE POLICY "pf_settings_finance" ON pre_fund_settings FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

-- ── Fund requests ─────────────────────────────────────────────────────────────
-- Finance/Admin: full CRUD
CREATE POLICY "pf_requests_finance" ON pre_fund_requests FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

-- Step assignees: SELECT only (ApprovalsHub must show fund context to approvers)
CREATE POLICY "pf_requests_step_assignee" ON pre_fund_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pre_fund_approval_steps s
      WHERE s.pre_fund_request_id = pre_fund_requests.id
        AND (
          s.assigned_user_id = auth.uid()
          OR s.assigned_user_ids @> ARRAY[auth.uid()]
        )
    )
  );

-- ── Approval steps ────────────────────────────────────────────────────────────
-- Finance/Admin: full CRUD
CREATE POLICY "pf_steps_finance" ON pre_fund_approval_steps FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

-- Step assignees: SELECT — see their own step(s)
CREATE POLICY "pf_steps_assignee_select" ON pre_fund_approval_steps FOR SELECT
  USING (
    assigned_user_id = auth.uid()
    OR assigned_user_ids @> ARRAY[auth.uid()]
  );

-- Step assignees: UPDATE — approve / reject / add notes on their own step(s)
CREATE POLICY "pf_steps_assignee_update" ON pre_fund_approval_steps FOR UPDATE
  USING (
    assigned_user_id = auth.uid()
    OR assigned_user_ids @> ARRAY[auth.uid()]
  );

-- ── Transactions ──────────────────────────────────────────────────────────────
-- Finance/Admin: full CRUD
CREATE POLICY "pf_transactions_finance" ON pre_fund_transactions FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

-- Step assignees: SELECT — verify deductions on their approval step
CREATE POLICY "pf_transactions_assignee_read" ON pre_fund_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pre_fund_approval_steps s
      WHERE s.pre_fund_request_id = pre_fund_transactions.pre_fund_request_id
        AND (
          s.assigned_user_id = auth.uid()
          OR s.assigned_user_ids @> ARRAY[auth.uid()]
        )
    )
  );

-- ── Reconciliations / Bank unmatched: finance/admin ONLY ─────────────────────
CREATE POLICY "pf_recons_finance" ON pre_fund_reconciliations FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

CREATE POLICY "pf_bank_unmatched_access" ON pre_fund_bank_unmatched FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

-- Verify — should return 11 rows
SELECT tablename, policyname
FROM   pg_policies
WHERE  policyname LIKE 'pf_%'
  AND  tablename LIKE 'pre_fund_%'
ORDER  BY tablename, policyname;


-- ============================================================================
-- Period Type Deduplication (run this if you see duplicate entries in dropdown)
-- ============================================================================

-- Step 1: Add unique constraint so it can never happen again
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pf_period_types_name_unique'
      AND conrelid = 'pre_fund_period_types'::regclass
  ) THEN
    ALTER TABLE pre_fund_period_types ADD CONSTRAINT pf_period_types_name_unique UNIQUE (name);
  END IF;
END $$;

-- Step 2: Delete duplicates — keeps the row with the lowest display_order per name
DELETE FROM pre_fund_period_types
WHERE id NOT IN (
  SELECT DISTINCT ON (name) id
  FROM pre_fund_period_types
  ORDER BY name, display_order, created_at
);

-- Verify — should return exactly 7 rows
SELECT name, day_count, display_order FROM pre_fund_period_types ORDER BY display_order;

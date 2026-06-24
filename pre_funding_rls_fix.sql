-- ============================================================================
-- Pre-Funding RLS Quick-Fix  (re-runnable — safe to run multiple times)
-- Fixes "new row violates row-level security" by using LOWER(role) so that
-- SuperAdmin / superAdmin / super_admin / financialAdmin all match correctly.
-- ============================================================================

ALTER TABLE IF EXISTS pre_fund_period_types     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_approval_steps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_reconciliations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_bank_unmatched   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pf_period_types_finance"   ON pre_fund_period_types;
DROP POLICY IF EXISTS "pf_settings_finance"        ON pre_fund_settings;
DROP POLICY IF EXISTS "pf_requests_finance"        ON pre_fund_requests;
DROP POLICY IF EXISTS "pf_steps_finance"           ON pre_fund_approval_steps;
DROP POLICY IF EXISTS "pf_transactions_finance"    ON pre_fund_transactions;
DROP POLICY IF EXISTS "pf_recons_finance"          ON pre_fund_reconciliations;
DROP POLICY IF EXISTS "pf_bank_unmatched_access"   ON pre_fund_bank_unmatched;
DROP POLICY IF EXISTS "pf_requests_step_assignee"  ON pre_fund_requests;
DROP POLICY IF EXISTS "pf_steps_assignee_select"   ON pre_fund_approval_steps;
DROP POLICY IF EXISTS "pf_steps_assignee_update"   ON pre_fund_approval_steps;

CREATE POLICY "pf_period_types_finance"   ON pre_fund_period_types FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

CREATE POLICY "pf_settings_finance"       ON pre_fund_settings FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

CREATE POLICY "pf_requests_finance"       ON pre_fund_requests FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

CREATE POLICY "pf_steps_finance"          ON pre_fund_approval_steps FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

CREATE POLICY "pf_transactions_finance"   ON pre_fund_transactions FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

CREATE POLICY "pf_recons_finance"         ON pre_fund_reconciliations FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

CREATE POLICY "pf_bank_unmatched_access"  ON pre_fund_bank_unmatched FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

-- Verify — should return 7 rows
SELECT tablename, policyname
FROM   pg_policies
WHERE  policyname LIKE 'pf_%'
  AND  tablename LIKE 'pre_fund_%'
ORDER  BY tablename;

-- ============================================================================
-- Pre-Funding RLS Quick-Fix
-- Run this in Supabase SQL Editor if you see "violates row-level security"
-- errors. Safe to run multiple times.
-- ============================================================================

-- 1. Make sure RLS is enabled on all pre-funding tables
ALTER TABLE IF EXISTS pre_fund_period_types     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_approval_steps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_reconciliations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_bank_unmatched   ENABLE ROW LEVEL SECURITY;

-- 2. Drop old / conflicting policies so CREATE never fails on re-run
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

-- 3. Recreate all policies — Finance / Admin / Super Admin full access
CREATE POLICY "pf_period_types_finance"
  ON pre_fund_period_types FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND role IN ('super_admin','admin','financialAdmin')) );

CREATE POLICY "pf_settings_finance"
  ON pre_fund_settings FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND role IN ('super_admin','admin','financialAdmin')) );

CREATE POLICY "pf_requests_finance"
  ON pre_fund_requests FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND role IN ('super_admin','admin','financialAdmin')) );

CREATE POLICY "pf_steps_finance"
  ON pre_fund_approval_steps FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND role IN ('super_admin','admin','financialAdmin')) );

CREATE POLICY "pf_transactions_finance"
  ON pre_fund_transactions FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND role IN ('super_admin','admin','financialAdmin')) );

CREATE POLICY "pf_recons_finance"
  ON pre_fund_reconciliations FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND role IN ('super_admin','admin','financialAdmin')) );

CREATE POLICY "pf_bank_unmatched_access"
  ON pre_fund_bank_unmatched FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND role IN ('super_admin','admin','financialAdmin')) );

-- 4. Confirm — this should return 7 rows
SELECT tablename, policyname
FROM   pg_policies
WHERE  policyname LIKE 'pf_%'
ORDER  BY tablename;

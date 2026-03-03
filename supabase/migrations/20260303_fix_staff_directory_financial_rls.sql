-- Fix: Allow super_admin to view all financial data in Staff Directory
-- Adds super_admin to the admin-level SELECT policies on:
--   1. down_payment_requests
--   2. withdrawal_requests
--   3. operational_cost_submissions

-- ────────────────────────────────────────────────────────────
-- 1. down_payment_requests — replace admin policy with one
--    that also includes super_admin
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "down_payment_requests_admin_all" ON down_payment_requests;
CREATE POLICY "down_payment_requests_admin_all" ON down_payment_requests
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM profiles
      WHERE role IN ('admin', 'financialAdmin', 'ict', 'super_admin')
    )
  );

-- ────────────────────────────────────────────────────────────
-- 2. withdrawal_requests — add / replace super_admin policy
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "withdrawal_requests_super_admin_all" ON withdrawal_requests;
CREATE POLICY "withdrawal_requests_super_admin_all" ON withdrawal_requests
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'super_admin'
    )
  );

-- ────────────────────────────────────────────────────────────
-- 3. operational_cost_submissions — add / replace super_admin policy
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "operational_cost_submissions_super_admin_all" ON operational_cost_submissions;
CREATE POLICY "operational_cost_submissions_super_admin_all" ON operational_cost_submissions
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'super_admin'
    )
  );

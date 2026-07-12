-- ============================================================
-- Admin RLS bypass for wallets, wallet_transactions, withdrawal_requests
-- Allows users with role in ('admin','superAdmin','financialAdmin')
-- to SELECT all rows regardless of user_id ownership.
-- Apply via: Supabase Dashboard → SQL Editor → run this file.
-- ============================================================

-- 1. wallets table ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can view all wallets" ON wallets;
CREATE POLICY "Admins can view all wallets"
  ON wallets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superAdmin', 'financialAdmin')
    )
  );

-- 2. wallet_transactions table ────────────────────────────────
DROP POLICY IF EXISTS "Admins can view all wallet transactions" ON wallet_transactions;
CREATE POLICY "Admins can view all wallet transactions"
  ON wallet_transactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superAdmin', 'financialAdmin')
    )
  );

-- 3. withdrawal_requests table ────────────────────────────────
DROP POLICY IF EXISTS "Admins can view all withdrawal requests" ON withdrawal_requests;
CREATE POLICY "Admins can view all withdrawal requests"
  ON withdrawal_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superAdmin', 'financialAdmin')
    )
  );

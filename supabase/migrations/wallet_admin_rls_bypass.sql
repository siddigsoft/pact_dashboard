-- ============================================================
-- Admin RLS bypass for wallets, wallet_transactions, withdrawal_requests
-- Allows users with role in ('admin','superAdmin','financialAdmin')
-- to SELECT, INSERT, and UPDATE all rows regardless of user_id ownership.
--
-- ⚠️  REQUIRED before running the Admin Backfill in Wallets Admin.
-- Apply via: Supabase Dashboard → SQL Editor → run this file.
-- ============================================================

-- ── 1. wallets table ─────────────────────────────────────────────────────────
-- SELECT
DROP POLICY IF EXISTS "Admins can view all wallets" ON wallets;
CREATE POLICY "Admins can view all wallets"
  ON wallets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superAdmin', 'financialAdmin')
    )
  );

-- INSERT (needed to create wallets for users who don't have one yet)
DROP POLICY IF EXISTS "Admins can create wallets for any user" ON wallets;
CREATE POLICY "Admins can create wallets for any user"
  ON wallets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superAdmin', 'financialAdmin')
    )
  );

-- UPDATE (needed to update balance after crediting a site visit)
DROP POLICY IF EXISTS "Admins can update any wallet" ON wallets;
CREATE POLICY "Admins can update any wallet"
  ON wallets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superAdmin', 'financialAdmin')
    )
  );

-- ── 2. wallet_transactions table ─────────────────────────────────────────────
-- SELECT
DROP POLICY IF EXISTS "Admins can view all wallet transactions" ON wallet_transactions;
CREATE POLICY "Admins can view all wallet transactions"
  ON wallet_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superAdmin', 'financialAdmin')
    )
  );

-- INSERT (needed to record transactions for any user during backfill)
DROP POLICY IF EXISTS "Admins can create wallet transactions for any user" ON wallet_transactions;
CREATE POLICY "Admins can create wallet transactions for any user"
  ON wallet_transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superAdmin', 'financialAdmin')
    )
  );

-- ── 3. withdrawal_requests table ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can view all withdrawal requests" ON withdrawal_requests;
CREATE POLICY "Admins can view all withdrawal requests"
  ON withdrawal_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superAdmin', 'financialAdmin')
    )
  );

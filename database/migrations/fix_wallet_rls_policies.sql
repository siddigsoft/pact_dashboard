-- ====================================
-- Fix Wallet RLS Policies
-- Add missing Row Level Security policies for wallets table
-- ====================================

-- Enable RLS on wallets table (if not already enabled)
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their own wallet" ON wallets;
DROP POLICY IF EXISTS "Users can insert their own wallet" ON wallets;
DROP POLICY IF EXISTS "Users can update their own wallet" ON wallets;
DROP POLICY IF EXISTS "Admins can view all wallets" ON wallets;
DROP POLICY IF EXISTS "Admins can manage all wallets" ON wallets;

-- Allow users to view their own wallet
CREATE POLICY "Users can view their own wallet"
  ON wallets FOR SELECT
  USING (auth.uid() = user_id);

-- Allow users to insert their own wallet (for auto-creation)
CREATE POLICY "Users can insert their own wallet"
  ON wallets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own wallet
CREATE POLICY "Users can update their own wallet"
  ON wallets FOR UPDATE
  USING (auth.uid() = user_id);

-- Allow admins to view all wallets
CREATE POLICY "Admins can view all wallets"
  ON wallets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'fom')
    )
  );

-- Allow admins to manage all wallets
CREATE POLICY "Admins can manage all wallets"
  ON wallets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Also fix wallet_transactions RLS
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own transactions" ON wallet_transactions;
DROP POLICY IF EXISTS "Admins can view all transactions" ON wallet_transactions;
DROP POLICY IF EXISTS "Admins can manage all transactions" ON wallet_transactions;

CREATE POLICY "Users can view their own transactions"
  ON wallet_transactions FOR SELECT
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM wallets 
      WHERE wallets.id = wallet_transactions.wallet_id 
      AND wallets.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all transactions"
  ON wallet_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'fom')
    )
  );

CREATE POLICY "Admins can manage all transactions"
  ON wallet_transactions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- ====================================
-- RLS Policies Added!
-- ====================================
-- Summary:
-- ✅ Wallets table: 5 policies (view own, insert own, update own, admin view all, admin manage all)
-- ✅ Wallet transactions table: 3 policies (view own, admin view all, admin manage all)
-- ====================================

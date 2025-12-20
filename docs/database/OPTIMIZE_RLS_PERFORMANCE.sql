-- ============================================================================
-- OPTIMIZE RLS POLICIES FOR CRITICAL TABLES
-- ============================================================================
-- This script rewrites RLS policies to use (SELECT auth.uid()) instead of
-- auth.uid() directly, which improves performance by evaluating once per query
-- instead of once per row.
-- ============================================================================

-- ============================================================================
-- 1. PROFILES TABLE
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;

-- Recreate with optimized auth calls
CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT USING (
    (SELECT auth.uid()) IS NOT NULL
  );

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (
    id = (SELECT auth.uid())
  );

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (
    id = (SELECT auth.uid())
  );


-- ============================================================================
-- 2. WALLETS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "wallets_select" ON public.wallets;
DROP POLICY IF EXISTS "Users can view own wallet" ON public.wallets;
DROP POLICY IF EXISTS "Finance roles can view wallets" ON public.wallets;
DROP POLICY IF EXISTS "Admins can manage wallets" ON public.wallets;
DROP POLICY IF EXISTS "wallets_insert_admin" ON public.wallets;
DROP POLICY IF EXISTS "wallets_update_admin" ON public.wallets;
DROP POLICY IF EXISTS "wallets_delete_admin" ON public.wallets;

CREATE POLICY "wallets_select_own" ON public.wallets
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR public.is_admin_or_super()
    OR public.is_financial_admin()
  );

CREATE POLICY "wallets_insert_admin" ON public.wallets
  FOR INSERT WITH CHECK (
    public.is_admin_or_super() OR public.is_financial_admin()
  );

CREATE POLICY "wallets_update_admin" ON public.wallets
  FOR UPDATE USING (
    public.is_admin_or_super() OR public.is_financial_admin()
  );

CREATE POLICY "wallets_delete_admin" ON public.wallets
  FOR DELETE USING (
    public.is_admin_or_super()
  );


-- ============================================================================
-- 3. WALLET_TRANSACTIONS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "wallet_tx_select" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Admins can update transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Users can view own transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Finance roles can view all transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Finance roles can manage transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "wallet_tx_insert_admin" ON public.wallet_transactions;
DROP POLICY IF EXISTS "wallet_tx_update_admin" ON public.wallet_transactions;
DROP POLICY IF EXISTS "wallet_tx_delete_admin" ON public.wallet_transactions;

CREATE POLICY "wallet_tx_select_own" ON public.wallet_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.wallets w 
      WHERE w.id = wallet_id 
      AND w.user_id = (SELECT auth.uid())
    )
    OR public.is_admin_or_super()
    OR public.is_financial_admin()
  );

CREATE POLICY "wallet_tx_insert_admin" ON public.wallet_transactions
  FOR INSERT WITH CHECK (
    public.is_admin_or_super() OR public.is_financial_admin()
  );

CREATE POLICY "wallet_tx_update_admin" ON public.wallet_transactions
  FOR UPDATE USING (
    public.is_admin_or_super() OR public.is_financial_admin()
  );

CREATE POLICY "wallet_tx_delete_admin" ON public.wallet_transactions
  FOR DELETE USING (
    public.is_admin_or_super()
  );


-- ============================================================================
-- 4. MMP_SITE_ENTRIES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Allow select mmp_site_entries for authenticated" ON public.mmp_site_entries;
DROP POLICY IF EXISTS "Allow insert mmp_site_entries for authenticated" ON public.mmp_site_entries;
DROP POLICY IF EXISTS "Allow update mmp_site_entries for authenticated" ON public.mmp_site_entries;
DROP POLICY IF EXISTS "Users can view accessible site entries" ON public.mmp_site_entries;
DROP POLICY IF EXISTS "Assigned users can update site entries" ON public.mmp_site_entries;
DROP POLICY IF EXISTS "Admins can manage site entries" ON public.mmp_site_entries;

CREATE POLICY "mmp_site_entries_select" ON public.mmp_site_entries
  FOR SELECT USING (
    (SELECT auth.uid()) IS NOT NULL
  );

CREATE POLICY "mmp_site_entries_insert" ON public.mmp_site_entries
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
  );

CREATE POLICY "mmp_site_entries_update" ON public.mmp_site_entries
  FOR UPDATE USING (
    assigned_data_collector_id = (SELECT auth.uid())
    OR assigned_coordinator_id = (SELECT auth.uid())
    OR public.is_admin_or_super()
    OR public.is_fom()
  );

CREATE POLICY "mmp_site_entries_delete" ON public.mmp_site_entries
  FOR DELETE USING (
    public.is_admin_or_super()
  );


-- ============================================================================
-- 5. USER_SETTINGS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "user_settings_select_own" ON public.user_settings;
DROP POLICY IF EXISTS "user_settings_insert_own" ON public.user_settings;
DROP POLICY IF EXISTS "user_settings_update_own" ON public.user_settings;
DROP POLICY IF EXISTS "user_settings_modify_own" ON public.user_settings;
DROP POLICY IF EXISTS "Users can manage own settings" ON public.user_settings;

CREATE POLICY "user_settings_select_own" ON public.user_settings
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
  );

CREATE POLICY "user_settings_insert_own" ON public.user_settings
  FOR INSERT WITH CHECK (
    user_id = (SELECT auth.uid())
  );

CREATE POLICY "user_settings_update_own" ON public.user_settings
  FOR UPDATE USING (
    user_id = (SELECT auth.uid())
  );

CREATE POLICY "user_settings_delete_own" ON public.user_settings
  FOR DELETE USING (
    user_id = (SELECT auth.uid())
  );


-- ============================================================================
-- 6. PAYOUT_REQUESTS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "payout_select" ON public.payout_requests;
DROP POLICY IF EXISTS "payout_insert_self" ON public.payout_requests;
DROP POLICY IF EXISTS "Users can view their own payout requests" ON public.payout_requests;
DROP POLICY IF EXISTS "Users can create their own payout requests" ON public.payout_requests;

CREATE POLICY "payout_requests_select" ON public.payout_requests
  FOR SELECT USING (
    requester_id = (SELECT auth.uid())
    OR public.is_admin_or_super()
    OR public.is_financial_admin()
  );

CREATE POLICY "payout_requests_insert" ON public.payout_requests
  FOR INSERT WITH CHECK (
    requester_id = (SELECT auth.uid())
  );

CREATE POLICY "payout_requests_update" ON public.payout_requests
  FOR UPDATE USING (
    public.is_admin_or_super() OR public.is_financial_admin()
  );

CREATE POLICY "payout_requests_delete" ON public.payout_requests
  FOR DELETE USING (
    public.is_admin_or_super()
  );


-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT 
  tablename, 
  policyname,
  cmd
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'wallets', 'wallet_transactions', 'mmp_site_entries', 'user_settings', 'payout_requests')
ORDER BY tablename, policyname;

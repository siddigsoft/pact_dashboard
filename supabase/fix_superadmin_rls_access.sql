-- =============================================================================
-- FIX: Grant super_admin SELECT access to mmp_files, wallets, wallet_transactions
--
-- Uses the super_admins table (same check the app uses for isSuperAdmin),
-- NOT profiles.role — because the super-admin user's profiles.role may not
-- be set to 'super_admin'.
--
-- HOW TO APPLY:
--   Supabase → SQL Editor → paste → Run
-- =============================================================================

-- 1. mmp_files
DROP POLICY IF EXISTS "superadmin_read_all_mmp_files" ON public.mmp_files;
CREATE POLICY "superadmin_read_all_mmp_files"
  ON public.mmp_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.super_admins
      WHERE super_admins.user_id = (SELECT auth.uid())
        AND super_admins.is_active = true
    )
  );

-- 2. wallets
DROP POLICY IF EXISTS "superadmin_read_all_wallets" ON public.wallets;
CREATE POLICY "superadmin_read_all_wallets"
  ON public.wallets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.super_admins
      WHERE super_admins.user_id = (SELECT auth.uid())
        AND super_admins.is_active = true
    )
  );

-- 3. wallet_transactions
DROP POLICY IF EXISTS "superadmin_read_all_wallet_transactions" ON public.wallet_transactions;
CREATE POLICY "superadmin_read_all_wallet_transactions"
  ON public.wallet_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.super_admins
      WHERE super_admins.user_id = (SELECT auth.uid())
        AND super_admins.is_active = true
    )
  );

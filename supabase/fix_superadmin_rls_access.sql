-- =============================================================================
-- FIX: Grant super_admin / admin roles full SELECT access to
--      mmp_files, wallets, and wallet_transactions
--
-- WHY NEEDED:
--   The RLS policies on these three tables only allow coordinators (by
--   coordinator_id match) or a narrow set of roles ('admin', 'supervisor',
--   'financialAdmin') to read rows.  super_admin / superAdmin are missing,
--   so Super Admin users get 0 rows on the Data Management Center page.
--
-- HOW TO APPLY:
--   1. Open your Supabase project → SQL Editor (left sidebar)
--   2. Paste this entire file and click Run
--   3. Hard-refresh the app (Ctrl+Shift+R)
--      → MMP names, Wallets, and Transactions will all populate
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. mmp_files — super_admin can read all MMP files
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_read_all_mmp_files" ON public.mmp_files;

CREATE POLICY "superadmin_read_all_mmp_files"
  ON public.mmp_files
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN (
          'super_admin', 'superAdmin',
          'admin',
          'fom', 'hub_supervisor',
          'ict', 'ictSupport'
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. wallets — super_admin can read all wallets
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_read_all_wallets" ON public.wallets;

CREATE POLICY "superadmin_read_all_wallets"
  ON public.wallets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN (
          'super_admin', 'superAdmin',
          'admin', 'financialAdmin',
          'fom', 'hub_supervisor',
          'ict', 'ictSupport'
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. wallet_transactions — super_admin can read all transactions
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_read_all_wallet_transactions" ON public.wallet_transactions;

CREATE POLICY "superadmin_read_all_wallet_transactions"
  ON public.wallet_transactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN (
          'super_admin', 'superAdmin',
          'admin', 'financialAdmin',
          'fom', 'hub_supervisor',
          'ict', 'ictSupport'
        )
    )
  );

-- Allow super admins to delete wallet transactions (Data Management delete transaction)
-- Super admins are in super_admins table; existing DELETE policy only allows has_role('admin'|'financialAdmin').
-- public.is_super_admin() is SECURITY DEFINER and safe for RLS.

DROP POLICY IF EXISTS "wallet_tx_delete_super_admin" ON public.wallet_transactions;
CREATE POLICY "wallet_tx_delete_super_admin" ON public.wallet_transactions
  FOR DELETE
  TO authenticated
  USING (public.is_super_admin());

COMMENT ON POLICY "wallet_tx_delete_super_admin" ON public.wallet_transactions IS
  'Super admins (super_admins table) can delete any wallet transaction for Data Management.';

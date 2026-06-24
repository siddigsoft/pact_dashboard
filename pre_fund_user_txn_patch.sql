-- ============================================================
-- Pre-Fund Transactions: schema additions only
-- The link_payment_atomically_rpc function (11-arg, canonical)
-- is defined in pre_funding_atomic_rpcs.sql — NOT here.
--
-- Run AFTER pre_funding_migration.sql AND pre_funding_atomic_rpcs.sql
-- Safe to re-run (IF NOT EXISTS guards throughout).
-- ============================================================

-- 1. Add columns to pre_fund_transactions (safe if already present)
ALTER TABLE pre_fund_transactions
  ADD COLUMN IF NOT EXISTS user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receipt_url TEXT;

CREATE INDEX IF NOT EXISTS idx_pf_transactions_user ON pre_fund_transactions(user_id);

-- 2. RLS: field staff can see their own transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pre_fund_transactions'
      AND policyname = 'pf_txn_self_select'
  ) THEN
    CREATE POLICY "pf_txn_self_select" ON pre_fund_transactions
      FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR created_by = auth.uid());
  END IF;
END$$;

-- 3. Drop the legacy 9-arg overload if it still exists from an older deployment.
-- The canonical 11-arg link_payment_atomically_rpc in pre_funding_atomic_rpcs.sql
-- handles all callers (p_user_id and p_receipt_url default to NULL).
DROP FUNCTION IF EXISTS link_payment_atomically_rpc(UUID,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,DATE,UUID);

NOTIFY pgrst, 'reload schema';

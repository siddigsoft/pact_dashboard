-- ============================================================
-- Pre-Fund Transactions: add user_id + receipt_url columns
-- and update link_payment_atomically_rpc to accept them
-- Run in Supabase SQL editor (safe to re-run, all IF NOT EXISTS)
-- ============================================================

-- 1. Add missing columns to pre_fund_transactions
ALTER TABLE pre_fund_transactions
  ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receipt_url TEXT;

CREATE INDEX IF NOT EXISTS idx_pf_transactions_user ON pre_fund_transactions(user_id);

-- 2. Add RLS policy so field staff can see their own transactions
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

-- 3. Replace link_payment_atomically_rpc to accept p_user_id + p_receipt_url
CREATE OR REPLACE FUNCTION link_payment_atomically_rpc(
  p_fund_id      UUID,
  p_amount       NUMERIC,
  p_currency     TEXT,
  p_source_table TEXT,
  p_source_id    UUID,
  p_reference    TEXT    DEFAULT NULL,
  p_description  TEXT    DEFAULT NULL,
  p_payment_date DATE    DEFAULT CURRENT_DATE,
  p_created_by   UUID    DEFAULT NULL,
  p_user_id      UUID    DEFAULT NULL,
  p_receipt_url  TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance     NUMERIC;
  v_txn_id      UUID;
  v_back_col    TEXT;
BEGIN
  -- Lock the fund row
  SELECT available_balance INTO v_balance
  FROM pre_fund_requests
  WHERE id = p_fund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fund not found.');
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Insufficient fund balance. Available: %s, Requested: %s', v_balance, p_amount));
  END IF;

  -- Insert transaction record
  INSERT INTO pre_fund_transactions (
    pre_fund_request_id, transaction_type, amount, currency,
    reference, description, transaction_date, reconciled,
    source_table, source_id, created_by, user_id, receipt_url
  ) VALUES (
    p_fund_id, 'payment', p_amount, p_currency,
    p_reference,
    COALESCE(p_description, 'Auto-linked from ' || p_source_table),
    p_payment_date, false,
    p_source_table, p_source_id, p_created_by, p_user_id, p_receipt_url
  )
  RETURNING id INTO v_txn_id;

  -- Deduct balance + increment paid_amount
  UPDATE pre_fund_requests
  SET available_balance = available_balance - p_amount,
      paid_amount       = COALESCE(paid_amount, 0) + p_amount,
      updated_at        = now()
  WHERE id = p_fund_id;

  -- Back-link the source row (best-effort)
  IF p_source_table = 'operational_cost_submissions' THEN
    v_back_col := 'pre_fund_transaction_id';
    UPDATE operational_cost_submissions
    SET pre_fund_transaction_id = v_txn_id
    WHERE id = p_source_id;
  ELSIF p_source_table = 'down_payment_requests' THEN
    UPDATE down_payment_requests
    SET pre_fund_transaction_id = v_txn_id
    WHERE id = p_source_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_txn_id);
END;
$$;

REVOKE ALL ON FUNCTION link_payment_atomically_rpc(UUID,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,DATE,UUID,UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_payment_atomically_rpc(UUID,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,DATE,UUID,UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_payment_atomically_rpc(UUID,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,DATE,UUID,UUID,TEXT) TO authenticated;

-- Notify PostgREST to reload
NOTIFY pgrst, 'reload schema';

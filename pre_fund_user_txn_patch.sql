-- ============================================================
-- Pre-Fund Transactions: add user_id + receipt_url columns
-- and extend link_payment_atomically_rpc with the new params
-- while preserving ALL existing GL posting + idempotency logic.
--
-- Run AFTER pre_funding_migration.sql AND pre_funding_atomic_rpcs.sql
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT guards).
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

-- 3. Extend link_payment_atomically_rpc
--    NEW params: p_user_id (field staff submitter), p_receipt_url
--    Preserves EXACTLY: _assert_finance_role(), balance lock, GL posting,
--    idempotency key, bridge log, back-link, source_table/source_id.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION link_payment_atomically_rpc(
  p_fund_id       UUID,
  p_amount        NUMERIC,
  p_currency      TEXT,
  p_source_table  TEXT,
  p_source_id     UUID,
  p_reference     TEXT    DEFAULT NULL,
  p_description   TEXT    DEFAULT NULL,
  p_payment_date  DATE    DEFAULT CURRENT_DATE,
  p_created_by    UUID    DEFAULT NULL,
  -- NEW optional params — old callers continue to work without them
  p_user_id       UUID    DEFAULT NULL,
  p_receipt_url   TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn_id       UUID;
  v_new_balance  NUMERIC;
  v_cur_balance  NUMERIC;
  v_gl_liab_code TEXT;
  v_gl_exp_code  TEXT;
  v_liab_id      UUID;
  v_exp_id       UUID;
  v_je_id        UUID;
  v_ik           TEXT;
BEGIN
  -- Authorization: finance/admin role required (unchanged)
  PERFORM _assert_finance_role();

  -- Lock the fund row and read balance + GL account codes atomically
  SELECT available_balance, gl_liability_account, gl_expense_account
  INTO   v_cur_balance, v_gl_liab_code, v_gl_exp_code
  FROM   pre_fund_requests WHERE id = p_fund_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fund not found.');
  END IF;

  -- Hard failure on insufficient balance — never silently floor to zero
  IF v_cur_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient pre-fund balance (' || v_cur_balance::TEXT ||
               ' ' || p_currency || ' available; ' || p_amount::TEXT || ' requested).'
    );
  END IF;

  v_new_balance := v_cur_balance - p_amount;

  -- Insert transaction record (now includes user_id + receipt_url)
  INSERT INTO pre_fund_transactions (
    pre_fund_request_id, transaction_type, amount, currency,
    reference, description, transaction_date, reconciled,
    source_table, source_id, created_by, user_id, receipt_url
  ) VALUES (
    p_fund_id, 'payment', p_amount, p_currency,
    p_reference,
    COALESCE(p_description, 'Auto-linked from ' || p_source_table),
    p_payment_date, false,
    p_source_table, p_source_id,
    p_created_by,
    COALESCE(p_user_id, p_created_by),  -- fall back to created_by if user_id not supplied
    p_receipt_url
  ) RETURNING id INTO v_txn_id;

  -- Deduct balance + increment paid_amount
  UPDATE pre_fund_requests
  SET available_balance = v_new_balance,
      paid_amount       = COALESCE(paid_amount, 0) + p_amount
  WHERE id = p_fund_id;

  -- Back-link source row
  IF p_source_table = 'operational_cost_submissions' THEN
    UPDATE operational_cost_submissions
    SET pre_fund_transaction_id = v_txn_id WHERE id = p_source_id;
  ELSIF p_source_table = 'down_payment_requests' THEN
    UPDATE down_payment_requests
    SET pre_fund_transaction_id = v_txn_id WHERE id = p_source_id;
  END IF;

  -- GL posting: pre_fund_paid event (same transaction — atomic)
  --   DR: Pre-Fund Liability (obligation reduced — pre-fund balance consumed)
  --   CR: Cash / Bank (cash outflow recorded against the pre-fund)
  -- Idempotency key prevents double-posting on RPC retry.
  -- Only fires when both GL codes are configured on the fund.
  IF v_gl_liab_code IS NOT NULL AND v_gl_exp_code IS NOT NULL THEN
    SELECT id INTO v_liab_id FROM acct_accounts WHERE code = v_gl_liab_code LIMIT 1;
    SELECT id INTO v_exp_id  FROM acct_accounts WHERE code = v_gl_exp_code  LIMIT 1;

    IF v_liab_id IS NOT NULL AND v_exp_id IS NOT NULL THEN
      v_ik := 'pf-paid-' || p_source_table || '-' || p_source_id::TEXT;

      IF NOT EXISTS (SELECT 1 FROM acct_journal_entries WHERE idempotency_key = v_ik) THEN
        INSERT INTO acct_journal_entries (
          description_en, description_ar, posting_date, status,
          source_type, source_id, idempotency_key, created_by
        ) VALUES (
          'Pre-Fund Disbursement — ' || COALESCE(p_description, p_source_table),
          'صرف التمويل المسبق — '    || COALESCE(p_description, p_source_table),
          p_payment_date, 'draft',
          p_source_table, p_source_id, v_ik, p_created_by
        ) RETURNING id INTO v_je_id;

        INSERT INTO acct_journal_lines (
          entry_id, line_no, account_id, debit_credit,
          original_amount, original_currency, functional_amount, functional_currency,
          description, function
        ) VALUES
          (v_je_id, 1, v_liab_id, 'DR',
           p_amount, p_currency, p_amount, p_currency,
           'Pre-fund disbursement — liability released', 'program'),
          (v_je_id, 2, v_exp_id,  'CR',
           p_amount, p_currency, p_amount, p_currency,
           'Pre-fund disbursement — cash/bank outflow', 'program');

        INSERT INTO acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
        VALUES (p_source_table, p_source_id, 'pre_fund_paid', 'success', v_je_id);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_txn_id,
    'new_balance', v_new_balance
  );
END;
$$;

-- Security: authenticated only — never PUBLIC
REVOKE ALL ON FUNCTION link_payment_atomically_rpc(UUID,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,DATE,UUID,UUID,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION link_payment_atomically_rpc(UUID,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,DATE,UUID,UUID,TEXT) TO authenticated;

-- Also revoke old 9-param signature (created by pre_funding_atomic_rpcs.sql)
-- and re-grant; PostgreSQL treats different signatures as separate overloads,
-- so the old callers still work via the original signature in pre_funding_atomic_rpcs.sql.
-- To avoid any ambiguity we DROP the old overload and let this one handle all calls.
-- Uncomment these lines ONLY if you want a single canonical overload:
-- DROP FUNCTION IF EXISTS link_payment_atomically_rpc(UUID,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,DATE,UUID);

NOTIFY pgrst, 'reload schema';

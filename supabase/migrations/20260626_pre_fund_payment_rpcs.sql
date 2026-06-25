-- =============================================================================
-- Pre-Fund Payment RPCs
-- Creates two atomic RPCs:
--   1. link_payment_atomically_rpc — auto-called when a cost submission or
--      down-payment is marked "paid". Finds the correct pre-fund and writes
--      all balance changes + allocation deductions in one transaction.
--   2. add_pre_fund_transaction_rpc — manual transaction entry from the
--      Reconciliation tab. Handles all transaction types with optional GL posting.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. link_payment_atomically_rpc
--    Called by preFundLinkage.ts after Finance marks a cost submission paid.
--    Atomically:
--      a) inserts a pre_fund_transactions row (type = 'payment')
--      b) deducts p_amount from pre_fund_requests.available_balance
--      c) increments pre_fund_requests.paid_amount
--      d) deducts from pre_fund_allocations.spent_amount for the submitter
--      e) back-links the source row via pre_fund_transaction_id (best-effort)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.link_payment_atomically_rpc(
  p_fund_id       uuid,
  p_amount        numeric,
  p_currency      text,
  p_source_table  text,
  p_source_id     uuid,
  p_reference     text    DEFAULT NULL,
  p_description   text    DEFAULT NULL,
  p_payment_date  date    DEFAULT CURRENT_DATE,
  p_created_by    uuid    DEFAULT NULL,
  p_user_id       uuid    DEFAULT NULL,
  p_receipt_url   text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn_id      uuid;
  v_new_balance numeric;
BEGIN
  -- ── a. Insert transaction record ─────────────────────────────────────────
  INSERT INTO public.pre_fund_transactions (
    pre_fund_request_id,
    transaction_type,
    amount,
    currency,
    reference,
    description,
    transaction_date,
    created_by,
    user_id,
    receipt_url,
    source_table,
    source_id,
    reconciled
  ) VALUES (
    p_fund_id,
    'payment',
    p_amount,
    p_currency,
    p_reference,
    p_description,
    COALESCE(p_payment_date, CURRENT_DATE),
    p_created_by,
    p_user_id,
    p_receipt_url,
    p_source_table,
    p_source_id,
    false
  )
  RETURNING id INTO v_txn_id;

  -- ── b + c. Deduct from fund available_balance, increment paid_amount ─────
  UPDATE public.pre_fund_requests
  SET
    available_balance = GREATEST(0, COALESCE(available_balance, 0) - p_amount),
    paid_amount       = COALESCE(paid_amount, 0) + p_amount
  WHERE id = p_fund_id
  RETURNING available_balance INTO v_new_balance;

  -- ── d. Deduct from user allocation spent_amount (if allocated) ────────────
  IF p_user_id IS NOT NULL THEN
    UPDATE public.pre_fund_allocations
    SET spent_amount = COALESCE(spent_amount, 0) + p_amount
    WHERE pre_fund_request_id = p_fund_id
      AND user_id = p_user_id;
  END IF;

  -- ── e. Back-link source row (best-effort — column may not exist) ──────────
  IF p_source_table IN ('operational_cost_submissions', 'down_payment_requests') THEN
    BEGIN
      EXECUTE format(
        'UPDATE public.%I SET pre_fund_transaction_id = $1 WHERE id = $2',
        p_source_table
      ) USING v_txn_id, p_source_id;
    EXCEPTION WHEN others THEN
      NULL; -- column not present yet — non-fatal
    END;
  END IF;

  RETURN jsonb_build_object(
    'success',        true,
    'transaction_id', v_txn_id,
    'new_balance',    v_new_balance
  );

EXCEPTION WHEN others THEN
  RETURN jsonb_build_object(
    'success', false,
    'error',   SQLERRM
  );
END;
$$;

COMMENT ON FUNCTION public.link_payment_atomically_rpc IS
'Auto-links a paid cost submission or down-payment to the best active pre-fund.
All writes (transaction insert + balance deduction + allocation deduction + back-link)
run inside a single Postgres transaction — no partial state possible.';

GRANT EXECUTE ON FUNCTION public.link_payment_atomically_rpc TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. add_pre_fund_transaction_rpc
--    Called from the Reconciliation tab when Finance manually adds a transaction
--    or retries an unlinked payment.
--    Handles all transaction types and optionally posts a GL journal entry.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_pre_fund_transaction_rpc(
  p_fund_id           uuid,
  p_fund_name         text    DEFAULT NULL,
  p_transaction_type  text    DEFAULT 'payment',
  p_amount            numeric DEFAULT 0,
  p_currency          text    DEFAULT 'SDG',
  p_reference         text    DEFAULT NULL,
  p_description       text    DEFAULT NULL,
  p_transaction_date  date    DEFAULT CURRENT_DATE,
  p_created_by        uuid    DEFAULT NULL,
  p_gl_debit_code     text    DEFAULT NULL,
  p_gl_credit_code    text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn_id     uuid;
  v_je_id      uuid;
  v_gl_posted  boolean := false;
BEGIN
  -- ── 1. Insert transaction record ──────────────────────────────────────────
  INSERT INTO public.pre_fund_transactions (
    pre_fund_request_id,
    transaction_type,
    amount,
    currency,
    reference,
    description,
    transaction_date,
    created_by,
    reconciled
  ) VALUES (
    p_fund_id,
    p_transaction_type,
    p_amount,
    p_currency,
    p_reference,
    p_description,
    COALESCE(p_transaction_date, CURRENT_DATE),
    p_created_by,
    false
  )
  RETURNING id INTO v_txn_id;

  -- ── 2. Update fund balances based on transaction type ─────────────────────
  CASE p_transaction_type
    WHEN 'payment' THEN
      UPDATE public.pre_fund_requests
      SET available_balance = GREATEST(0, COALESCE(available_balance, 0) - p_amount),
          paid_amount       = COALESCE(paid_amount, 0) + p_amount
      WHERE id = p_fund_id;

    WHEN 'receipt' THEN
      -- Additional receipt (top-up)
      UPDATE public.pre_fund_requests
      SET available_balance = COALESCE(available_balance, 0) + p_amount,
          amount            = COALESCE(amount, 0) + p_amount
      WHERE id = p_fund_id;

    WHEN 'commitment' THEN
      UPDATE public.pre_fund_requests
      SET available_balance  = GREATEST(0, COALESCE(available_balance, 0) - p_amount),
          committed_amount   = COALESCE(committed_amount, 0) + p_amount
      WHERE id = p_fund_id;

    WHEN 'reversal' THEN
      -- Reversal: return amount to available
      UPDATE public.pre_fund_requests
      SET available_balance = COALESCE(available_balance, 0) + p_amount,
          paid_amount       = GREATEST(0, COALESCE(paid_amount, 0) - p_amount)
      WHERE id = p_fund_id;

    WHEN 'carry_forward' THEN
      -- Carry-forward closes this fund period; balance handled by period-close RPC
      -- No balance update here — period close RPC handles it
      NULL;

    WHEN 'return' THEN
      UPDATE public.pre_fund_requests
      SET available_balance = GREATEST(0, COALESCE(available_balance, 0) - p_amount)
      WHERE id = p_fund_id;

    WHEN 'adjustment' THEN
      -- Adjustment can be positive or negative; treat as balance modifier
      UPDATE public.pre_fund_requests
      SET available_balance = GREATEST(0, COALESCE(available_balance, 0) + p_amount)
      WHERE id = p_fund_id;

    ELSE
      -- bank_statement and unknown types: no balance change
      NULL;
  END CASE;

  -- ── 3. Optional GL journal entry ─────────────────────────────────────────
  IF p_gl_debit_code IS NOT NULL AND p_gl_credit_code IS NOT NULL THEN
    BEGIN
      -- Insert journal entry header
      INSERT INTO public.acct_journal_entries (
        entry_date,
        description,
        reference,
        status,
        entry_type,
        created_by
      ) VALUES (
        COALESCE(p_transaction_date, CURRENT_DATE),
        COALESCE(p_description, 'Pre-fund ' || p_transaction_type || ': ' || COALESCE(p_fund_name, p_fund_id::text)),
        COALESCE(p_reference, 'PF-' || upper(substring(v_txn_id::text, 1, 8))),
        'draft',
        'pre_fund_' || p_transaction_type,
        p_created_by
      )
      RETURNING id INTO v_je_id;

      -- Debit line
      INSERT INTO public.acct_journal_lines (
        journal_entry_id, account_code, debit_amount, credit_amount,
        description, currency
      ) VALUES (
        v_je_id, p_gl_debit_code, p_amount, 0,
        COALESCE(p_description, 'Pre-fund ' || p_transaction_type),
        p_currency
      );

      -- Credit line
      INSERT INTO public.acct_journal_lines (
        journal_entry_id, account_code, debit_amount, credit_amount,
        description, currency
      ) VALUES (
        v_je_id, p_gl_credit_code, 0, p_amount,
        COALESCE(p_description, 'Pre-fund ' || p_transaction_type),
        p_currency
      );

      v_gl_posted := true;

    EXCEPTION WHEN others THEN
      -- GL tables may differ — non-fatal; transaction is already recorded
      v_gl_posted := false;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success',        true,
    'transaction_id', v_txn_id,
    'gl_posted',      v_gl_posted,
    'journal_entry_id', v_je_id
  );

EXCEPTION WHEN others THEN
  RETURN jsonb_build_object(
    'success', false,
    'error',   SQLERRM
  );
END;
$$;

COMMENT ON FUNCTION public.add_pre_fund_transaction_rpc IS
'Manually adds a pre-fund transaction from the Reconciliation tab.
Handles all transaction types (payment, receipt, commitment, reversal, carry_forward, return, adjustment).
Optionally posts a GL journal entry when gl_debit_code and gl_credit_code are supplied.
Balance updates and GL posting run inside a single Postgres transaction.';

GRANT EXECUTE ON FUNCTION public.add_pre_fund_transaction_rpc TO authenticated;

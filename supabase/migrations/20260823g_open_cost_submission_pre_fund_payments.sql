-- Cost Submission payments may use any active, matching-currency Pre-Fund
-- with enough available balance. Personal allocation enforcement remains in
-- place for Down Payment payments.

CREATE OR REPLACE FUNCTION public.link_payment_atomically_rpc(
  p_fund_id TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_source_table TEXT,
  p_source_id UUID,
  p_reference TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_created_by UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_receipt_url TEXT DEFAULT NULL,
  p_payment_event_key TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fund_id UUID := p_fund_id::uuid;
  v_fund RECORD;
  v_txn_id UUID;
  v_existing RECORD;
  v_event_key TEXT;
  v_alloc RECORD;
  v_has_allocation BOOLEAN := false;
  v_paid NUMERIC;
  v_available NUMERIC;
  v_liability_account_id UUID;
  v_receipt_account_id UUID;
  v_journal_entry_id UUID;
  v_source_status TEXT;
  v_source_paid_amount NUMERIC := 0;
  v_linked_source_amount NUMERIC := 0;
  v_source_deleted BOOLEAN := false;
BEGIN
  PERFORM public._assert_finance_role();

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.';
  END IF;
  IF p_source_table NOT IN ('down_payment_requests', 'operational_cost_submissions') THEN
    RAISE EXCEPTION 'Unsupported pre-fund payment source "%".', p_source_table;
  END IF;
  IF p_source_table = 'down_payment_requests' THEN
    PERFORM 1 FROM public.down_payment_requests WHERE id = p_source_id;
  ELSE
    PERFORM 1 FROM public.operational_cost_submissions WHERE id = p_source_id;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment source %/% does not exist; do not create an unlinked fund event.',
      p_source_table, p_source_id;
  END IF;

  v_event_key := NULLIF(BTRIM(p_payment_event_key), '');
  IF v_event_key IS NULL THEN
    v_event_key := 'server-generated:' || gen_random_uuid()::text;
  END IF;

  SELECT id, pre_fund_request_id INTO v_existing
  FROM public.pre_fund_transactions
  WHERE idempotency_key = v_event_key;
  IF FOUND THEN
    IF v_existing.pre_fund_request_id <> v_fund_id THEN
      RAISE EXCEPTION 'Payment event key is already linked to a different fund.';
    END IF;
    SELECT verified_paid_amount, verified_available_balance INTO v_paid, v_available
    FROM public.pre_fund_balance_snapshot_v WHERE fund_id = v_fund_id;
    RETURN jsonb_build_object('success', true, 'idempotent', true,
      'transaction_id', v_existing.id, 'new_balance', v_available, 'paid_amount', v_paid);
  END IF;

  IF p_source_table = 'down_payment_requests' THEN
    SELECT status, COALESCE(total_paid_amount, 0),
      COALESCE((metadata ->> 'deleted')::boolean, false)
    INTO v_source_status, v_source_paid_amount, v_source_deleted
    FROM public.down_payment_requests
    WHERE id = p_source_id
    FOR UPDATE;

    IF v_source_deleted
       OR v_source_status NOT IN ('partially_paid', 'fully_paid', 'paid', 'reconciled') THEN
      RAISE EXCEPTION 'Down-payment source is not eligible for ledger posting (status="%").', v_source_status;
    END IF;
  ELSE
    SELECT status, COALESCE(amount_paid_cents, 0)::NUMERIC / 100
    INTO v_source_status, v_source_paid_amount
    FROM public.operational_cost_submissions
    WHERE id = p_source_id
    FOR UPDATE;

    IF v_source_status NOT IN ('partially_paid', 'paid', 'reconciled') THEN
      RAISE EXCEPTION 'Operational cost source is not eligible for ledger posting (status="%").', v_source_status;
    END IF;
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN transaction_type = 'payment' THEN amount
      WHEN transaction_type IN ('reversal', 'return') THEN -amount
      ELSE 0
    END
  ), 0)
  INTO v_linked_source_amount
  FROM public.pre_fund_transactions
  WHERE source_table = p_source_table
    AND source_id = p_source_id;

  IF p_amount > v_source_paid_amount - v_linked_source_amount THEN
    RAISE EXCEPTION 'Source payment evidence is insufficient (% recorded, % already linked, % requested).',
      v_source_paid_amount, v_linked_source_amount, p_amount;
  END IF;

  SELECT * INTO v_fund
  FROM public.pre_fund_requests
  WHERE id = v_fund_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fund not found.');
  END IF;
  IF v_fund.currency <> p_currency THEN
    RAISE EXCEPTION 'Payment currency % does not match fund currency %.', p_currency, v_fund.currency;
  END IF;
  IF p_source_table = 'operational_cost_submissions'
     AND v_fund.status NOT IN ('active', 'low_balance') THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Pre-Fund is not available for Cost Submission payments (status: %s).', v_fund.status));
  END IF;
  IF v_fund.available_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Insufficient pre-fund balance (%s %s available; %s requested).',
        v_fund.available_balance, p_currency, p_amount));
  END IF;

  -- Down Payments remain allocation-bound. Cost Submissions are fund-balance
  -- bound only; their source submitter stays on the ledger as payment owner.
  IF p_source_table = 'down_payment_requests'
     AND p_user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.pre_fund_allocations WHERE pre_fund_request_id = v_fund_id) THEN
    SELECT * INTO v_alloc FROM public.pre_fund_allocations
    WHERE pre_fund_request_id = v_fund_id AND user_id = p_user_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'User has no allocation for this fund. Allocate budget before linking payment.';
    END IF;
    v_has_allocation := true;
    IF v_alloc.spent_amount + p_amount > v_alloc.allocated_amount THEN
      RAISE EXCEPTION 'Insufficient personal allocation (% remaining; % requested).',
        v_alloc.allocated_amount - v_alloc.spent_amount, p_amount;
    END IF;
  END IF;

  INSERT INTO public.pre_fund_transactions (
    pre_fund_request_id, transaction_type, amount, currency, reference,
    description, transaction_date, source_table, source_id, created_by, user_id,
    receipt_url, idempotency_key, event_actor_id, event_reason, event_metadata
  ) VALUES (
    v_fund_id, 'payment', p_amount, p_currency, p_reference,
    COALESCE(p_description, 'Linked payment from ' || p_source_table),
    p_payment_date, p_source_table, p_source_id, p_created_by,
    COALESCE(p_user_id, p_created_by), p_receipt_url, v_event_key,
    COALESCE(p_created_by, auth.uid()), 'payment_event',
    jsonb_build_object('payment_event_key', v_event_key)
  ) RETURNING id INTO v_txn_id;

  IF v_fund.gl_liability_account IS NOT NULL AND v_fund.gl_receipt_account IS NOT NULL THEN
    SELECT id INTO v_liability_account_id
    FROM public.acct_accounts WHERE code = v_fund.gl_liability_account LIMIT 1;
    SELECT id INTO v_receipt_account_id
    FROM public.acct_accounts WHERE code = v_fund.gl_receipt_account LIMIT 1;
    IF v_liability_account_id IS NOT NULL AND v_receipt_account_id IS NOT NULL THEN
      INSERT INTO public.acct_journal_entries (
        description_en, description_ar, posting_date, status,
        source_type, source_id, idempotency_key, created_by
      ) VALUES (
        'Pre-Fund Disbursement — ' || COALESCE(p_description, p_source_table),
        'صرف التمويل المسبق — ' || COALESCE(p_description, p_source_table),
        p_payment_date, 'draft', 'pre_fund_transactions', v_txn_id,
        'pf-paid-event:' || v_txn_id::text, p_created_by
      ) RETURNING id INTO v_journal_entry_id;
      INSERT INTO public.acct_journal_lines (
        entry_id, line_no, account_id, debit_credit, original_amount,
        original_currency, functional_amount, functional_currency, description, function
      ) VALUES
        (v_journal_entry_id, 1, v_liability_account_id, 'DR', p_amount, p_currency,
          p_amount, p_currency, 'Pre-fund disbursement — liability released', 'program'),
        (v_journal_entry_id, 2, v_receipt_account_id, 'CR', p_amount, p_currency,
          p_amount, p_currency, 'Pre-fund disbursement — cash/bank outflow', 'program');
      INSERT INTO public.acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
      VALUES ('pre_fund_transactions', v_txn_id, 'pre_fund_paid', 'success', v_journal_entry_id);
    END IF;
  END IF;

  IF v_has_allocation THEN
    UPDATE public.pre_fund_allocations
    SET spent_amount = spent_amount + p_amount, updated_at = now()
    WHERE id = v_alloc.id;
  END IF;

  IF p_source_table = 'down_payment_requests' THEN
    UPDATE public.down_payment_requests SET pre_fund_transaction_id = v_txn_id WHERE id = p_source_id;
  ELSE
    UPDATE public.operational_cost_submissions SET pre_fund_transaction_id = v_txn_id WHERE id = p_source_id;
  END IF;

  SELECT verified_paid_amount, verified_available_balance INTO v_paid, v_available
  FROM public.pre_fund_balance_snapshot_v WHERE fund_id = v_fund_id;
  UPDATE public.pre_fund_requests
  SET paid_amount = v_paid, available_balance = v_available, updated_at = now()
  WHERE id = v_fund_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_txn_id,
    'new_balance', v_available, 'paid_amount', v_paid);
END;
$$;

REVOKE ALL ON FUNCTION public.link_payment_atomically_rpc(TEXT,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,DATE,UUID,UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_payment_atomically_rpc(TEXT,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,DATE,UUID,UUID,TEXT,TEXT) TO authenticated;
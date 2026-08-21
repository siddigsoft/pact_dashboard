-- Keep idempotent wallet-payment retries usable by returning the original
-- immutable Pre-Fund event ID alongside the existing wallet transaction ID.
CREATE OR REPLACE FUNCTION public.record_down_payment_with_wallet_rpc(
  p_request_id UUID,
  p_fund_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_receipt_url TEXT,
  p_notes TEXT DEFAULT NULL,
  p_payment_event_key TEXT DEFAULT NULL,
  p_installment_index INTEGER DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.down_payment_requests%ROWTYPE;
  v_result JSONB;
  v_wallet_info JSONB;
  v_wallet_id UUID;
  v_wallet_tx_id UUID;
  v_transaction_id UUID;
  v_balance NUMERIC;
  v_event_key TEXT;
  v_installments JSONB;
BEGIN
  PERFORM public._assert_finance_role();
  IF p_receipt_url IS NULL OR BTRIM(p_receipt_url) = '' THEN
    RAISE EXCEPTION 'A payment receipt is required.';
  END IF;

  SELECT * INTO v_request
  FROM public.down_payment_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Down-payment request not found.';
  END IF;

  v_event_key := COALESCE(
    NULLIF(BTRIM(p_payment_event_key), ''),
    'source-payment:down_payment_requests:' || p_request_id::TEXT || ':' || gen_random_uuid()::TEXT
  );

  -- A retry returns both pieces of the original financial evidence and cannot
  -- create another wallet row.
  SELECT id INTO v_transaction_id
  FROM public.pre_fund_transactions
  WHERE idempotency_key = v_event_key;
  IF FOUND THEN
    SELECT id INTO v_wallet_tx_id
    FROM public.wallet_transactions
    WHERE metadata ->> 'pre_fund_payment_event_key' = v_event_key
    ORDER BY created_at DESC
    LIMIT 1;
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'transaction_id', v_transaction_id,
      'wallet_transaction_id', v_wallet_tx_id
    );
  END IF;

  v_result := public.record_required_pre_fund_payment_rpc(
    'down_payment_requests',
    p_request_id,
    p_fund_id,
    p_amount,
    p_currency,
    CURRENT_DATE,
    auth.uid(),
    p_receipt_url,
    p_notes,
    v_event_key
  );
  IF COALESCE((v_result ->> 'success')::BOOLEAN, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Pre-Fund payment could not be recorded: %', COALESCE(v_result ->> 'error', 'unknown error');
  END IF;

  SELECT * INTO v_request
  FROM public.down_payment_requests
  WHERE id = p_request_id
  FOR UPDATE;
  v_wallet_info := public.get_or_create_wallet_for_payment(v_request.requested_by);
  v_wallet_id := (v_wallet_info ->> 'wallet_id')::UUID;
  v_balance := COALESCE((v_wallet_info -> 'balances' ->> 'SDG')::NUMERIC, 0);

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, amount_cents, currency, description,
    balance_before, balance_after, created_by, metadata
  ) VALUES (
    v_wallet_id,
    v_request.requested_by,
    'down_payment',
    p_amount,
    ROUND(p_amount * 100),
    p_currency,
    'Transport advance (deducted from site fee): ' || COALESCE(v_request.site_name, 'Unknown site')
      || COALESCE(' | ' || NULLIF(BTRIM(p_notes), ''), ''),
    v_balance,
    v_balance,
    auth.uid(),
    jsonb_build_object(
      'type', 'transportation_advance',
      'down_payment_request_id', p_request_id,
      'pre_fund_payment_event_key', v_event_key,
      'pre_fund_transaction_id', v_result ->> 'transaction_id',
      'site_name', v_request.site_name,
      'requested_amount', v_request.requested_amount,
      'advance_from_total', true
    )
  ) RETURNING id INTO v_wallet_tx_id;

  v_installments := CASE
    WHEN jsonb_typeof(v_request.installment_plan) = 'array' THEN v_request.installment_plan
    ELSE '[]'::jsonb
  END;
  IF p_installment_index IS NOT NULL THEN
    IF v_request.payment_type <> 'installments' THEN
      RAISE EXCEPTION 'An instalment index can only be recorded for an instalment request.';
    END IF;
    IF p_installment_index < 0 OR p_installment_index >= jsonb_array_length(v_installments) THEN
      RAISE EXCEPTION 'The selected instalment no longer exists.';
    END IF;
    IF COALESCE((v_installments -> p_installment_index ->> 'paid')::BOOLEAN, false) THEN
      RAISE EXCEPTION 'The selected instalment is already marked paid.';
    END IF;
    v_installments := jsonb_set(
      v_installments,
      ARRAY[p_installment_index::TEXT],
      COALESCE(v_installments -> p_installment_index, '{}'::jsonb)
        || jsonb_build_object('paid', true, 'paid_at', now(), 'transaction_id', v_wallet_tx_id),
      false
    );
  END IF;

  UPDATE public.down_payment_requests
  SET wallet_transaction_ids = CASE
        WHEN jsonb_typeof(wallet_transaction_ids) = 'array'
          THEN wallet_transaction_ids || jsonb_build_array(v_wallet_tx_id)
        ELSE jsonb_build_array(v_wallet_tx_id)
      END,
      installment_plan = v_installments,
      updated_at = now()
  WHERE id = p_request_id;

  RETURN v_result || jsonb_build_object(
    'success', true,
    'wallet_transaction_id', v_wallet_tx_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_down_payment_with_wallet_rpc(UUID,UUID,NUMERIC,TEXT,TEXT,TEXT,TEXT,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_down_payment_with_wallet_rpc(UUID,UUID,NUMERIC,TEXT,TEXT,TEXT,TEXT,INTEGER) TO authenticated;
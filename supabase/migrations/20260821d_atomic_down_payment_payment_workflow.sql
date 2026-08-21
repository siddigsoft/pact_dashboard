-- ============================================================================
-- ATOMIC DOWN-PAYMENT PAYMENT AND CANCELLATION WORKFLOW
-- 2026-08-21
-- Safe to re-run. Wallet evidence, instalment metadata, source payment state,
-- and the immutable Pre-Fund event must commit or roll back together.
-- ============================================================================

-- FOM is an operational management role, not a payment-posting authority.
CREATE OR REPLACE FUNCTION public._assert_finance_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN;
  END IF;

  SELECT lower(trim(role)) INTO v_role
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN (
    'super_admin', 'superadmin',
    'admin', 'administrator',
    'finance', 'finance admin',
    'financialadmin', 'financial_admin',
    'accountant'
  ) THEN
    RAISE EXCEPTION 'Access denied: finance or admin role required (role="%").',
      COALESCE(v_role, '<null>');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._assert_finance_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._assert_finance_role() TO authenticated;

-- Wallet creation is only valid within the Finance payment workflow.
CREATE OR REPLACE FUNCTION public.get_or_create_wallet_for_payment(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id uuid;
  v_balances jsonb;
BEGIN
  PERFORM public._assert_finance_role();
  INSERT INTO public.profiles (id) VALUES (p_user_id) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.wallets (
    user_id, currency, balance_cents, total_earned_cents, total_paid_out_cents,
    pending_payout_cents, balances, total_earned
  )
  VALUES (p_user_id, 'SDG', 0, 0, 0, 0, '{"SDG": 0}'::jsonb, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id, COALESCE(balances, '{"SDG": 0}'::jsonb)
  INTO v_wallet_id, v_balances
  FROM public.wallets
  WHERE user_id = p_user_id
  LIMIT 1;

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Wallet could not be created for user %', p_user_id;
  END IF;
  RETURN jsonb_build_object('wallet_id', v_wallet_id, 'balances', v_balances);
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_wallet_for_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_wallet_for_payment(uuid) TO authenticated;

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
  v_balance NUMERIC;
  v_event_key TEXT;
  v_installments JSONB;
BEGIN
  PERFORM public._assert_finance_role();
  IF p_receipt_url IS NULL OR BTRIM(p_receipt_url) = '' THEN
    RAISE EXCEPTION 'A payment receipt is required.';
  END IF;

  SELECT *
  INTO v_request
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

  -- A retry after a committed response returns the existing financial event and
  -- cannot create a second wallet row.
  IF EXISTS (
    SELECT 1 FROM public.pre_fund_transactions
    WHERE idempotency_key = v_event_key
  ) THEN
    SELECT id INTO v_wallet_tx_id
    FROM public.wallet_transactions
    WHERE metadata ->> 'pre_fund_payment_event_key' = v_event_key
    ORDER BY created_at DESC
    LIMIT 1;
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
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

  SELECT *
  INTO v_request
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

CREATE OR REPLACE FUNCTION public.cancel_paid_down_payment_request_rpc(
  p_request_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.down_payment_requests%ROWTYPE;
  v_reversal JSONB;
  v_reason TEXT := COALESCE(NULLIF(BTRIM(p_reason), ''), 'Cancelled by Finance');
BEGIN
  PERFORM public._assert_finance_role();
  SELECT *
  INTO v_request
  FROM public.down_payment_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Down-payment request not found.';
  END IF;
  IF v_request.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true);
  END IF;

  IF COALESCE(v_request.metadata ->> 'pre_fund_deducted', 'false')::BOOLEAN
     AND v_request.pre_fund_transaction_id IS NULL
     AND COALESCE(v_request.total_paid_amount, 0) > 0 THEN
    RAISE EXCEPTION 'This request has a legacy Pre-Fund marker without an immutable event. Finance must resolve it in Pre-Funding → Reconciliation.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pre_fund_transactions t
    WHERE t.source_table = 'down_payment_requests'
      AND t.source_id = p_request_id
      AND t.transaction_type = 'payment'
      AND NOT EXISTS (
        SELECT 1 FROM public.pre_fund_transactions r WHERE r.reversal_of_id = t.id
      )
  ) THEN
    v_reversal := public._unlink_pre_fund_payment_internal_rpc('down_payment_requests', p_request_id);
    IF COALESCE((v_reversal ->> 'success')::BOOLEAN, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Could not reverse the linked Pre-Fund payment: %', COALESCE(v_reversal ->> 'error', 'unknown error');
    END IF;
  ELSIF COALESCE(v_request.total_paid_amount, 0) > 0 THEN
    RAISE EXCEPTION 'This paid request has no active immutable Pre-Fund event. Finance must review it in Pre-Funding → Reconciliation before cancellation.';
  END IF;

  UPDATE public.wallet_transactions
  SET status = 'reversed',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'reversed_at', now(),
        'reversed_by', auth.uid(),
        'reversal_reason', v_reason
      )
  WHERE metadata ->> 'down_payment_request_id' = p_request_id::TEXT
    AND status::TEXT IN ('pending', 'posted');

  UPDATE public.down_payment_requests
  SET status = 'cancelled',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'cancelled_at', now(),
        'cancelled_by', auth.uid(),
        'cancellation_reason', v_reason
      ),
      updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'reversed_event_count', COALESCE((v_reversal ->> 'reversed_event_count')::INTEGER, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_paid_down_payment_request_rpc(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_paid_down_payment_request_rpc(UUID,TEXT) TO authenticated;

-- Older browser builds called this low-level reversal endpoint and then changed
-- the source request in a separate request. Keep the function name as a safe
-- failure so an old build cannot create a paid-source / reversed-ledger gap.
CREATE OR REPLACE FUNCTION public.unlink_payment_atomically_rpc(
  p_source_table TEXT,
  p_source_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_finance_role();
  RAISE EXCEPTION 'Direct payment reversal is disabled. Cancel the Down Payment through cancel_paid_down_payment_request_rpc or use the controlled fund-correction workflow.';
END;
$$;

REVOKE ALL ON FUNCTION public.unlink_payment_atomically_rpc(TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlink_payment_atomically_rpc(TEXT,UUID) TO authenticated;
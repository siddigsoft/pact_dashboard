-- ============================================================================
-- FINANCE-ONLY PRE-FUND CORRECTIONS
-- 2026-08-21
-- The correction operation is more privileged than normal payment posting:
-- it moves an immutable payment between funds. Keep its server-side role guard
-- aligned with the Finance-only UI rather than relying on client visibility.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._assert_pre_fund_correction_role()
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
    'finance', 'finance admin', 'financeadmin',
    'financialadmin', 'financial_admin',
    'accountant'
  ) THEN
    RAISE EXCEPTION 'Access denied: Finance role required for Pre-Fund corrections (role="%").',
      COALESCE(v_role, '<null>');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._assert_pre_fund_correction_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._assert_pre_fund_correction_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.correct_required_pre_fund_payment_link_rpc(
  p_original_payment_event_id UUID,
  p_new_fund_id UUID,
  p_reason TEXT,
  p_payment_event_key TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original RECORD;
  v_actor_id UUID := auth.uid();
  v_event_key TEXT;
  v_reversal_id UUID;
  v_link_result JSONB;
  v_paid NUMERIC;
  v_available NUMERIC;
BEGIN
  PERFORM public._assert_pre_fund_correction_role();

  IF p_new_fund_id IS NULL THEN
    RAISE EXCEPTION 'Select the replacement Pre-Fund.';
  END IF;
  IF COALESCE(BTRIM(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A correction reason is required.';
  END IF;

  SELECT t.*
  INTO v_original
  FROM public.pre_fund_transactions t
  WHERE t.id = p_original_payment_event_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_original.transaction_type <> 'payment'
     OR v_original.source_table NOT IN ('down_payment_requests', 'operational_cost_submissions')
     OR v_original.idempotency_key NOT LIKE 'source-payment:%' THEN
    RAISE EXCEPTION 'Only payment events created through the required Pre-Fund payment flow can be corrected here.';
  END IF;
  IF v_original.pre_fund_request_id = p_new_fund_id THEN
    RAISE EXCEPTION 'Choose a different replacement Pre-Fund.';
  END IF;

  v_event_key := COALESCE(
    NULLIF(BTRIM(p_payment_event_key), ''),
    'source-correction:' || v_original.id::TEXT || ':' || p_new_fund_id::TEXT
  );
  IF EXISTS (SELECT 1 FROM public.pre_fund_transactions WHERE idempotency_key = v_event_key) THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true);
  END IF;
  IF EXISTS (SELECT 1 FROM public.pre_fund_transactions WHERE reversal_of_id = v_original.id) THEN
    RAISE EXCEPTION 'This payment event has already been corrected or reversed.';
  END IF;

  INSERT INTO public.pre_fund_transactions (
    pre_fund_request_id, transaction_type, amount, currency, reference,
    description, transaction_date, source_table, source_id, created_by, user_id,
    receipt_url, idempotency_key, reversal_of_id, event_actor_id, event_reason, event_metadata
  ) VALUES (
    v_original.pre_fund_request_id, 'reversal', v_original.amount, v_original.currency, v_original.reference,
    'Fund correction reversal: ' || p_reason, CURRENT_DATE,
    v_original.source_table, v_original.source_id, v_actor_id, v_original.user_id,
    v_original.receipt_url, 'correction-reversal:' || v_original.id::TEXT, v_original.id,
    v_actor_id, 'fund_correction_reversal',
    jsonb_build_object('original_payment_event_id', v_original.id, 'reason', p_reason)
  ) RETURNING id INTO v_reversal_id;

  IF v_original.user_id IS NOT NULL THEN
    UPDATE public.pre_fund_allocations
    SET spent_amount = GREATEST(0, spent_amount - v_original.amount),
        updated_at = now()
    WHERE pre_fund_request_id = v_original.pre_fund_request_id
      AND user_id = v_original.user_id;
  END IF;

  SELECT verified_paid_amount, verified_available_balance
  INTO v_paid, v_available
  FROM public.pre_fund_balance_snapshot_v
  WHERE fund_id = v_original.pre_fund_request_id;
  UPDATE public.pre_fund_requests
  SET paid_amount = v_paid, available_balance = v_available, updated_at = now()
  WHERE id = v_original.pre_fund_request_id;

  v_link_result := public.link_payment_atomically_rpc(
    p_new_fund_id::TEXT,
    v_original.amount,
    v_original.currency,
    v_original.source_table,
    v_original.source_id,
    v_original.reference,
    'Fund correction: ' || p_reason,
    CURRENT_DATE,
    v_actor_id,
    v_original.user_id,
    v_original.receipt_url,
    v_event_key
  );
  IF COALESCE((v_link_result ->> 'success')::BOOLEAN, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Replacement Pre-Fund link failed: %', COALESCE(v_link_result ->> 'error', 'unknown error');
  END IF;

  RETURN v_link_result || jsonb_build_object(
    'success', true,
    'reversal_event_id', v_reversal_id,
    'corrected_payment_event_id', p_original_payment_event_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.correct_required_pre_fund_payment_link_rpc(UUID,UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.correct_required_pre_fund_payment_link_rpc(UUID,UUID,TEXT,TEXT) TO authenticated;
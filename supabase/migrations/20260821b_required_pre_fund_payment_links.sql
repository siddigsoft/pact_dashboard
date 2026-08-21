-- ============================================================================
-- REQUIRED PRE-FUND PAYMENT LINKS
-- 2026-08-21
-- Safe to re-run. This migration does not backfill, reassign, or alter any
-- historical payment, allocation, or balance. It only governs future payments.
-- ============================================================================

-- These payment evidence fields exist in current environments, but make the
-- controlled RPC safe for databases that missed an earlier payment migration.
ALTER TABLE public.down_payment_requests
  ADD COLUMN IF NOT EXISTS fully_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_proof_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_proof_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_proof_notes TEXT;

-- One row per active immutable payment event. A source can appear more than once
-- when separate instalments were paid from different funds.
CREATE OR REPLACE VIEW public.pre_fund_source_payment_links_v
WITH (security_invoker = true)
AS
SELECT
  t.id AS payment_event_id,
  t.source_table,
  t.source_id,
  t.pre_fund_request_id AS fund_id,
  f.name AS fund_name,
  f.currency,
  t.amount AS payment_amount,
  t.transaction_date AS payment_date,
  t.reference,
  t.description,
  t.receipt_url,
  t.user_id,
  t.created_by,
  t.occurred_at
FROM public.pre_fund_transactions t
JOIN public.pre_fund_requests f ON f.id = t.pre_fund_request_id
WHERE t.source_table IN ('down_payment_requests', 'operational_cost_submissions')
  AND t.source_id IS NOT NULL
  AND t.transaction_type = 'payment'
  AND NOT EXISTS (
    SELECT 1
    FROM public.pre_fund_transactions reversal
    WHERE reversal.reversal_of_id = t.id
  );

GRANT SELECT ON public.pre_fund_source_payment_links_v TO authenticated;

-- Reject browser/direct source payment updates unless they are being performed
-- inside the controlled atomic RPC below. This intentionally leaves historical
-- rows untouched; it applies only when a later update increases paid value.
CREATE OR REPLACE FUNCTION public.guard_required_pre_fund_link_for_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_table TEXT := TG_TABLE_NAME;
  v_new_paid NUMERIC := 0;
  v_old_paid NUMERIC := 0;
  v_linked_paid NUMERIC := 0;
  v_new_is_paid BOOLEAN := false;
BEGIN
  IF current_setting('app.pre_fund_payment_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF v_source_table = 'down_payment_requests' THEN
    v_new_paid := COALESCE(NEW.total_paid_amount, 0);
    v_old_paid := COALESCE(OLD.total_paid_amount, 0);
    v_new_is_paid := NEW.status IN ('partially_paid', 'fully_paid', 'paid', 'reconciled');
  ELSIF v_source_table = 'operational_cost_submissions' THEN
    v_new_paid := COALESCE(NEW.amount_paid_cents, 0)::NUMERIC / 100;
    v_old_paid := COALESCE(OLD.amount_paid_cents, 0)::NUMERIC / 100;
    v_new_is_paid := NEW.status IN ('partially_paid', 'paid', 'reconciled');
  ELSE
    RETURN NEW;
  END IF;

  IF v_new_is_paid
     AND (
       v_new_paid > v_old_paid
       OR OLD.status NOT IN ('partially_paid', 'fully_paid', 'paid', 'reconciled')
     )
  THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN t.transaction_type = 'payment' THEN t.amount
        WHEN t.transaction_type IN ('reversal', 'return') THEN -t.amount
        ELSE 0
      END
    ), 0)
    INTO v_linked_paid
    FROM public.pre_fund_transactions t
    WHERE t.source_table = v_source_table
      AND t.source_id = NEW.id;

    IF v_linked_paid < v_new_paid THEN
      RAISE EXCEPTION
        'A Pre-Fund must be selected before recording this payment. Use the controlled payment action so the source and ledger update together.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_pre_fund_link_down_payment ON public.down_payment_requests;
CREATE TRIGGER trg_require_pre_fund_link_down_payment
  BEFORE UPDATE OF status, total_paid_amount
  ON public.down_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_required_pre_fund_link_for_payment();

DROP TRIGGER IF EXISTS trg_require_pre_fund_link_operational_cost ON public.operational_cost_submissions;
CREATE TRIGGER trg_require_pre_fund_link_operational_cost
  BEFORE UPDATE OF status, amount_paid_cents
  ON public.operational_cost_submissions
  FOR EACH ROW EXECUTE FUNCTION public.guard_required_pre_fund_link_for_payment();

-- Records exactly one new source payment and its selected fund event in the
-- same transaction. A failure in either operation rolls the whole payment back.
CREATE OR REPLACE FUNCTION public.record_required_pre_fund_payment_rpc(
  p_source_table TEXT,
  p_source_id UUID,
  p_fund_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_created_by UUID DEFAULT NULL,
  p_receipt_url TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_payment_event_key TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source RECORD;
  v_actor_id UUID := COALESCE(auth.uid(), p_created_by);
  v_new_paid NUMERIC;
  v_due_amount NUMERIC;
  v_status TEXT;
  v_currency TEXT;
  v_link_result JSONB;
  v_event_key TEXT;
  v_source_user_id UUID;
  v_reference TEXT;
  v_description TEXT;
  v_existing_transaction_id UUID;
BEGIN
  PERFORM public._assert_finance_role();

  IF p_source_table NOT IN ('down_payment_requests', 'operational_cost_submissions') THEN
    RAISE EXCEPTION 'Unsupported payment source "%".', p_source_table;
  END IF;
  IF p_fund_id IS NULL THEN
    RAISE EXCEPTION 'Select a Pre-Fund before recording a payment.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.';
  END IF;

  v_event_key := NULLIF(BTRIM(p_payment_event_key), '');
  IF v_event_key IS NULL THEN
    v_event_key := 'source-payment:' || p_source_table || ':' || p_source_id::TEXT || ':' || gen_random_uuid()::TEXT;
  END IF;

  -- A transport retry for the same immutable event returns the already-created
  -- result rather than creating a second source payment.
  SELECT t.id
  INTO v_existing_transaction_id
  FROM public.pre_fund_transactions t
  WHERE t.idempotency_key = v_event_key
    AND t.pre_fund_request_id = p_fund_id
    AND t.source_table = p_source_table
    AND t.source_id = p_source_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'transaction_id', v_existing_transaction_id
    );
  END IF;
  IF EXISTS (SELECT 1 FROM public.pre_fund_transactions t WHERE t.idempotency_key = v_event_key) THEN
    RAISE EXCEPTION 'This payment operation key was already used for a different source or Pre-Fund.';
  END IF;

  IF p_source_table = 'down_payment_requests' THEN
    SELECT *
    INTO v_source
    FROM public.down_payment_requests
    WHERE id = p_source_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Down-payment request not found.';
    END IF;
    IF v_source.status NOT IN ('approved', 'partially_paid') THEN
      RAISE EXCEPTION 'Down-payment request is not ready for payment (status="%").', v_source.status;
    END IF;

    v_currency := 'SDG';
    v_due_amount := COALESCE(
      NULLIF(v_source.approved_amount::NUMERIC, 0),
      NULLIF((v_source.metadata ->> 'approved_amount')::NUMERIC, 0),
      v_source.requested_amount,
      0
    );
    v_new_paid := COALESCE(v_source.total_paid_amount, 0) + p_amount;
    IF v_new_paid > v_due_amount THEN
      RAISE EXCEPTION 'Payment exceeds the remaining approved advance (% due, % already paid, % requested).',
        v_due_amount, COALESCE(v_source.total_paid_amount, 0), p_amount;
    END IF;

    v_status := CASE WHEN v_new_paid >= v_due_amount THEN 'fully_paid' ELSE 'partially_paid' END;
    v_source_user_id := v_source.requested_by;
    v_reference := NULL;
    v_description := COALESCE(v_source.justification, 'Down-payment ' || p_source_id::TEXT);
    IF v_currency IS DISTINCT FROM p_currency THEN
      RAISE EXCEPTION 'Payment currency % does not match source currency %.', p_currency, v_currency;
    END IF;

    PERFORM set_config('app.pre_fund_payment_rpc', 'on', true);
    UPDATE public.down_payment_requests
    SET status = v_status,
        total_paid_amount = v_new_paid,
        remaining_amount = GREATEST(v_due_amount - v_new_paid, 0),
        fully_paid_at = CASE WHEN v_status = 'fully_paid' THEN COALESCE(fully_paid_at, now()) ELSE fully_paid_at END,
        payment_proof_url = COALESCE(p_receipt_url, payment_proof_url),
        payment_proof_notes = COALESCE(p_notes, payment_proof_notes),
        payment_proof_uploaded_at = CASE WHEN p_receipt_url IS NOT NULL THEN now() ELSE payment_proof_uploaded_at END,
        updated_at = now()
    WHERE id = p_source_id;
  ELSE
    SELECT *
    INTO v_source
    FROM public.operational_cost_submissions
    WHERE id = p_source_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Operational cost submission not found.';
    END IF;
    IF v_source.status NOT IN ('approved', 'partially_paid') THEN
      RAISE EXCEPTION 'Operational cost submission is not ready for payment (status="%").', v_source.status;
    END IF;

    v_currency := v_source.currency;
    v_due_amount := COALESCE(v_source.amount_cents, 0)::NUMERIC / 100;
    v_new_paid := COALESCE(v_source.amount_paid_cents, 0)::NUMERIC / 100 + p_amount;
    IF v_new_paid > v_due_amount THEN
      RAISE EXCEPTION 'Payment exceeds the remaining approved cost (% due, % already paid, % requested).',
        v_due_amount, COALESCE(v_source.amount_paid_cents, 0)::NUMERIC / 100, p_amount;
    END IF;

    v_status := CASE WHEN v_new_paid >= v_due_amount THEN 'paid' ELSE 'partially_paid' END;
    v_source_user_id := v_source.submitted_by;
    v_reference := v_source.reference_number;
    v_description := v_source.description;
    IF v_currency IS DISTINCT FROM p_currency THEN
      RAISE EXCEPTION 'Payment currency % does not match source currency %.', p_currency, v_currency;
    END IF;

    PERFORM set_config('app.pre_fund_payment_rpc', 'on', true);
    UPDATE public.operational_cost_submissions
    SET status = v_status,
        amount_paid_cents = ROUND(v_new_paid * 100),
        paid_at = COALESCE(paid_at, now()),
        paid_by = COALESCE(paid_by, v_actor_id),
        payment_proof_url = COALESCE(p_receipt_url, payment_proof_url),
        payment_proof_notes = COALESCE(p_notes, payment_proof_notes),
        payment_proof_uploaded_at = CASE WHEN p_receipt_url IS NOT NULL THEN now() ELSE payment_proof_uploaded_at END,
        updated_at = now()
    WHERE id = p_source_id;
  END IF;

  v_link_result := public.link_payment_atomically_rpc(
    p_fund_id::TEXT,
    p_amount,
    p_currency,
    p_source_table,
    p_source_id,
    v_reference,
    v_description,
    p_payment_date,
    v_actor_id,
    v_source_user_id,
    p_receipt_url,
    v_event_key
  );

  IF COALESCE((v_link_result ->> 'success')::BOOLEAN, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Pre-Fund link failed: %', COALESCE(v_link_result ->> 'error', 'unknown error');
  END IF;

  RETURN v_link_result || jsonb_build_object(
    'success', true,
    'source_status', v_status,
    'source_paid_amount', v_new_paid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_required_pre_fund_payment_rpc(TEXT,UUID,UUID,NUMERIC,TEXT,DATE,UUID,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_required_pre_fund_payment_rpc(TEXT,UUID,UUID,NUMERIC,TEXT,DATE,UUID,TEXT,TEXT,TEXT) TO authenticated;

-- Corrects a newly recorded fund selection by adding an immutable reversal and
-- a new payment event. It never edits/deletes history and cannot target legacy
-- payment events.
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
  PERFORM public._assert_finance_role();

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
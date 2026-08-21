-- ============================================================================
-- ATOMIC PAID DOWN-PAYMENT REOPEN
-- 2026-08-21
-- Safe to re-run. A paid request cannot be returned to an approval state until
-- its active ledger events, wallet evidence, and instalment markers are reversed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_paid_down_payment_reopen()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.down_payment_paid_reopen_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF (
    OLD.status IN ('partially_paid', 'fully_paid', 'paid', 'reconciled')
    OR COALESCE(OLD.total_paid_amount, 0) > 0
  )
  AND (
    NEW.status NOT IN ('partially_paid', 'fully_paid', 'paid', 'reconciled')
    OR COALESCE(NEW.total_paid_amount, 0) < COALESCE(OLD.total_paid_amount, 0)
  )
  AND (
    EXISTS (
      SELECT 1
      FROM public.pre_fund_transactions t
      WHERE t.source_table = 'down_payment_requests'
        AND t.source_id = OLD.id
        AND t.transaction_type = 'payment'
        AND NOT EXISTS (
          SELECT 1 FROM public.pre_fund_transactions r WHERE r.reversal_of_id = t.id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.wallet_transactions wt
      WHERE wt.metadata ->> 'down_payment_request_id' = OLD.id::TEXT
        AND wt.status::TEXT IN ('pending', 'posted')
    )
  ) THEN
    RAISE EXCEPTION
      'A paid Down Payment must be reopened through the controlled financial reversal workflow.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_paid_down_payment_reopen ON public.down_payment_requests;
CREATE TRIGGER trg_guard_paid_down_payment_reopen
  BEFORE UPDATE OF status, total_paid_amount
  ON public.down_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_paid_down_payment_reopen();

CREATE OR REPLACE FUNCTION public.reopen_down_payment_after_reversal_rpc(
  p_request_id UUID,
  p_target_status TEXT,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.down_payment_requests%ROWTYPE;
  v_reversal JSONB;
  v_due_amount NUMERIC;
  v_installments JSONB;
  v_reason TEXT := COALESCE(NULLIF(BTRIM(p_reason), ''), 'Reopened by Finance');
BEGIN
  PERFORM public._assert_finance_role();
  IF p_target_status NOT IN ('pending_supervisor', 'pending_admin', 'approved') THEN
    RAISE EXCEPTION 'Unsupported Down Payment reopen status "%".', p_target_status;
  END IF;

  SELECT *
  INTO v_request
  FROM public.down_payment_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Down-payment request not found.';
  END IF;
  IF v_request.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled Down Payments cannot be reopened. Create a new request instead.';
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
      RAISE EXCEPTION 'Could not reverse linked Pre-Fund payment: %', COALESCE(v_reversal ->> 'error', 'unknown error');
    END IF;
  ELSIF COALESCE(v_request.total_paid_amount, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM public.wallet_transactions wt
          WHERE wt.metadata ->> 'down_payment_request_id' = p_request_id::TEXT
        ) THEN
    RAISE EXCEPTION 'This paid request has no immutable payment evidence. Finance must resolve it in Pre-Funding → Reconciliation.';
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

  v_due_amount := COALESCE(
    NULLIF(v_request.approved_amount::NUMERIC, 0),
    NULLIF((v_request.metadata ->> 'approved_amount')::NUMERIC, 0),
    v_request.requested_amount,
    0
  );
  SELECT COALESCE(
    jsonb_agg(
      CASE WHEN jsonb_typeof(item) = 'object' THEN
        (item - 'paid_at' - 'transaction_id') || jsonb_build_object('paid', false)
      ELSE item END
    ),
    '[]'::jsonb
  )
  INTO v_installments
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(v_request.installment_plan) = 'array'
      THEN v_request.installment_plan ELSE '[]'::jsonb END
  ) AS item;

  PERFORM set_config('app.down_payment_paid_reopen_rpc', 'on', true);
  UPDATE public.down_payment_requests
  SET status = p_target_status,
      supervisor_status = CASE WHEN p_target_status = 'pending_supervisor' THEN 'pending' ELSE supervisor_status END,
      supervisor_approved_by = CASE WHEN p_target_status = 'pending_supervisor' THEN NULL ELSE supervisor_approved_by END,
      supervisor_approved_at = CASE WHEN p_target_status = 'pending_supervisor' THEN NULL ELSE supervisor_approved_at END,
      supervisor_notes = CASE WHEN p_target_status = 'pending_supervisor' THEN NULL ELSE supervisor_notes END,
      supervisor_rejection_reason = CASE WHEN p_target_status = 'pending_supervisor' THEN NULL ELSE supervisor_rejection_reason END,
      admin_status = CASE WHEN p_target_status IN ('pending_supervisor', 'pending_admin') THEN 'pending' ELSE admin_status END,
      admin_processed_by = CASE WHEN p_target_status IN ('pending_supervisor', 'pending_admin') THEN NULL ELSE admin_processed_by END,
      admin_processed_at = CASE WHEN p_target_status IN ('pending_supervisor', 'pending_admin') THEN NULL ELSE admin_processed_at END,
      admin_notes = CASE WHEN p_target_status IN ('pending_supervisor', 'pending_admin') THEN NULL ELSE admin_notes END,
      admin_rejection_reason = CASE WHEN p_target_status IN ('pending_supervisor', 'pending_admin') THEN NULL ELSE admin_rejection_reason END,
      total_paid_amount = 0,
      remaining_amount = v_due_amount,
      fully_paid_at = NULL,
      payment_proof_url = NULL,
      payment_proof_notes = NULL,
      payment_proof_uploaded_at = NULL,
      paid_installments = '[]'::jsonb,
      installment_plan = v_installments,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'payment_reopened_at', now(),
        'payment_reopened_by', auth.uid(),
        'payment_reopen_reason', v_reason,
        'advance_reconciled_at', NULL,
        'payment_processed_at', NULL,
        'receipt_confirmation', NULL
      ),
      updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'target_status', p_target_status,
    'reversed_event_count', COALESCE((v_reversal ->> 'reversed_event_count')::INTEGER, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_down_payment_after_reversal_rpc(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_down_payment_after_reversal_rpc(UUID,TEXT,TEXT) TO authenticated;
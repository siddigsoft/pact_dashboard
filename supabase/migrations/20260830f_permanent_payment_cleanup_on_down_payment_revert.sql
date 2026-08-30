-- Permanently remove active Down Payment payment evidence when the request is
-- deliberately reopened to an approval state.
--
-- Each active payment is deleted newest-first through the existing authorized
-- hard-delete routine so wallet balances, accounting rows, source totals, and
-- Pre-Fund balances are updated atomically. Historical reversal pairs that were
-- already inactive before this operation remain immutable history.

CREATE OR REPLACE FUNCTION public.guard_payment_delete_audit_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND current_setting('app.authorized_payment_hard_delete', true) = 'on'
     AND current_user NOT IN ('authenticated', 'anon')
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE'
     AND current_setting('app.payment_delete_audit_cleanup', true) = 'on'
     AND current_user NOT IN ('authenticated', 'anon')
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Payment deletion audit records are immutable.';
END;
$$;

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
  v_payment_id UUID;
  v_delete_result JSONB;
  v_deleted_count INTEGER := 0;
  v_deleted_amount NUMERIC := 0;
  v_deleted_payment_ids UUID[] := ARRAY[]::UUID[];
  v_due_amount NUMERIC;
  v_installments JSONB;
  v_reason TEXT := COALESCE(
    NULLIF(BTRIM(p_reason), ''),
    'Request permanently reopened by Finance'
  );
BEGIN
  PERFORM public._assert_finance_role();

  IF p_target_status NOT IN ('pending_supervisor', 'pending_admin', 'approved') THEN
    RAISE EXCEPTION 'Unsupported Down Payment reopen status "%".', p_target_status;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('down_payment_requests:' || p_request_id::TEXT, 0)
  );

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

  LOOP
    SELECT t.id
    INTO v_payment_id
    FROM public.pre_fund_transactions t
    WHERE t.source_table = 'down_payment_requests'
      AND t.source_id = p_request_id
      AND t.transaction_type = 'payment'
      AND NOT EXISTS (
        SELECT 1
        FROM public.pre_fund_transactions reversal
        WHERE reversal.reversal_of_id = t.id
      )
    ORDER BY
      t.occurred_at DESC NULLS LAST,
      t.created_at DESC NULLS LAST,
      t.id DESC
    LIMIT 1;

    EXIT WHEN v_payment_id IS NULL;

    -- Down Payment wallet rows created by record_down_payment_with_wallet_rpc
    -- are evidence-only: balance_before = balance_after and recording them does
    -- not change the wallet aggregate. Mark only those rows non-posted before
    -- hard deletion so the generic deletion routine does not subtract an
    -- amount that was never added to the wallet.
    UPDATE public.wallet_transactions wt
    SET status = 'pending'
    WHERE (
        wt.metadata ->> 'pre_fund_transaction_id' = v_payment_id::TEXT
        OR wt.metadata ->> 'pre_fund_payment_event_key' = (
          SELECT t.idempotency_key
          FROM public.pre_fund_transactions t
          WHERE t.id = v_payment_id
        )
      )
      AND wt.type = 'down_payment'
      AND wt.status::TEXT = 'posted'
      AND COALESCE(wt.balance_before, 0) = COALESCE(wt.balance_after, 0);

    v_deleted_payment_ids := array_append(v_deleted_payment_ids, v_payment_id);

    v_delete_result := public.delete_latest_source_payment_rpc(
      v_payment_id,
      v_reason
    );

    IF COALESCE((v_delete_result ->> 'success')::BOOLEAN, false) IS NOT TRUE THEN
      RAISE EXCEPTION
        'Could not permanently remove linked payment %: %',
        v_payment_id,
        COALESCE(v_delete_result ->> 'error', 'unknown error');
    END IF;

    v_deleted_count := v_deleted_count + 1;
    v_deleted_amount := v_deleted_amount
      + COALESCE((v_delete_result ->> 'deleted_amount')::NUMERIC, 0);
    v_payment_id := NULL;
  END LOOP;

  IF COALESCE(v_request.total_paid_amount, 0) > 0
     AND v_deleted_count = 0
  THEN
    RAISE EXCEPTION
      'This paid request has no active immutable payment event. Finance must resolve it in Pre-Funding → Reconciliation.';
  END IF;

  -- The authorized hard-delete routine removes wallet rows linked to each
  -- payment event. Refuse to silently reopen if active orphan wallet evidence
  -- remains, because its wallet balance cannot be safely reconstructed here.
  IF EXISTS (
    SELECT 1
    FROM public.wallet_transactions wt
    WHERE wt.metadata ->> 'down_payment_request_id' = p_request_id::TEXT
      AND wt.status::TEXT IN ('pending', 'posted')
  ) THEN
    RAISE EXCEPTION
      'Active wallet evidence remains after payment deletion. Finance must resolve it before reopening this request.';
  END IF;

  v_due_amount := COALESCE(
    NULLIF(v_request.approved_amount::NUMERIC, 0),
    NULLIF((v_request.metadata ->> 'approved_amount')::NUMERIC, 0),
    v_request.requested_amount,
    0
  );

  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN jsonb_typeof(item) = 'object' THEN
          (item - 'paid_at' - 'transaction_id')
            || jsonb_build_object('paid', false)
        ELSE item
      END
    ),
    '[]'::jsonb
  )
  INTO v_installments
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(v_request.installment_plan) = 'array'
        THEN v_request.installment_plan
      ELSE '[]'::jsonb
    END
  ) AS item;

  -- The user explicitly selected permanent deletion for this reopen path.
  -- Remove the temporary hard-delete snapshots after every financial surface
  -- has been cleaned successfully.
  PERFORM set_config('app.payment_delete_audit_cleanup', 'on', true);
  DELETE FROM public.payment_event_delete_audit
  WHERE payment_event_id = ANY(v_deleted_payment_ids);

  PERFORM set_config('app.down_payment_paid_reopen_rpc', 'on', true);
  UPDATE public.down_payment_requests
  SET status = p_target_status,
      supervisor_status = CASE
        WHEN p_target_status = 'pending_supervisor' THEN 'pending'
        ELSE supervisor_status
      END,
      supervisor_approved_by = CASE
        WHEN p_target_status = 'pending_supervisor' THEN NULL
        ELSE supervisor_approved_by
      END,
      supervisor_approved_at = CASE
        WHEN p_target_status = 'pending_supervisor' THEN NULL
        ELSE supervisor_approved_at
      END,
      supervisor_notes = CASE
        WHEN p_target_status = 'pending_supervisor' THEN NULL
        ELSE supervisor_notes
      END,
      supervisor_rejection_reason = CASE
        WHEN p_target_status = 'pending_supervisor' THEN NULL
        ELSE supervisor_rejection_reason
      END,
      admin_status = CASE
        WHEN p_target_status IN ('pending_supervisor', 'pending_admin') THEN 'pending'
        ELSE admin_status
      END,
      admin_processed_by = CASE
        WHEN p_target_status IN ('pending_supervisor', 'pending_admin') THEN NULL
        ELSE admin_processed_by
      END,
      admin_processed_at = CASE
        WHEN p_target_status IN ('pending_supervisor', 'pending_admin') THEN NULL
        ELSE admin_processed_at
      END,
      admin_notes = CASE
        WHEN p_target_status IN ('pending_supervisor', 'pending_admin') THEN NULL
        ELSE admin_notes
      END,
      admin_rejection_reason = CASE
        WHEN p_target_status IN ('pending_supervisor', 'pending_admin') THEN NULL
        ELSE admin_rejection_reason
      END,
      total_paid_amount = 0,
      remaining_amount = v_due_amount,
      fully_paid_at = NULL,
      pre_fund_transaction_id = NULL,
      wallet_transaction_ids = '[]'::jsonb,
      payment_proof_url = NULL,
      payment_proof_notes = NULL,
      payment_proof_uploaded_at = NULL,
      paid_installments = '[]'::jsonb,
      installment_plan = v_installments,
      metadata = COALESCE(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'payment_reopened_at', now(),
          'payment_reopened_by', auth.uid(),
          'payment_reopen_reason', v_reason,
          'payment_records_permanently_deleted', true,
          'advance_reconciled_at', NULL,
          'payment_processed_at', NULL,
          'receipt_confirmation', NULL
        ),
      updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'target_status', p_target_status,
    'deleted_payment_event_count', v_deleted_count,
    'deleted_payment_amount', v_deleted_amount,
    'deletion_mode', 'permanent'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_down_payment_after_reversal_rpc(UUID, TEXT, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_down_payment_after_reversal_rpc(UUID, TEXT, TEXT)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
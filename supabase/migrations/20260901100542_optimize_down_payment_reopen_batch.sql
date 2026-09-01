CREATE INDEX IF NOT EXISTS idx_wallet_tx_prefund_event_id
  ON public.wallet_transactions ((metadata ->> 'pre_fund_transaction_id'))
  WHERE metadata ? 'pre_fund_transaction_id';

CREATE INDEX IF NOT EXISTS idx_wallet_tx_prefund_event_key
  ON public.wallet_transactions ((metadata ->> 'pre_fund_payment_event_key'))
  WHERE metadata ? 'pre_fund_payment_event_key';

CREATE OR REPLACE FUNCTION public.reopen_down_payment_after_reversal_rpc(
  p_request_id UUID,
  p_target_status TEXT,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_request public.down_payment_requests%ROWTYPE;
  v_payment_ids UUID[] := ARRAY[]::UUID[];
  v_fund_ids UUID[] := ARRAY[]::UUID[];
  v_event_keys TEXT[] := ARRAY[]::TEXT[];
  v_journal_ids UUID[] := ARRAY[]::UUID[];
  v_deleted_count INTEGER := 0;
  v_deleted_amount NUMERIC := 0;
  v_due_amount NUMERIC;
  v_installments JSONB;
  v_reason TEXT := COALESCE(NULLIF(BTRIM(p_reason), ''), 'Request permanently reopened by Finance');
BEGIN
  PERFORM public._assert_finance_role();

  IF p_target_status NOT IN ('pending_supervisor', 'pending_admin', 'approved') THEN
    RAISE EXCEPTION 'Unsupported Down Payment reopen status "%".', p_target_status;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('down_payment_requests:' || p_request_id::TEXT, 0));

  SELECT * INTO v_request
  FROM public.down_payment_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Down-payment request not found.'; END IF;
  IF v_request.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled Down Payments cannot be reopened. Create a new request instead.';
  END IF;

  -- Lock the complete active payment set once. The previous implementation
  -- re-entered the generic forensic-delete RPC for every payment.
  PERFORM 1
  FROM public.pre_fund_transactions t
  WHERE t.source_table = 'down_payment_requests'
    AND t.source_id = p_request_id
    AND t.transaction_type = 'payment'
    AND NOT EXISTS (
      SELECT 1 FROM public.pre_fund_transactions reversal
      WHERE reversal.reversal_of_id = t.id
    )
  FOR UPDATE;

  SELECT
    COALESCE(array_agg(t.id), ARRAY[]::UUID[]),
    COALESCE(array_agg(DISTINCT t.pre_fund_request_id), ARRAY[]::UUID[]),
    COALESCE(array_agg(t.idempotency_key) FILTER (WHERE t.idempotency_key IS NOT NULL), ARRAY[]::TEXT[]),
    COUNT(*)::INTEGER,
    COALESCE(SUM(t.amount), 0)
  INTO v_payment_ids, v_fund_ids, v_event_keys, v_deleted_count, v_deleted_amount
  FROM public.pre_fund_transactions t
  WHERE t.source_table = 'down_payment_requests'
    AND t.source_id = p_request_id
    AND t.transaction_type = 'payment'
    AND NOT EXISTS (
      SELECT 1 FROM public.pre_fund_transactions reversal
      WHERE reversal.reversal_of_id = t.id
    );

  IF COALESCE(v_request.total_paid_amount, 0) > 0 AND v_deleted_count = 0 THEN
    RAISE EXCEPTION 'This paid request has no active immutable payment event. Finance must resolve it in Pre-Funding → Reconciliation.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pre_fund_finance_exception_decisions decision
    WHERE decision.transaction_id = ANY(v_payment_ids)
       OR decision.correction_transaction_id = ANY(v_payment_ids)
  ) THEN
    RAISE EXCEPTION 'A payment is referenced by a Finance exception decision and cannot be physically deleted.';
  END IF;

  -- Down-payment wallet rows are evidence-only. Refuse unexpected balance-
  -- changing rows rather than applying a lossy bulk correction.
  IF EXISTS (
    SELECT 1
    FROM public.wallet_transactions wt
    WHERE (
      wt.metadata ->> 'pre_fund_transaction_id' = ANY(v_payment_ids::TEXT[])
      OR wt.metadata ->> 'pre_fund_payment_event_key' = ANY(v_event_keys)
    )
      AND wt.status::TEXT = 'posted'
      AND (
        wt.type <> 'down_payment'
        OR COALESCE(wt.balance_before, 0) <> COALESCE(wt.balance_after, 0)
      )
  ) THEN
    RAISE EXCEPTION 'A linked wallet row changes wallet balance. Finance must reconcile it before reopening this request.';
  END IF;

  UPDATE public.wallet_transactions wt
  SET status = 'pending'
  WHERE (
    wt.metadata ->> 'pre_fund_transaction_id' = ANY(v_payment_ids::TEXT[])
    OR wt.metadata ->> 'pre_fund_payment_event_key' = ANY(v_event_keys)
  )
    AND wt.type = 'down_payment'
    AND wt.status::TEXT = 'posted'
    AND COALESCE(wt.balance_before, 0) = COALESCE(wt.balance_after, 0);

  SELECT COALESCE(array_agg(j.id), ARRAY[]::UUID[])
  INTO v_journal_ids
  FROM public.acct_journal_entries j
  WHERE j.source_type = 'pre_fund_transactions'
    AND j.source_id = ANY(v_payment_ids);

  DELETE FROM public.acct_gl_bridge_log bridge
  WHERE (bridge.source_table = 'pre_fund_transactions' AND bridge.source_id = ANY(v_payment_ids))
     OR bridge.journal_entry_id = ANY(v_journal_ids);
  DELETE FROM public.acct_journal_lines line WHERE line.entry_id = ANY(v_journal_ids);
  DELETE FROM public.acct_journal_entries journal WHERE journal.id = ANY(v_journal_ids);
  DELETE FROM public.wallet_transactions wt
  WHERE wt.metadata ->> 'pre_fund_transaction_id' = ANY(v_payment_ids::TEXT[])
     OR wt.metadata ->> 'pre_fund_payment_event_key' = ANY(v_event_keys);

  PERFORM set_config('app.authorized_payment_hard_delete', 'on', true);
  DELETE FROM public.pre_fund_transactions payment WHERE payment.id = ANY(v_payment_ids);

  -- Refresh each affected fund once after the complete payment set is gone.
  UPDATE public.pre_fund_requests fund
  SET paid_amount = COALESCE(balance.verified_paid_amount, 0),
      available_balance = COALESCE(balance.verified_available_balance, fund.amount),
      updated_at = now()
  FROM unnest(v_fund_ids) AS affected(fund_id)
  LEFT JOIN public.pre_fund_balance_snapshot_v balance ON balance.fund_id = affected.fund_id
  WHERE fund.id = affected.fund_id;

  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions wt
    WHERE wt.metadata ->> 'down_payment_request_id' = p_request_id::TEXT
      AND wt.status::TEXT IN ('pending', 'posted')
  ) THEN
    RAISE EXCEPTION 'Active wallet evidence remains after payment deletion. Finance must resolve it before reopening this request.';
  END IF;

  v_due_amount := COALESCE(
    NULLIF(v_request.approved_amount::NUMERIC, 0),
    NULLIF((v_request.metadata ->> 'approved_amount')::NUMERIC, 0),
    v_request.requested_amount,
    0
  );

  SELECT COALESCE(jsonb_agg(
    CASE WHEN jsonb_typeof(item) = 'object'
      THEN (item - 'paid_at' - 'transaction_id') || jsonb_build_object('paid', false)
      ELSE item END
  ), '[]'::jsonb)
  INTO v_installments
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(v_request.installment_plan) = 'array'
      THEN v_request.installment_plan ELSE '[]'::jsonb END
  ) AS item;

  -- Remove any temporary snapshots left by an interrupted legacy attempt.
  PERFORM set_config('app.payment_delete_audit_cleanup', 'on', true);
  DELETE FROM public.payment_event_delete_audit WHERE payment_event_id = ANY(v_payment_ids);

  PERFORM set_config('app.down_payment_paid_reopen_rpc', 'on', true);
  PERFORM set_config('app.pre_fund_payment_rpc', 'on', true);
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
      pre_fund_transaction_id = NULL,
      wallet_transaction_ids = '[]'::jsonb,
      payment_proof_url = NULL,
      payment_proof_notes = NULL,
      payment_proof_uploaded_at = NULL,
      paid_installments = '[]'::jsonb,
      installment_plan = v_installments,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
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
$function$;

REVOKE ALL ON FUNCTION public.reopen_down_payment_after_reversal_rpc(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_down_payment_after_reversal_rpc(UUID, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

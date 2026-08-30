-- Legacy Down Payment rows can have a cumulative total_paid_amount that is
-- lower than their already-linked immutable Pre-Fund payment events. This
-- wrapper repairs that stale source cache inside the same transaction before
-- recording a new payment, but only when every linked amount remains within the
-- approved advance. It never edits or deletes ledger history.

CREATE OR REPLACE FUNCTION public.record_reconciled_required_pre_fund_payment_rpc(
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
  v_source public.down_payment_requests%ROWTYPE;
  v_due_amount NUMERIC;
  v_recorded_paid NUMERIC;
  v_linked_paid NUMERIC;
  v_result JSONB;
  v_reconciled BOOLEAN := false;
BEGIN
  PERFORM public._assert_finance_role();

  -- Preserve the canonical RPC's idempotent retry behavior before inspecting a
  -- source that may already have moved to fully_paid.
  IF NULLIF(BTRIM(p_payment_event_key), '') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.pre_fund_transactions t
       WHERE t.idempotency_key = BTRIM(p_payment_event_key)
         AND t.pre_fund_request_id = p_fund_id
         AND t.source_table = p_source_table
         AND t.source_id = p_source_id
     )
  THEN
    RETURN public.record_required_pre_fund_payment_rpc(
      p_source_table, p_source_id, p_fund_id, p_amount, p_currency,
      p_payment_date, p_created_by, p_receipt_url, p_notes,
      p_payment_event_key
    );
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

    v_due_amount := COALESCE(
      NULLIF(v_source.approved_amount::NUMERIC, 0),
      NULLIF((v_source.metadata ->> 'approved_amount')::NUMERIC, 0),
      v_source.requested_amount,
      0
    );
    v_recorded_paid := COALESCE(v_source.total_paid_amount, 0);

    SELECT GREATEST(COALESCE(SUM(
      CASE
        WHEN t.transaction_type = 'payment' THEN t.amount
        WHEN t.transaction_type IN ('reversal', 'return') THEN -t.amount
        ELSE 0
      END
    ), 0), 0)
      INTO v_linked_paid
      FROM public.pre_fund_transactions t
     WHERE t.source_table = 'down_payment_requests'
       AND t.source_id = p_source_id;

    IF v_linked_paid > v_recorded_paid THEN
      IF v_linked_paid > v_due_amount THEN
        RAISE EXCEPTION
          'This advance is over-linked: % is approved, but % remains linked in the immutable Pre-Fund ledger. Reverse the incorrect prior payment before paying again.',
          v_due_amount, v_linked_paid;
      END IF;

      IF v_linked_paid + p_amount > v_due_amount THEN
        RAISE EXCEPTION
          'Payment exceeds the true remaining advance after legacy reconciliation (% approved, % already linked, % requested).',
          v_due_amount, v_linked_paid, p_amount;
      END IF;

      PERFORM set_config('app.pre_fund_payment_rpc', 'on', true);
      UPDATE public.down_payment_requests
         SET status = CASE
               WHEN v_linked_paid >= v_due_amount THEN 'fully_paid'
               ELSE 'partially_paid'
             END,
             total_paid_amount = v_linked_paid,
             remaining_amount = GREATEST(v_due_amount - v_linked_paid, 0),
             metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
               'pre_fund_source_total_reconciled', true,
               'pre_fund_source_total_reconciled_from', v_recorded_paid,
               'pre_fund_source_total_reconciled_to', v_linked_paid,
               'pre_fund_source_total_reconciled_at', now()
             ),
             updated_at = now()
       WHERE id = p_source_id;
      v_reconciled := true;
    END IF;
  END IF;

  v_result := public.record_required_pre_fund_payment_rpc(
    p_source_table, p_source_id, p_fund_id, p_amount, p_currency,
    p_payment_date, p_created_by, p_receipt_url, p_notes,
    p_payment_event_key
  );

  RETURN v_result || jsonb_build_object(
    'legacy_source_total_reconciled', v_reconciled,
    'previous_recorded_paid_amount', v_recorded_paid,
    'previous_linked_paid_amount', v_linked_paid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_reconciled_required_pre_fund_payment_rpc(
  TEXT,UUID,UUID,NUMERIC,TEXT,DATE,UUID,TEXT,TEXT,TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_reconciled_required_pre_fund_payment_rpc(
  TEXT,UUID,UUID,NUMERIC,TEXT,DATE,UUID,TEXT,TEXT,TEXT
) TO authenticated;
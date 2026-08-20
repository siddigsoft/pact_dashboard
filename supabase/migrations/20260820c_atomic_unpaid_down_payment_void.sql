-- Keep down-payment deletion consistent across Down-Payment Tracker, Field
-- Payments, and Cycle Close. A request with any financial or exception trail
-- must be reversed through its dedicated financial flow instead of erased.

CREATE OR REPLACE FUNCTION public.void_unpaid_down_payment_request(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.down_payment_requests%ROWTYPE;
  v_actor_id uuid := auth.uid();
  v_source_site_id uuid;
  v_has_paid_sibling boolean := false;
  v_has_redirect_allocation boolean := false;
  v_deleted_metadata jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You must be signed in to delete a down-payment request.');
  END IF;

  -- Use the same normalized role sources as the protected Cycle Close
  -- correction flow, with Admin retained for the existing tracker workflow.
  IF NOT public.is_cycle_redirect_correction_authorizer(v_actor_id)
     AND NOT EXISTS (
       SELECT 1
       FROM public.profiles p
       WHERE p.id = v_actor_id
         AND regexp_replace(lower(coalesce(p.role::text, '')), '[^a-z0-9]', '', 'g')
             IN ('admin', 'ict')
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.user_roles ur
       WHERE ur.user_id = v_actor_id
         AND regexp_replace(lower(coalesce(ur.role::text, '')), '[^a-z0-9]', '', 'g')
             IN ('admin', 'ict')
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only authorised Finance or Admin users can delete a down-payment request.');
  END IF;

  SELECT *
  INTO v_request
  FROM public.down_payment_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The down-payment request was not found or was already deleted.');
  END IF;

  IF v_request.status NOT IN ('pending_supervisor', 'pending_admin', 'approved')
     OR coalesce(v_request.total_paid_amount, 0) <> 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This request has payment activity or is no longer an unpaid request. Reverse it through the financial correction flow instead of deleting it.'
    );
  END IF;

  IF v_request.pre_fund_transaction_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This request is linked to Pre-Funding. Unlink or reverse that funding transaction before deleting it.'
    );
  END IF;

  -- Any wallet reference is financial evidence, even if an earlier defect left
  -- the request total at zero. Do not silently hide an unreconciled debit.
  IF coalesce(jsonb_typeof(v_request.wallet_transaction_ids), 'null') = 'array'
     AND jsonb_array_length(v_request.wallet_transaction_ids) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This request has a linked wallet transaction. It was not deleted; reverse the wallet payment first so the ledger remains balanced.'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.wallet_transactions wt
    WHERE wt.metadata->>'down_payment_request_id' = v_request.id::text
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This request has wallet payment evidence. Reverse the wallet payment first so the ledger remains balanced.'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cycle_exception_actions action
    WHERE action.advance_id = v_request.id
  ) OR EXISTS (
    SELECT 1
    FROM public.cycle_exception_action_allocations allocation
    WHERE allocation.source_advance_id = v_request.id
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This request is already part of a Cycle Close exception. Complete or correct that exception instead of deleting it.'
    );
  END IF;

  v_source_site_id := v_request.mmp_site_entry_id;
  v_deleted_metadata := CASE
    WHEN jsonb_typeof(v_request.metadata) = 'object' THEN v_request.metadata
    ELSE '{}'::jsonb
  END || jsonb_build_object(
    'deleted', true,
    'deleted_at', now(),
    'deleted_by', v_actor_id,
    'deletion_reason', 'unpaid_request_voided'
  );

  UPDATE public.down_payment_requests
  SET status = 'cancelled',
      site_visit_id = NULL,
      mmp_site_entry_id = NULL,
      metadata = v_deleted_metadata,
      updated_at = now()
  WHERE id = v_request.id;

  -- A zero-cash "advance offset" with no live paid advance and no normalized
  -- Redirect allocation is stale display data. Clear only this provably
  -- orphaned settlement; never infer or overwrite a cash payment.
  IF v_source_site_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.down_payment_requests sibling
      WHERE sibling.mmp_site_entry_id = v_source_site_id
        AND sibling.id <> v_request.id
        AND sibling.status IN ('paid', 'partially_paid', 'fully_paid')
        AND coalesce(sibling.total_paid_amount, 0) > 0
    ) INTO v_has_paid_sibling;

    SELECT EXISTS (
      SELECT 1
      FROM public.cycle_exception_action_allocations allocation
      WHERE allocation.target_site_id = v_source_site_id
    ) INTO v_has_redirect_allocation;

    IF NOT v_has_paid_sibling AND NOT v_has_redirect_allocation THEN
      UPDATE public.mmp_site_entries
      SET fee_paid_status = 'unpaid',
          fee_paid_amount = 0,
          fee_cash_paid_amount = 0,
          fee_advance_offset_amount = 0,
          fee_unallocated_amount = 0,
          fee_paid_at = NULL,
          fee_paid_by = NULL,
          fee_payment_method = NULL,
          fee_payment_notes = NULL,
          fee_receipt_url = NULL,
          updated_at = now()
      WHERE id = v_source_site_id
        AND coalesce(fee_payment_method, '') = 'advance_offset'
        AND coalesce(fee_cash_paid_amount, 0) = 0;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_request.id,
    'message', 'The unpaid request was removed from active payment and Cycle Close views.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.void_unpaid_down_payment_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_unpaid_down_payment_request(uuid) TO authenticated;

COMMENT ON FUNCTION public.void_unpaid_down_payment_request(uuid) IS
  'Atomically voids only an unpaid advance with no wallet, pre-fund, or Cycle Close trail.';
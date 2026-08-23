-- ============================================================================
-- REMOVE AN OCS PAYMENT WITHOUT DELETING ITS REQUEST
-- ============================================================================
-- Supersedes the paid-source transition from 20260823b for the Reconciliation
-- action. The request remains available as approved after its active payment is
-- safely reversed.

CREATE OR REPLACE FUNCTION public.revert_operational_cost_payments_atomically_rpc(
  p_source_ids UUID[],
  p_action TEXT DEFAULT 'revert'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source RECORD;
  v_payment RECORD;
  v_source_count INTEGER;
  v_active_payment_count INTEGER;
  v_unlink_result JSONB;
  v_reverted_sources INTEGER := 0;
  v_role TEXT;
  v_is_service_role BOOLEAN := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
BEGIN
  IF p_action <> 'revert' THEN
    RAISE EXCEPTION 'Operational Cost requests cannot be deleted through the payment-removal workflow.';
  END IF;
  IF COALESCE(array_length(p_source_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'At least one operational cost source is required.';
  END IF;

  IF NOT v_is_service_role THEN
    SELECT lower(trim(role)) INTO v_role
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1;

    IF COALESCE(v_role, '') NOT IN ('super_admin', 'superadmin', 'admin', 'administrator') THEN
      RAISE EXCEPTION 'Access denied: only an Admin or Super Admin can remove an operational cost payment.';
    END IF;
  END IF;

  SELECT count(*) INTO v_source_count
  FROM public.operational_cost_submissions
  WHERE id = ANY(p_source_ids);
  IF v_source_count <> array_length(p_source_ids, 1) THEN
    RAISE EXCEPTION 'One or more operational cost sources do not exist.';
  END IF;

  FOR v_source IN
    SELECT id, status
    FROM public.operational_cost_submissions
    WHERE id = ANY(p_source_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    IF v_source.status = 'reconciled' THEN
      RAISE EXCEPTION 'Reconciled operational cost submissions cannot have payments removed (source %).', v_source.id;
    END IF;

    v_active_payment_count := 0;
    FOR v_payment IN
      SELECT payment.id, payment.reconciled
      FROM public.pre_fund_transactions payment
      WHERE payment.source_table = 'operational_cost_submissions'
        AND payment.source_id = v_source.id
        AND payment.transaction_type = 'payment'
        AND NOT EXISTS (
          SELECT 1
          FROM public.pre_fund_transactions reversal
          WHERE reversal.reversal_of_id = payment.id
        )
      ORDER BY payment.occurred_at, payment.id
      FOR UPDATE
    LOOP
      v_active_payment_count := v_active_payment_count + 1;
      IF COALESCE(v_payment.reconciled, false) THEN
        RAISE EXCEPTION 'Reconciled payment events cannot be removed (payment %, source %).',
          v_payment.id, v_source.id;
      END IF;
    END LOOP;

    IF v_active_payment_count = 0 THEN
      RAISE EXCEPTION 'No active Pre-Fund payment event is linked to operational cost source %.', v_source.id;
    END IF;
  END LOOP;

  FOR v_source IN
    SELECT id
    FROM public.operational_cost_submissions
    WHERE id = ANY(p_source_ids)
    ORDER BY id
  LOOP
    v_unlink_result := public._unlink_pre_fund_payment_internal_rpc(
      'operational_cost_submissions', v_source.id
    );
    IF NOT COALESCE((v_unlink_result ->> 'success')::boolean, false) THEN
      RAISE EXCEPTION 'Unable to reverse source %: %',
        v_source.id, COALESCE(v_unlink_result ->> 'error', 'unknown error');
    END IF;
    v_reverted_sources := v_reverted_sources + 1;

    UPDATE public.operational_cost_submissions
    SET status = 'approved',
        paid_at = NULL,
        paid_by = NULL,
        amount_paid_cents = 0,
        payment_proof_url = NULL,
        payment_proof_notes = NULL,
        payment_proof_uploaded_at = NULL,
        updated_at = now()
    WHERE id = v_source.id;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'source_count', v_source_count,
    'reversed_source_count', v_reverted_sources,
    'deleted_source_count', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revert_operational_cost_payments_atomically_rpc(UUID[],TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revert_operational_cost_payments_atomically_rpc(UUID[],TEXT) TO authenticated;

-- Source-page deletion is deliberately a different operation. Reconciliation
-- calls only the payment-removal function above; this wrapper preserves the
-- established source deletion flow without exposing it through that action.
CREATE OR REPLACE FUNCTION public.delete_operational_cost_request_with_payment_reversal_rpc(
  p_source_ids UUID[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_source_count INTEGER;
  v_role TEXT;
  v_is_service_role BOOLEAN := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
BEGIN
  IF COALESCE(array_length(p_source_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'At least one operational cost source is required.';
  END IF;

  IF NOT v_is_service_role THEN
    SELECT lower(trim(role)) INTO v_role
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1;
    IF COALESCE(v_role, '') NOT IN ('super_admin', 'superadmin') THEN
      RAISE EXCEPTION 'Access denied: only a Super Admin can delete an operational cost submission.';
    END IF;
  END IF;

  SELECT count(*) INTO v_source_count
  FROM public.operational_cost_submissions
  WHERE id = ANY(p_source_ids);
  IF v_source_count <> array_length(p_source_ids, 1) THEN
    RAISE EXCEPTION 'One or more operational cost sources do not exist.';
  END IF;

  v_result := public.revert_operational_cost_payments_atomically_rpc(p_source_ids, 'revert');
  IF NOT COALESCE((v_result ->> 'success')::boolean, false) THEN
    RAISE EXCEPTION 'Unable to reverse linked payment before deleting the request.';
  END IF;

  DELETE FROM public.operational_cost_submissions
  WHERE id = ANY(p_source_ids);

  RETURN v_result || jsonb_build_object('deleted_source_count', v_source_count);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_operational_cost_request_with_payment_reversal_rpc(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_operational_cost_request_with_payment_reversal_rpc(UUID[]) TO authenticated;
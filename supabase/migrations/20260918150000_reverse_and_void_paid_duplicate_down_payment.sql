-- Correct a legacy paid duplicate without reopening it into the active-request
-- uniqueness constraint. Every immutable payment is forensically deleted
-- newest-first through the canonical payment cleanup RPC. That operation
-- snapshots and removes linked wallet/GL evidence and restores the exact
-- originating Pre-Fund. The chosen duplicate is then soft-deleted while its
-- sibling remains active.

CREATE TABLE IF NOT EXISTS public.down_payment_paid_duplicate_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.down_payment_requests(id),
  retained_request_id uuid NOT NULL REFERENCES public.down_payment_requests(id),
  original_mmp_site_entry_id uuid NOT NULL,
  reason text NOT NULL,
  corrected_by uuid,
  corrected_at timestamptz NOT NULL DEFAULT now(),
  deleted_payment_event_count integer NOT NULL,
  deleted_payment_amount numeric NOT NULL,
  request_before_snapshot jsonb NOT NULL
);

ALTER TABLE public.down_payment_paid_duplicate_corrections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS down_payment_paid_duplicate_corrections_read
  ON public.down_payment_paid_duplicate_corrections;
CREATE POLICY down_payment_paid_duplicate_corrections_read
  ON public.down_payment_paid_duplicate_corrections
  FOR SELECT TO authenticated
  USING (public.current_user_has_resource_permission('down_payments', 'reconcile'));

REVOKE INSERT, UPDATE, DELETE ON public.down_payment_paid_duplicate_corrections FROM authenticated;
GRANT SELECT ON public.down_payment_paid_duplicate_corrections TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_down_payment_paid_duplicate_correction_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Paid duplicate correction evidence is immutable.';
END;
$$;

DROP TRIGGER IF EXISTS trg_paid_duplicate_correction_immutable
  ON public.down_payment_paid_duplicate_corrections;
CREATE TRIGGER trg_paid_duplicate_correction_immutable
  BEFORE UPDATE OR DELETE ON public.down_payment_paid_duplicate_corrections
  FOR EACH ROW EXECUTE FUNCTION public.guard_down_payment_paid_duplicate_correction_immutable();

-- Standardize the canonical hard-delete lock order for all callers:
-- source advisory lock -> payment row -> source row -> fund row.
-- The original implementation selected the payment FOR UPDATE before taking
-- its source advisory lock, which could deadlock against source-level actions.
DO $$
BEGIN
  IF to_regprocedure('public.delete_latest_source_payment_legacy_rpc(uuid,text)') IS NULL
     AND to_regprocedure('public.delete_latest_source_payment_rpc(uuid,text)') IS NOT NULL THEN
    ALTER FUNCTION public.delete_latest_source_payment_rpc(uuid, text)
      RENAME TO delete_latest_source_payment_legacy_rpc;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_latest_source_payment_rpc(
  p_payment_event_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_table text;
  v_source_id uuid;
BEGIN
  SELECT payment.source_table, payment.source_id
  INTO v_source_table, v_source_id
  FROM public.pre_fund_transactions payment
  WHERE payment.id = p_payment_event_id
    AND payment.transaction_type = 'payment'
    AND payment.source_table IN ('down_payment_requests', 'operational_cost_submissions')
    AND payment.source_id IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active source payment not found.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_source_table || ':' || v_source_id::text, 0)
  );

  RETURN public.delete_latest_source_payment_legacy_rpc(
    p_payment_event_id,
    p_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_latest_source_payment_legacy_rpc(uuid, text)
  FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.delete_latest_source_payment_rpc(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_latest_source_payment_rpc(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reverse_and_void_paid_duplicate_down_payment_rpc(
  p_request_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.down_payment_requests%ROWTYPE;
  v_active_sibling_id uuid;
  v_payment_event_id uuid;
  v_delete_result jsonb;
  v_deleted_event_count integer := 0;
  v_deleted_amount numeric := 0;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_site_lock_key text;
  v_initial_site_id uuid;
  v_request_before jsonb;
  v_existing_correction public.down_payment_paid_duplicate_corrections%ROWTYPE;
BEGIN
  PERFORM public._assert_finance_role();

  IF NOT public.current_user_has_resource_permission('down_payments', 'delete')
     OR NOT public.current_user_has_resource_permission('down_payments', 'reconcile')
     OR NOT public.current_user_has_resource_permission('down_payments', 'update')
     OR NOT public.current_user_has_resource_permission('down_payments', 'approve')
     OR NOT public.current_user_has_resource_permission('pre_funding', 'update')
     OR NOT public.current_user_has_resource_permission('wallets', 'update') THEN
    RAISE EXCEPTION
      'Down Payment delete, reconcile, update, approve, Pre-Fund update, and Wallet update permissions are required.';
  END IF;

  IF v_reason IS NULL OR length(v_reason) < 5 THEN
    RAISE EXCEPTION 'A correction reason of at least 5 characters is required.';
  END IF;

  -- Read only enough to derive the shared site lock. The target and every
  -- sibling are locked deterministically after serialization.
  SELECT *
  INTO v_request
  FROM public.down_payment_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Down-payment request not found.';
  END IF;

  SELECT * INTO v_existing_correction
  FROM public.down_payment_paid_duplicate_corrections
  WHERE request_id = p_request_id;

  IF FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.pre_fund_transactions payment
      WHERE payment.source_table = 'down_payment_requests'
        AND payment.source_id = p_request_id
        AND payment.transaction_type = 'payment'
        AND NOT EXISTS (
          SELECT 1 FROM public.pre_fund_transactions reversal
          WHERE reversal.reversal_of_id = payment.id
        )
    ) OR EXISTS (
      SELECT 1 FROM public.wallet_transactions wallet_row
      WHERE wallet_row.metadata ->> 'down_payment_request_id' = p_request_id::text
        AND wallet_row.status::text IN ('pending', 'posted')
    ) THEN
      RAISE EXCEPTION 'Existing duplicate correction evidence does not match the active financial records.';
    END IF;
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'request_id', p_request_id,
      'retained_active_request_id', v_existing_correction.retained_request_id,
      'deleted_payment_event_count', v_existing_correction.deleted_payment_event_count,
      'deleted_payment_amount', v_existing_correction.deleted_payment_amount
    );
  END IF;

  IF v_request.mmp_site_entry_id IS NULL THEN
    RAISE EXCEPTION
      'This legacy request has no exact MMP site-entry link. Finance must review it in Pre-Funding Reconciliation.';
  END IF;

  v_initial_site_id := v_request.mmp_site_entry_id;
  v_request_before := to_jsonb(v_request);
  v_site_lock_key := 'down_payment_duplicate_site:' || v_initial_site_id::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_site_lock_key, 0));

  -- A concurrent retry may have waited for the first correction here.
  SELECT * INTO v_existing_correction
  FROM public.down_payment_paid_duplicate_corrections
  WHERE request_id = p_request_id;
  IF FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.pre_fund_transactions payment
      WHERE payment.source_table = 'down_payment_requests'
        AND payment.source_id = p_request_id
        AND payment.transaction_type = 'payment'
        AND NOT EXISTS (
          SELECT 1 FROM public.pre_fund_transactions reversal
          WHERE reversal.reversal_of_id = payment.id
        )
    ) OR EXISTS (
      SELECT 1 FROM public.wallet_transactions wallet_row
      WHERE wallet_row.metadata ->> 'down_payment_request_id' = p_request_id::text
        AND wallet_row.status::text IN ('pending', 'posted')
    ) THEN
      RAISE EXCEPTION 'Existing duplicate correction evidence does not match the active financial records.';
    END IF;
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'request_id', p_request_id,
      'retained_active_request_id', v_existing_correction.retained_request_id,
      'deleted_payment_event_count', v_existing_correction.deleted_payment_event_count,
      'deleted_payment_amount', v_existing_correction.deleted_payment_amount
    );
  END IF;

  -- Use the same source serialization as the canonical hard-delete wrapper
  -- before taking payment or request row locks.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('down_payment_requests:' || p_request_id::text, 0)
  );

  -- Match the canonical hard-delete lock order: payment rows before request
  -- rows. This prevents a direct payment deletion from deadlocking this flow.
  PERFORM 1
  FROM public.pre_fund_transactions payment
  WHERE payment.source_table = 'down_payment_requests'
    AND payment.source_id = p_request_id
    AND payment.transaction_type = 'payment'
    AND NOT EXISTS (
      SELECT 1 FROM public.pre_fund_transactions reversal
      WHERE reversal.reversal_of_id = payment.id
    )
  ORDER BY payment.occurred_at DESC NULLS LAST,
           payment.created_at DESC NULLS LAST,
           payment.id DESC
  FOR UPDATE;

  -- Opposite-side corrections now take locks in the same UUID order.
  PERFORM 1
  FROM public.down_payment_requests request_row
  WHERE request_row.mmp_site_entry_id = v_initial_site_id
  ORDER BY request_row.id
  FOR UPDATE;

  -- The canonical hard-delete locks payment -> source request -> fund. Match
  -- that order here, while sorting funds so multi-fund corrections cannot
  -- invert A/B fund locks across concurrent requests.
  PERFORM 1
  FROM public.pre_fund_requests fund
  WHERE fund.id IN (
    SELECT DISTINCT payment.pre_fund_request_id
    FROM public.pre_fund_transactions payment
    WHERE payment.source_table = 'down_payment_requests'
      AND payment.source_id = p_request_id
      AND payment.transaction_type = 'payment'
      AND NOT EXISTS (
        SELECT 1 FROM public.pre_fund_transactions reversal
        WHERE reversal.reversal_of_id = payment.id
      )
  )
  ORDER BY fund.id
  FOR UPDATE;

  SELECT *
  INTO v_request
  FROM public.down_payment_requests
  WHERE id = p_request_id;

  IF v_request.mmp_site_entry_id IS DISTINCT FROM v_initial_site_id THEN
    RAISE EXCEPTION 'The request site link changed during correction. Refresh and try again.';
  END IF;

  IF v_request.status NOT IN ('paid', 'partially_paid', 'fully_paid', 'reconciled', 'completed', 'closed')
     OR coalesce(v_request.total_paid_amount, 0) <= 0 THEN
    RAISE EXCEPTION
      'Only a paid duplicate with recorded payment activity can use Reverse & Remove Duplicate.';
  END IF;

  IF coalesce(v_request.site_fee_applied_cents, 0) > 0 OR EXISTS (
    SELECT 1
    FROM public.site_advance_applications application
    WHERE application.down_payment_request_id = p_request_id
      AND application.applied_cents > 0
  ) THEN
    RAISE EXCEPTION
      'This advance has already been applied to WFP-confirmed site finance. Resolve it in Finance Reconciliation first.';
  END IF;

  SELECT sibling.id
  INTO v_active_sibling_id
  FROM public.down_payment_requests sibling
  WHERE sibling.mmp_site_entry_id = v_request.mmp_site_entry_id
    AND sibling.id <> v_request.id
    AND sibling.status NOT IN ('cancelled', 'rejected', 'deleted')
    AND coalesce(sibling.metadata ->> 'deleted', 'false')::boolean IS NOT TRUE
  ORDER BY sibling.created_at, sibling.id
  LIMIT 1;

  IF v_active_sibling_id IS NULL THEN
    RAISE EXCEPTION
      'No active sibling request exists for this MMP site. Use the normal paid-request correction flow instead.';
  END IF;

  -- Detach inside this transaction before payment cleanup changes status back
  -- through approved/partially_paid. This prevents the legacy duplicate trigger
  -- from rejecting those intermediate updates. Any later failure rolls this
  -- detachment back with the entire correction.
  UPDATE public.down_payment_requests
  SET mmp_site_entry_id = NULL,
      site_visit_id = NULL,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'duplicate_correction_in_progress', true,
        'retained_active_request_id', v_active_sibling_id
      ),
      updated_at = now()
  WHERE id = p_request_id;

  LOOP
    SELECT payment.id
    INTO v_payment_event_id
    FROM public.pre_fund_transactions payment
    WHERE payment.source_table = 'down_payment_requests'
      AND payment.source_id = p_request_id
      AND payment.transaction_type = 'payment'
      AND NOT EXISTS (
        SELECT 1
        FROM public.pre_fund_transactions reversal
        WHERE reversal.reversal_of_id = payment.id
      )
    ORDER BY payment.occurred_at DESC NULLS LAST,
             payment.created_at DESC NULLS LAST,
             payment.id DESC
    LIMIT 1;

    EXIT WHEN v_payment_event_id IS NULL;

    IF EXISTS (
      SELECT 1
      FROM public.wallet_transactions wallet_row
      WHERE (
        wallet_row.metadata ->> 'pre_fund_transaction_id' = v_payment_event_id::text
        OR wallet_row.metadata ->> 'pre_fund_payment_event_key' = (
          SELECT payment.idempotency_key
          FROM public.pre_fund_transactions payment
          WHERE payment.id = v_payment_event_id
        )
      )
        AND wallet_row.status::text = 'posted'
        AND (
          wallet_row.type <> 'down_payment'
          OR coalesce(wallet_row.balance_before, 0) <> coalesce(wallet_row.balance_after, 0)
        )
    ) THEN
      RAISE EXCEPTION
        'A linked wallet row changes wallet balance. Finance must reconcile it before removing this duplicate.';
    END IF;

    -- Down-payment wallet rows are evidence-only. Marking them pending makes
    -- the canonical hard-delete remove them without changing wallet aggregates.
    UPDATE public.wallet_transactions wallet_row
    SET status = 'pending'
    WHERE (
      wallet_row.metadata ->> 'pre_fund_transaction_id' = v_payment_event_id::text
      OR wallet_row.metadata ->> 'pre_fund_payment_event_key' = (
        SELECT payment.idempotency_key
        FROM public.pre_fund_transactions payment
        WHERE payment.id = v_payment_event_id
      )
    )
      AND wallet_row.type = 'down_payment'
      AND wallet_row.status::text = 'posted'
      AND coalesce(wallet_row.balance_before, 0) = coalesce(wallet_row.balance_after, 0);

    v_delete_result := public.delete_latest_source_payment_rpc(
      v_payment_event_id,
      'Paid duplicate removed: ' || v_reason
    );

    IF coalesce((v_delete_result ->> 'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'A linked payment could not be removed safely.';
    END IF;

    v_deleted_event_count := v_deleted_event_count + 1;
    v_deleted_amount := v_deleted_amount
      + coalesce((v_delete_result ->> 'deleted_amount')::numeric, 0);
    v_payment_event_id := NULL;
  END LOOP;

  IF v_deleted_event_count = 0 THEN
    RAISE EXCEPTION
      'This paid request has no active immutable payment event. Finance must review it in Pre-Funding Reconciliation.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.wallet_transactions wallet_row
    WHERE wallet_row.metadata ->> 'down_payment_request_id' = p_request_id::text
      AND wallet_row.status::text IN ('pending', 'posted')
  ) THEN
    RAISE EXCEPTION
      'Active wallet evidence remains. Finance must resolve it before removing this duplicate.';
  END IF;

  UPDATE public.down_payment_requests
  SET status = 'deleted',
      metadata = (coalesce(metadata, '{}'::jsonb) - 'duplicate_correction_in_progress')
        || jsonb_build_object(
          'deleted', true,
          'deleted_at', now(),
          'deleted_by', auth.uid(),
          'deletion_reason', 'paid_duplicate_reversed_and_removed',
          'duplicate_correction_reason', v_reason,
          'retained_active_request_id', v_active_sibling_id,
          'deleted_payment_event_count', v_deleted_event_count,
          'deleted_payment_amount', v_deleted_amount
        ),
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.down_payment_paid_duplicate_corrections (
    request_id,
    retained_request_id,
    original_mmp_site_entry_id,
    reason,
    corrected_by,
    deleted_payment_event_count,
    deleted_payment_amount,
    request_before_snapshot
  ) VALUES (
    p_request_id,
    v_active_sibling_id,
    v_initial_site_id,
    v_reason,
    auth.uid(),
    v_deleted_event_count,
    v_deleted_amount,
    v_request_before
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'request_id', p_request_id,
    'retained_active_request_id', v_active_sibling_id,
    'deleted_payment_event_count', v_deleted_event_count,
    'deleted_payment_amount', v_deleted_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_and_void_paid_duplicate_down_payment_rpc(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_and_void_paid_duplicate_down_payment_rpc(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.reverse_and_void_paid_duplicate_down_payment_rpc(uuid, text) IS
  'Forensically deletes a paid duplicate and linked GL/wallet evidence, restores its exact original Pre-Fund sources, and retains another active request for the same MMP site.';

NOTIFY pgrst, 'reload schema';
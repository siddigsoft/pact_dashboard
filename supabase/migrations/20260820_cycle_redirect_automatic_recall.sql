-- =============================================================================
-- Cycle Close Redirect — automatic recall from original payment evidence
-- =============================================================================
-- Legacy Redirect fee records can later be edited to a different fee amount even
-- though the posted original Redirect journal and the paid advance remain intact.
-- A recall must reverse those immutable financial records, not require a person
-- to reconcile a mutable fee amount. This removes the snapshot-review detour
-- while retaining all authorization, fiscal-period, journal, wallet, later-
-- payment, provenance, and idempotency guards in the existing reversal RPC.
-- =============================================================================

BEGIN;

DO $patch_automatic_recall$
DECLARE
  v_source text;
  v_old_snapshot_gate constant text := $old_snapshot$
  -- ── Resolve the immutable action snapshot, or a separately attested Finance
  -- review for a legacy action that never captured the snapshot fields. ────────
  IF v_action.redirect_fee_gross_amount IS NOT NULL
     AND v_action.redirect_fee_prior_settled_amount IS NOT NULL
     AND v_action.redirect_fee_settled_amount IS NOT NULL
     AND v_action.redirect_fee_remaining_amount IS NOT NULL
     AND v_action.redirect_fee_status IS NOT NULL THEN
    v_gross_fee := round(v_action.redirect_fee_gross_amount, 2);
    v_snapshot_prior := round(v_action.redirect_fee_prior_settled_amount, 2);
    v_settled_amount := round(v_action.redirect_fee_settled_amount, 2);
    v_snapshot_remaining := round(v_action.redirect_fee_remaining_amount, 2);
    IF v_action.redirect_fee_status <> 'paid' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'The immutable Redirect fee snapshot is not an exact full legacy settlement. Finance must review it manually.'
      );
    END IF;
  ELSE
    SELECT review.gross_fee, review.prior_settled_amount,
           review.settled_amount, review.remaining_amount
    INTO v_gross_fee, v_snapshot_prior, v_settled_amount, v_snapshot_remaining
    FROM public.cycle_redirect_fee_snapshot_reviews review
    WHERE review.action_id = v_action.id
      AND review.advance_id = v_action.advance_id
      AND review.original_journal_entry_id = v_journal.id
      AND review.fee_site_entry_id = v_target.id
      AND review.fee_status = 'paid'
    ORDER BY review.reviewed_at DESC
    LIMIT 1
    FOR SHARE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'The immutable Redirect fee snapshot is incomplete. Complete the Finance review in this panel before reversing the reprocessed payment.'
      );
    END IF;
  END IF;

  IF v_gross_fee <= 0
     OR v_snapshot_prior <> 0
     OR v_settled_amount <> v_gross_fee
     OR v_snapshot_remaining <> 0
     OR abs(
       v_snapshot_prior + v_settled_amount + v_snapshot_remaining - v_gross_fee
     ) > 0.005 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The reviewed Redirect fee snapshot is not an exact full legacy settlement.'
    );
  END IF;
$old_snapshot$;
  v_new_snapshot_gate constant text := $new_snapshot$
  -- ── The original paid advance and balanced posted journal are authoritative
  -- for an automatic recall. Current fee values may have changed after the
  -- Redirect and must not change the amount being reversed. ───────────────────
  SELECT
    coalesce(sum(functional_amount) FILTER (WHERE debit_credit = 'DR'), 0),
    coalesce(sum(functional_amount) FILTER (WHERE debit_credit = 'CR'), 0)
  INTO v_gross_fee, v_current_gross
  FROM public.acct_journal_lines
  WHERE entry_id = v_original_journal_id;

  IF v_gross_fee <= 0
     OR abs(v_gross_fee - v_current_gross) > 0.005
     OR abs(v_gross_fee - v_original_total_paid) > 0.005 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The original Redirect journal and advance no longer prove the exact payment amount required for automatic recall.'
    );
  END IF;

  v_gross_fee := v_original_total_paid;
  v_snapshot_prior := 0;
  v_settled_amount := v_original_total_paid;
  v_snapshot_remaining := 0;
$new_snapshot$;
  v_old_fee_gate constant text := $old_fee$
  v_current_gross := round(
    coalesce(v_target.enumerator_fee, 0) + coalesce(v_target.transport_fee, 0),
    2
  );

  SELECT count(*), (array_agg(id))[1]
  INTO v_bridge_log_count, v_bridge_log_id
  FROM public.acct_gl_bridge_log
  WHERE source_table = 'mmp_site_entries'
    AND source_id = v_target_id
    AND event_type = 'enumerator_fee_paid'
    AND status = 'success'
    AND journal_entry_id = v_journal.id;

  IF v_bridge_log_count <> 1
     OR abs(v_current_gross - v_gross_fee) > 0.005
     OR v_target.fee_paid_status IS DISTINCT FROM 'paid'
     OR v_target.fee_paid_at IS DISTINCT FROM v_action.executed_at
     OR v_target.fee_paid_by IS DISTINCT FROM v_action.executed_by
     OR abs(coalesce(v_target.fee_paid_amount, 0) - v_gross_fee) > 0.005
     OR abs(coalesce(v_target.fee_cash_paid_amount, 0) - v_gross_fee) > 0.005
     OR abs(coalesce(v_target.fee_advance_offset_amount, 0)) > 0.005
     OR abs(coalesce(v_target.fee_unallocated_amount, 0)) > 0.005
     OR nullif(trim(coalesce(v_target.fee_payment_method, '')), '') IS NOT NULL
     OR nullif(trim(coalesce(v_target.fee_payment_notes, '')), '') IS NOT NULL
     OR v_target.fee_receipt_url IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The legacy source fee no longer matches the exact Redirect snapshot. Finance must review it manually.'
    );
  END IF;
$old_fee$;
  v_new_fee_gate constant text := $new_fee$
  -- The linked original bridge and unchanged payment provenance prove that this
  -- paid marker belongs to the original Redirect. A later fee edit must not
  -- block reversal of the original posted journal and advance.
  SELECT count(*), (array_agg(id))[1]
  INTO v_bridge_log_count, v_bridge_log_id
  FROM public.acct_gl_bridge_log
  WHERE source_table = 'mmp_site_entries'
    AND source_id = v_target_id
    AND event_type = 'enumerator_fee_paid'
    AND status = 'success'
    AND journal_entry_id = v_journal.id;

  IF v_bridge_log_count <> 1
     OR v_target.fee_paid_status IS DISTINCT FROM 'paid'
     OR v_target.fee_paid_at IS DISTINCT FROM v_action.executed_at
     OR v_target.fee_paid_by IS DISTINCT FROM v_action.executed_by
     OR coalesce(v_target.fee_paid_amount, 0) <= 0
     OR coalesce(v_target.fee_cash_paid_amount, 0) <= 0
     OR abs(coalesce(v_target.fee_advance_offset_amount, 0)) > 0.005
     OR abs(coalesce(v_target.fee_unallocated_amount, 0)) > 0.005 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The fee record no longer proves the original paid state required for automatic recall.'
    );
  END IF;
$new_fee$;
BEGIN
  SELECT procedure.prosrc
  INTO v_source
  FROM pg_proc procedure
  WHERE procedure.oid = to_regprocedure(
    'public.reverse_reprocessed_cycle_redirect_for_correction(uuid,text,uuid,text,boolean)'
  );

  IF v_source IS NULL THEN
    RAISE EXCEPTION 'reverse_reprocessed_cycle_redirect_for_correction is missing; apply 20260819o first';
  END IF;
  IF strpos(v_source, 'original paid advance and balanced posted journal are authoritative') > 0 THEN
    RETURN;
  END IF;
  IF strpos(v_source, v_old_snapshot_gate) = 0
     OR strpos(v_source, v_old_fee_gate) = 0 THEN
    RAISE EXCEPTION 'reprocessed Redirect recall gate has drifted; review before applying automatic recall migration';
  END IF;

  v_source := replace(v_source, v_old_snapshot_gate, v_new_snapshot_gate);
  v_source := replace(v_source, v_old_fee_gate, v_new_fee_gate);
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.reverse_reprocessed_cycle_redirect_for_correction('
      || 'p_action_id uuid, p_reason text, p_period_id uuid, '
      || 'p_idempotency_key text, p_confirm_reverse_later_payment boolean'
      || ') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS %L',
    v_source
  );
END;
$patch_automatic_recall$;

REVOKE ALL ON FUNCTION public.reverse_reprocessed_cycle_redirect_for_correction(
  uuid, text, uuid, text, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_reprocessed_cycle_redirect_for_correction(
  uuid, text, uuid, text, boolean
) TO authenticated;

COMMENT ON FUNCTION public.reverse_reprocessed_cycle_redirect_for_correction(
  uuid, text, uuid, text, boolean
) IS 'Automatically recalls a reprocessed Redirect payment using the original balanced journal and paid advance as the amount authority; preserves all immutable accounting history.';

COMMIT;
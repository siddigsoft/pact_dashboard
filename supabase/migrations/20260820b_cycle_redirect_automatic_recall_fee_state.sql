-- =============================================================================
-- Cycle Close Redirect — do not block automatic recall on mutable fee state
-- =============================================================================
-- The original journal, its bridge log, and later-activity checks prove the
-- payment being recalled. Fee paid metadata may have been edited independently;
-- the atomic reversal resets that mutable fee state as part of the correction.
-- =============================================================================

BEGIN;

DO $patch_automatic_recall_fee_state$
DECLARE
  v_source text;
  v_old constant text := $old$
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
$old$;
  v_new constant text := $new$
  -- The original bridge is the immutable link between the fee site and the
  -- posted Redirect journal. All mutable fee fields are reset by the atomic
  -- reversal and must not block recalling that original payment.
  SELECT count(*), (array_agg(id))[1]
  INTO v_bridge_log_count, v_bridge_log_id
  FROM public.acct_gl_bridge_log
  WHERE source_table = 'mmp_site_entries'
    AND source_id = v_target_id
    AND event_type = 'enumerator_fee_paid'
    AND status = 'success'
    AND journal_entry_id = v_journal.id;

  IF v_bridge_log_count <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The original Redirect payment bridge is missing or ambiguous; automatic recall is unavailable.'
    );
  END IF;
$new$;
BEGIN
  SELECT procedure.prosrc
  INTO v_source
  FROM pg_proc procedure
  WHERE procedure.oid = to_regprocedure(
    'public.reverse_reprocessed_cycle_redirect_for_correction(uuid,text,uuid,text,boolean)'
  );

  IF v_source IS NULL THEN
    RAISE EXCEPTION 'reverse_reprocessed_cycle_redirect_for_correction is missing; apply automatic recall migration first';
  END IF;
  IF strpos(v_source, 'All mutable fee fields are reset by the atomic') > 0 THEN
    RETURN;
  END IF;
  IF strpos(v_source, v_old) = 0 THEN
    RAISE EXCEPTION 'automatic recall fee-state gate has drifted; review before applying this migration';
  END IF;

  v_source := replace(v_source, v_old, v_new);
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.reverse_reprocessed_cycle_redirect_for_correction('
      || 'p_action_id uuid, p_reason text, p_period_id uuid, '
      || 'p_idempotency_key text, p_confirm_reverse_later_payment boolean'
      || ') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS %L',
    v_source
  );
END;
$patch_automatic_recall_fee_state$;

REVOKE ALL ON FUNCTION public.reverse_reprocessed_cycle_redirect_for_correction(
  uuid, text, uuid, text, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_reprocessed_cycle_redirect_for_correction(
  uuid, text, uuid, text, boolean
) TO authenticated;

COMMIT;
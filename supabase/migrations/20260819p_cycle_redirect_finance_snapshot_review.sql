-- =============================================================================
-- Cycle Close Redirect — Finance review for incomplete legacy fee snapshots
-- =============================================================================
-- Legacy Redirect actions created before the immutable fee-snapshot fields can
-- be complete have no safe automated correction path. This migration records a
-- separate, immutable Finance attestation; it never rewrites the legacy action.
-- The reprocessed-payment reversal may use the attestation only when every
-- existing journal, advance, fee, and provenance guard still passes.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.cycle_redirect_fee_snapshot_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL UNIQUE
    REFERENCES public.cycle_exception_actions(id),
  advance_id uuid NOT NULL REFERENCES public.down_payment_requests(id),
  original_journal_entry_id uuid NOT NULL REFERENCES public.acct_journal_entries(id),
  fee_site_entry_id uuid NOT NULL REFERENCES public.mmp_site_entries(id),
  gross_fee numeric(18,2) NOT NULL CHECK (gross_fee > 0),
  prior_settled_amount numeric(18,2) NOT NULL CHECK (prior_settled_amount >= 0),
  settled_amount numeric(18,2) NOT NULL CHECK (settled_amount > 0),
  remaining_amount numeric(18,2) NOT NULL CHECK (remaining_amount >= 0),
  fee_status text NOT NULL CHECK (fee_status = 'paid'),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL CHECK (length(trim(reason)) >= 10),
  idempotency_key text NOT NULL UNIQUE,
  reviewed_by uuid NOT NULL REFERENCES public.profiles(id),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cycle_redirect_fee_snapshot_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cycle_redirect_fee_snapshot_reviews_read
  ON public.cycle_redirect_fee_snapshot_reviews;
CREATE POLICY cycle_redirect_fee_snapshot_reviews_read
  ON public.cycle_redirect_fee_snapshot_reviews
  FOR SELECT TO authenticated
  USING (public.is_cycle_redirect_correction_authorizer(auth.uid()));
GRANT SELECT ON public.cycle_redirect_fee_snapshot_reviews TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_cycle_redirect_fee_snapshot_review_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Cycle Redirect Finance snapshot reviews are immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_cycle_redirect_fee_snapshot_reviews_immutable
  ON public.cycle_redirect_fee_snapshot_reviews;
CREATE TRIGGER trg_cycle_redirect_fee_snapshot_reviews_immutable
BEFORE UPDATE OR DELETE ON public.cycle_redirect_fee_snapshot_reviews
FOR EACH ROW EXECUTE FUNCTION public.prevent_cycle_redirect_fee_snapshot_review_mutation();

CREATE OR REPLACE FUNCTION public.review_legacy_redirect_fee_snapshot(
  p_action_id uuid,
  p_gross_fee numeric,
  p_prior_settled_amount numeric,
  p_settled_amount numeric,
  p_remaining_amount numeric,
  p_reason text,
  p_confirm_review boolean,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_action public.cycle_exception_actions%ROWTYPE;
  v_advance public.down_payment_requests%ROWTYPE;
  v_source public.mmp_site_entries%ROWTYPE;
  v_target public.mmp_site_entries%ROWTYPE;
  v_journal public.acct_journal_entries%ROWTYPE;
  v_existing public.cycle_redirect_fee_snapshot_reviews%ROWTYPE;
  v_journal_dr numeric;
  v_journal_cr numeric;
  v_current_gross numeric;
  v_bridge_count bigint;
  v_payment_refs jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication is required.');
  END IF;
  IF NOT public.is_cycle_redirect_correction_authorizer(v_actor_id) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Only Super Admin, Finance, or Accountant users may review a Redirect snapshot.'
    );
  END IF;
  IF p_confirm_review IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Confirm the Finance snapshot review before saving it.'
    );
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'A Finance review reason of at least 10 characters is required.'
    );
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 12 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A valid idempotency key is required.');
  END IF;

  SELECT * INTO v_action
  FROM public.cycle_exception_actions
  WHERE id = p_action_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cycle exception action was not found.');
  END IF;

  SELECT * INTO v_existing
  FROM public.cycle_redirect_fee_snapshot_reviews
  WHERE action_id = v_action.id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.idempotency_key = trim(p_idempotency_key) THEN
      RETURN jsonb_build_object(
        'ok', true,
        'already_reviewed', true,
        'review_id', v_existing.id,
        'reviewed_at', v_existing.reviewed_at
      );
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This Redirect already has an immutable Finance snapshot review.'
    );
  END IF;

  IF v_action.decision <> 'redirect' OR NOT coalesce(v_action.executed, false)
     OR v_action.correction_status IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Only an uncorrected executed Redirect can receive a Finance snapshot review.'
    );
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cycle_exception_action_allocations allocation
    WHERE allocation.action_id = v_action.id
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Redirects using the normalized allocation ledger are not eligible for this legacy review.'
    );
  END IF;
  IF v_action.advance_id IS NULL OR v_action.mmp_site_entry_id IS NULL
     OR v_action.gl_journal_entry_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The legacy Redirect is missing its advance, source site, or original journal reference.'
    );
  END IF;
  IF v_action.redirect_fee_gross_amount IS NOT NULL
     AND v_action.redirect_fee_prior_settled_amount IS NOT NULL
     AND v_action.redirect_fee_settled_amount IS NOT NULL
     AND v_action.redirect_fee_remaining_amount IS NOT NULL
     AND v_action.redirect_fee_status IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This Redirect already has an immutable fee snapshot and does not need manual review.'
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cea_advance:' || v_action.advance_id::text));

  SELECT * INTO v_advance
  FROM public.down_payment_requests
  WHERE id = v_action.advance_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The original advance no longer exists.');
  END IF;
  IF v_action.advance_status NOT IN ('paid', 'fully_paid')
     OR round(coalesce(v_action.advance_amount, 0), 2) <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The original fully paid advance amount was not recorded safely on this action.'
    );
  END IF;

  SELECT * INTO v_source
  FROM public.mmp_site_entries
  WHERE id = v_action.mmp_site_entry_id
    AND mmp_file_id = v_action.mmp_file_id
  FOR UPDATE;
  IF NOT FOUND OR NOT (
    coalesce(v_source.not_covered_flag, false)
    OR lower(coalesce(v_source.status, '')) = 'not_covered'
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The original source site must still be marked not covered.'
    );
  END IF;

  IF v_action.redirect_fee_site_entry_id IS NOT NULL
     AND v_action.redirect_fee_site_entry_id <> v_action.mmp_site_entry_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This Redirect settled a separate target site and is not eligible for the legacy Finance review.'
    );
  END IF;
  SELECT * INTO v_target
  FROM public.mmp_site_entries
  WHERE id = v_action.mmp_site_entry_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The fee site affected by the Redirect no longer exists.');
  END IF;

  SELECT * INTO v_journal
  FROM public.acct_journal_entries
  WHERE id = v_action.gl_journal_entry_id
  FOR UPDATE;
  IF NOT FOUND OR v_journal.status <> 'posted' OR v_journal.reversed_by_entry_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The original Redirect journal must be an unreversed posted journal.'
    );
  END IF;

  IF p_gross_fee IS NULL OR p_prior_settled_amount IS NULL
     OR p_settled_amount IS NULL OR p_remaining_amount IS NULL
     OR p_gross_fee <= 0 OR p_prior_settled_amount <> 0
     OR p_settled_amount <> p_gross_fee OR p_remaining_amount <> 0
     OR abs(p_prior_settled_amount + p_settled_amount + p_remaining_amount - p_gross_fee) > 0.005 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The reviewed snapshot must be a complete legacy settlement: gross fee equals the Redirect settlement, with zero prior settlement and zero remaining fee.'
    );
  END IF;

  SELECT
    coalesce(sum(functional_amount) FILTER (WHERE debit_credit = 'DR'), 0),
    coalesce(sum(functional_amount) FILTER (WHERE debit_credit = 'CR'), 0)
  INTO v_journal_dr, v_journal_cr
  FROM public.acct_journal_lines
  WHERE entry_id = v_journal.id;
  IF v_journal_dr <= 0 OR abs(v_journal_dr - v_journal_cr) > 0.005
     OR abs(v_journal_dr - round(p_settled_amount, 2)) > 0.005
     OR abs(round(coalesce(v_action.advance_amount, 0), 2) - round(p_settled_amount, 2)) > 0.005 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The reviewed settlement amount does not exactly match the original balanced Redirect journal and advance.'
    );
  END IF;

  v_current_gross := round(
    coalesce(v_target.enumerator_fee, 0) + coalesce(v_target.transport_fee, 0), 2
  );
  SELECT count(*) INTO v_bridge_count
  FROM public.acct_gl_bridge_log bridge
  WHERE bridge.source_table = 'mmp_site_entries'
    AND bridge.source_id = v_target.id
    AND bridge.event_type = 'enumerator_fee_paid'
    AND bridge.status = 'success'
    AND bridge.journal_entry_id = v_journal.id;
  IF v_bridge_count <> 1
     OR abs(v_current_gross - round(p_gross_fee, 2)) > 0.005
     OR v_target.fee_paid_status IS DISTINCT FROM 'paid'
     OR v_target.fee_paid_at IS DISTINCT FROM v_action.executed_at
     OR v_target.fee_paid_by IS DISTINCT FROM v_action.executed_by
     OR abs(coalesce(v_target.fee_paid_amount, 0) - round(p_gross_fee, 2)) > 0.005
     OR abs(coalesce(v_target.fee_cash_paid_amount, 0) - round(p_gross_fee, 2)) > 0.005
     OR abs(coalesce(v_target.fee_advance_offset_amount, 0)) > 0.005
     OR abs(coalesce(v_target.fee_unallocated_amount, 0)) > 0.005
     OR nullif(trim(coalesce(v_target.fee_payment_method, '')), '') IS NOT NULL
     OR nullif(trim(coalesce(v_target.fee_payment_notes, '')), '') IS NOT NULL
     OR v_target.fee_receipt_url IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The current fee record does not prove the reviewed legacy Redirect snapshot.'
    );
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.acct_gl_bridge_log bridge
    WHERE bridge.source_table = 'mmp_site_entries'
      AND bridge.source_id = v_target.id
      AND bridge.event_type = 'enumerator_fee_paid'
      AND bridge.status = 'success'
      AND bridge.journal_entry_id IS DISTINCT FROM v_journal.id
      AND bridge.created_at > coalesce(v_action.executed_at, v_action.created_at)
  ) OR EXISTS (
    SELECT 1 FROM public.cycle_exception_action_allocations allocation
    WHERE allocation.target_site_id = v_target.id
      AND allocation.created_at > coalesce(v_action.executed_at, v_action.created_at)
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Later fee-settlement activity exists for the affected site and cannot be overridden.'
    );
  END IF;

  v_payment_refs := coalesce(v_action.source_payment_references, '[]'::jsonb);
  INSERT INTO public.cycle_redirect_fee_snapshot_reviews (
    action_id, advance_id, original_journal_entry_id, fee_site_entry_id,
    gross_fee, prior_settled_amount, settled_amount, remaining_amount, fee_status,
    evidence, reason, idempotency_key, reviewed_by
  ) VALUES (
    v_action.id, v_action.advance_id, v_journal.id, v_target.id,
    round(p_gross_fee, 2), round(p_prior_settled_amount, 2), round(p_settled_amount, 2),
    round(p_remaining_amount, 2), 'paid',
    jsonb_build_object(
      'action_id', v_action.id,
      'advance_id', v_action.advance_id,
      'original_journal_entry_id', v_journal.id,
      'journal_debit_total', v_journal_dr,
      'journal_credit_total', v_journal_cr,
      'fee_site_entry_id', v_target.id,
      'source_payment_references', v_payment_refs
    ),
    trim(p_reason), trim(p_idempotency_key), v_actor_id
  )
  RETURNING id, reviewed_at INTO v_existing.id, v_existing.reviewed_at;

  RETURN jsonb_build_object(
    'ok', true,
    'review_id', v_existing.id,
    'reviewed_at', v_existing.reviewed_at,
    'gross_fee', round(p_gross_fee, 2),
    'settled_amount', round(p_settled_amount, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_legacy_redirect_fee_snapshot(
  uuid, numeric, numeric, numeric, numeric, text, boolean, text
) TO authenticated;

-- Replace only the established snapshot gate in the existing high-risk RPC.
-- Refuse to alter unknown function source rather than silently weakening a
-- future revision of the reversal path.
DO $replace_reprocessed_snapshot_gate$
DECLARE
  v_source text;
  v_old constant text := $old$
  -- ── Reuse the immutable Redirect fee snapshot (historical RPC contract) ────
  IF v_action.redirect_fee_gross_amount IS NULL
     OR v_action.redirect_fee_prior_settled_amount IS NULL
     OR v_action.redirect_fee_settled_amount IS NULL
     OR v_action.redirect_fee_remaining_amount IS NULL
     OR v_action.redirect_fee_status IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The immutable Redirect fee snapshot is incomplete. Finance must review it manually.'
    );
  END IF;

  v_gross_fee := round(v_action.redirect_fee_gross_amount, 2);
  v_snapshot_prior := round(v_action.redirect_fee_prior_settled_amount, 2);
  v_settled_amount := round(v_action.redirect_fee_settled_amount, 2);
  v_snapshot_remaining := round(v_action.redirect_fee_remaining_amount, 2);

  IF v_gross_fee <= 0
     OR v_snapshot_prior <> 0
     OR v_settled_amount <> v_gross_fee
     OR v_snapshot_remaining <> 0
     OR v_action.redirect_fee_status <> 'paid'
     OR abs(
       v_snapshot_prior + v_settled_amount + v_snapshot_remaining - v_gross_fee
     ) > 0.005 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The immutable Redirect fee snapshot is not an exact full legacy settlement. Finance must review it manually.'
    );
  END IF;
$old$;
  v_new constant text := $new$
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
$new$;
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
  IF strpos(v_source, 'cycle_redirect_fee_snapshot_reviews review') > 0 THEN
    RETURN;
  END IF;
  IF strpos(v_source, v_old) = 0 THEN
    RAISE EXCEPTION 'reprocessed Redirect snapshot gate has drifted; review before applying Finance review migration';
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
$replace_reprocessed_snapshot_gate$;

COMMENT ON TABLE public.cycle_redirect_fee_snapshot_reviews IS
  'Immutable Finance attestation for a legacy Redirect whose original fee snapshot was absent; never rewrites cycle_exception_actions.';

COMMIT;
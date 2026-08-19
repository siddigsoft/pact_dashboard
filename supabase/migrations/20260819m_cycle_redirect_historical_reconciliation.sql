-- Reconcile an incorrect legacy Redirect after its advance was intentionally
-- restored and reprocessed. This path reverses only the original Redirect
-- accounting; it never changes the current advance status, site, or metadata.

BEGIN;

ALTER TABLE public.cycle_exception_actions
  DROP CONSTRAINT IF EXISTS cycle_exception_actions_correction_status_check;
ALTER TABLE public.cycle_exception_actions
  ADD CONSTRAINT cycle_exception_actions_correction_status_check
  CHECK (
    correction_status IS NULL
    OR correction_status IN ('reopened_for_correction', 'historically_reconciled')
  );

CREATE INDEX IF NOT EXISTS idx_cea_historical_reconciliations
  ON public.cycle_exception_actions (mmp_file_id, corrected_at DESC)
  WHERE correction_status = 'historically_reconciled';

-- acct_post_reversal predates the case-safe financial-role aliases used by
-- Cycle Close. Replace only its known legacy authorization block and fail the
-- migration if the posting engine has drifted, rather than silently widening
-- access around an unknown implementation.
DO $align_reversal_authorization$
DECLARE
  v_source text;
  v_legacy_auth_block constant text :=
$block$  SELECT role INTO v_user_role FROM public.profiles WHERE id = v_user_id;
  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: caller has no profile row';
  END IF;
  IF v_user_role NOT IN ('super_admin','finance','accountant') THEN
    RAISE EXCEPTION 'AUTHORIZATION_FAILED: role % may not post reversals', v_user_role;
  END IF;$block$;
  v_case_safe_auth_block constant text :=
$block$  IF NOT public.is_cycle_redirect_correction_authorizer(v_user_id) THEN
    RAISE EXCEPTION 'AUTHORIZATION_FAILED: caller may not post reversals';
  END IF;$block$;
BEGIN
  SELECT procedure.prosrc
  INTO v_source
  FROM pg_proc procedure
  WHERE procedure.oid = to_regprocedure('public.acct_post_reversal(uuid,jsonb,text)');

  IF v_source IS NULL THEN
    RAISE EXCEPTION
      'acct_post_reversal(uuid,jsonb,text) is missing; apply the accounting reversal migration first';
  END IF;

  IF strpos(v_source, v_legacy_auth_block) = 0 THEN
    IF strpos(v_source, v_case_safe_auth_block) > 0 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION
      'acct_post_reversal authorization block has changed; review role alignment before applying this migration';
  END IF;

  v_source := replace(v_source, v_legacy_auth_block, v_case_safe_auth_block);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.acct_post_reversal('
      || 'p_original_entry_id uuid, p_payload jsonb, p_idempotency_key text'
      || ') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER '
      || 'SET search_path = public AS %L',
    v_source
  );
END;
$align_reversal_authorization$;

CREATE OR REPLACE FUNCTION public.reconcile_reprocessed_cycle_redirect(
  p_action_id uuid,
  p_reason text,
  p_period_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_now timestamptz := clock_timestamp();
  v_action public.cycle_exception_actions%ROWTYPE;
  v_advance public.down_payment_requests%ROWTYPE;
  v_source public.mmp_site_entries%ROWTYPE;
  v_target public.mmp_site_entries%ROWTYPE;
  v_mmp public.mmp_files%ROWTYPE;
  v_journal public.acct_journal_entries%ROWTYPE;
  v_period public.acct_fiscal_periods%ROWTYPE;
  v_target_id uuid;
  v_reversal_payload jsonb;
  v_reversal_result uuid;
  v_reversal_idempotency_key text;
  v_reversal_journal_id uuid;
  v_settled_amount numeric;
  v_gross_fee numeric;
  v_bridge_log_id uuid;
  v_bridge_log_count bigint;
  v_has_later_restore boolean;
  v_preserved_status text;
  v_preserved_site_id uuid;
  v_snapshot_prior numeric;
  v_snapshot_remaining numeric;
  v_current_gross numeric;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication is required.');
  END IF;

  IF NOT public.is_cycle_redirect_correction_authorizer(v_actor_id) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Only Super Admin, Finance, or Accountant users may reconcile a historical Redirect.'
    );
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'A reconciliation reason of at least 10 characters is required.'
    );
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 12 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A valid idempotency key is required.');
  END IF;

  v_reversal_idempotency_key := 'cycle-redirect-historical-reconciliation:'
    || p_action_id::text || ':' || trim(p_idempotency_key);

  SELECT *
  INTO v_action
  FROM public.cycle_exception_actions
  WHERE id = p_action_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cycle exception action was not found.');
  END IF;

  IF v_action.correction_status IS NOT NULL THEN
    IF v_action.correction_status = 'historically_reconciled'
       AND v_action.correction_idempotency_key IS NOT DISTINCT FROM trim(p_idempotency_key) THEN
      RETURN jsonb_build_object(
        'ok', true,
        'already_corrected', true,
        'correction_mode', 'historical_accounting_only',
        'action_id', v_action.id,
        'advance_id', v_action.advance_id,
        'reversal_journal_entry_id', v_action.correction_reversal_journal_id,
        'preserved_advance', true,
        'corrected_at', v_action.corrected_at
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This Redirect already has a different completed correction.'
    );
  END IF;

  IF v_action.decision <> 'redirect' OR NOT coalesce(v_action.executed, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Only an executed Redirect action can be historically reconciled.'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cycle_exception_action_allocations allocation
    WHERE allocation.action_id = v_action.id
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This Redirect uses the normalized allocation ledger and is not a legacy reconciliation candidate.'
    );
  END IF;

  IF v_action.advance_id IS NULL OR v_action.mmp_site_entry_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The legacy action is missing its source advance or source site reference.'
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cea_advance:' || v_action.advance_id::text));

  SELECT *
  INTO v_mmp
  FROM public.mmp_files
  WHERE id = v_action.mmp_file_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The source cycle no longer exists.');
  END IF;

  IF lower(coalesce(v_mmp.cycle_status, '')) = 'closed'
     OR lower(coalesce(v_mmp.status, '')) = 'closed' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Reopen the cycle before reconciling its historical Redirect.'
    );
  END IF;

  SELECT *
  INTO v_source
  FROM public.mmp_site_entries
  WHERE id = v_action.mmp_site_entry_id
    AND mmp_file_id = v_action.mmp_file_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The original source site no longer exists.');
  END IF;

  IF NOT (
    coalesce(v_source.not_covered_flag, false)
    OR lower(coalesce(v_source.status, '')) = 'not_covered'
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The source site must still be marked not covered before this Redirect can be reconciled.'
    );
  END IF;

  SELECT *
  INTO v_advance
  FROM public.down_payment_requests
  WHERE id = v_action.advance_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The source advance no longer exists.');
  END IF;

  IF coalesce(v_advance.metadata->>'exception_action_id', '') <> v_action.id::text THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The current advance no longer carries the original Redirect audit marker.'
    );
  END IF;

  IF v_advance.status NOT IN ('paid', 'fully_paid', 'partially_paid') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Historical accounting-only reconciliation requires a currently paid reprocessed advance.'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(v_advance.metadata->'audit_log') = 'array'
          THEN v_advance.metadata->'audit_log'
        ELSE '[]'::jsonb
      END
    ) audit_event
    WHERE lower(coalesce(audit_event->>'action', '')) = 'restored'
      AND lower(coalesce(audit_event->>'previousValue', '')) = 'cancelled'
      AND regexp_replace(
        lower(coalesce(audit_event->>'newValue', '')),
        '[^a-z0-9]', '', 'g'
      ) IN ('pendingadmin', 'pending', 'approved')
      AND CASE
        WHEN coalesce(audit_event->>'timestamp', '') ~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
        THEN (audit_event->>'timestamp')::timestamptz
          > coalesce(v_action.executed_at, v_action.created_at)
        ELSE false
      END
  )
  INTO v_has_later_restore;

  IF NOT v_has_later_restore THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The advance has no proven post-Redirect cancelled-to-pending restoration audit. Finance must review it manually.'
    );
  END IF;

  v_preserved_status := v_advance.status;
  v_preserved_site_id := v_advance.mmp_site_entry_id;

  IF v_action.advance_status NOT IN ('paid', 'fully_paid', 'partially_paid') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The original paid advance status was not recorded safely on this action.'
    );
  END IF;

  IF v_action.gl_journal_entry_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The original Redirect has no GL journal reference and cannot be reconciled automatically.'
    );
  END IF;

  SELECT *
  INTO v_journal
  FROM public.acct_journal_entries
  WHERE id = v_action.gl_journal_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The original Redirect journal no longer exists.');
  END IF;

  IF v_journal.status <> 'posted' OR v_journal.reversed_by_entry_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The original Redirect journal is not an unreversed posted journal.'
    );
  END IF;

  SELECT *
  INTO v_period
  FROM public.acct_fiscal_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_period.status NOT IN ('open', 'soft_closed')
     OR current_date NOT BETWEEN v_period.start_date AND v_period.end_date THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Select an open or soft-closed fiscal period that contains today.'
    );
  END IF;

  IF v_action.redirect_fee_site_entry_id IS NOT NULL
     AND v_action.redirect_fee_site_entry_id <> v_action.mmp_site_entry_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This Redirect settled a separate target site and is not eligible for legacy historical reconciliation.'
    );
  END IF;
  v_target_id := v_action.mmp_site_entry_id;

  SELECT *
  INTO v_target
  FROM public.mmp_site_entries
  WHERE id = v_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The fee site affected by the Redirect no longer exists.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.acct_gl_bridge_log bridge
    WHERE bridge.source_table = 'mmp_site_entries'
      AND bridge.source_id = v_target_id
      AND bridge.event_type = 'enumerator_fee_paid'
      AND bridge.status = 'success'
      AND bridge.journal_entry_id IS DISTINCT FROM v_journal.id
      AND bridge.created_at > coalesce(v_action.executed_at, v_action.created_at)
  ) OR EXISTS (
    SELECT 1
    FROM public.cycle_exception_action_allocations allocation
    WHERE allocation.target_site_id = v_target_id
      AND allocation.created_at > coalesce(v_action.executed_at, v_action.created_at)
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Later fee-settlement activity exists for the affected site. Finance must review it manually before historical reconciliation.'
    );
  END IF;

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

  SELECT jsonb_agg(
    jsonb_build_object(
      'line_no', line.line_no,
      'account_id', line.account_id,
      'fund_id', line.fund_id,
      'function', coalesce(line.function, 'none'),
      'project_id', line.project_id,
      'grant_id', line.grant_id,
      'cost_center_id', line.cost_center_id,
      'partner_id', line.partner_id,
      'debit_credit', CASE line.debit_credit WHEN 'DR' THEN 'CR' ELSE 'DR' END,
      'original_amount', line.original_amount,
      'original_currency', line.original_currency,
      'functional_amount', line.functional_amount,
      'functional_currency', line.functional_currency,
      'fx_rate', line.fx_rate,
      'description', 'Historical Redirect reconciliation: ' || trim(p_reason)
    )
    ORDER BY line.line_no
  )
  INTO v_reversal_payload
  FROM public.acct_journal_lines line
  WHERE line.entry_id = v_journal.id;

  IF v_reversal_payload IS NULL OR jsonb_array_length(v_reversal_payload) < 2 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The original Redirect journal lines are missing or incomplete.'
    );
  END IF;

  v_reversal_payload := jsonb_build_object(
    'description_en', 'Historical Redirect accounting reconciliation — ' || trim(p_reason),
    'posting_date', current_date,
    'period_id', p_period_id,
    'lines', v_reversal_payload
  );

  BEGIN
    v_reversal_result := public.acct_post_reversal(
      v_journal.id,
      v_reversal_payload,
      v_reversal_idempotency_key
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'GL reversal failed: ' || SQLERRM);
  END;

  v_reversal_journal_id := v_reversal_result;
  IF v_reversal_journal_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The GL reversal did not return a journal ID.');
  END IF;

  INSERT INTO public.acct_gl_bridge_reversal_links (
    bridge_log_id,
    original_journal_entry_id,
    reversal_journal_entry_id,
    correction_action_id,
    reason,
    reversed_by,
    reversed_at
  ) VALUES (
    v_bridge_log_id,
    v_journal.id,
    v_reversal_journal_id,
    v_action.id,
    trim(p_reason),
    v_actor_id,
    v_now
  );

  UPDATE public.mmp_site_entries
  SET fee_paid_status = 'unpaid',
      fee_paid_amount = 0,
      fee_cash_paid_amount = 0,
      fee_advance_offset_amount = 0,
      fee_unallocated_amount = 0,
      fee_paid_at = NULL,
      fee_paid_by = NULL,
      fee_payment_method = NULL,
      fee_payment_notes = 'Historical Redirect reconciled on ' || v_now::date || ': ' || trim(p_reason)
  WHERE id = v_target_id;

  SELECT coalesce(full_name, email, id::text)
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor_id;

  UPDATE public.cycle_exception_actions
  SET correction_status = 'historically_reconciled',
      corrected_at = v_now,
      corrected_by = v_actor_id,
      corrected_by_name = v_actor_name,
      correction_reason = trim(p_reason),
      correction_reversal_journal_id = v_reversal_journal_id,
      correction_replacement_action_id = NULL,
      correction_idempotency_key = trim(p_idempotency_key),
      action_payload = coalesce(action_payload, '{}'::jsonb) || jsonb_build_object(
        'correction', jsonb_build_object(
          'status', 'historically_reconciled',
          'mode', 'historical_accounting_only',
          'corrected_at', v_now,
          'corrected_by', v_actor_id,
          'reason', trim(p_reason),
          'original_journal_entry_id', v_journal.id,
          'reversal_journal_entry_id', v_reversal_journal_id,
          'preserved_advance_id', v_advance.id,
          'preserved_advance_status', v_preserved_status,
          'preserved_advance_site_id', v_preserved_site_id
        )
      )
  WHERE id = v_action.id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.down_payment_requests current_advance
    WHERE current_advance.id = v_advance.id
      AND current_advance.status IS NOT DISTINCT FROM v_preserved_status
      AND current_advance.mmp_site_entry_id IS NOT DISTINCT FROM v_preserved_site_id
      AND current_advance.metadata IS NOT DISTINCT FROM v_advance.metadata
  ) THEN
    RAISE EXCEPTION 'PRESERVED_ADVANCE_CHANGED: historical reconciliation altered the reprocessed advance';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'correction_mode', 'historical_accounting_only',
    'action_id', v_action.id,
    'advance_id', v_action.advance_id,
    'source_site_id', v_action.mmp_site_entry_id,
    'reversal_journal_entry_id', v_reversal_journal_id,
    'replacement_action_id', NULL,
    'preserved_advance', true,
    'preserved_advance_status', v_preserved_status,
    'preserved_advance_site_id', v_preserved_site_id,
    'corrected_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_reprocessed_cycle_redirect(uuid, text, uuid, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_reprocessed_cycle_redirect(uuid, text, uuid, text)
  TO authenticated;

-- A historically reconciled Redirect is no longer an authoritative fee offset.
-- Exclude it from both the live payment trigger's Redirect detection and its
-- offset total so a later legitimate fee payment posts its full cash journal.
CREATE OR REPLACE FUNCTION public.acct_trig_mmp_site_entries_fee_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gross_fee numeric(18,2);
  v_cash_amount numeric(18,2);
  v_advance_offset numeric(18,2);
  v_authoritative_offset numeric(18,2);
  v_expected_cash numeric(18,2);
  v_cash_account text;
  v_country_id uuid;
  v_entry_id uuid;
  v_lines jsonb;
  v_has_redirect boolean;
BEGIN
  IF NEW.fee_paid_status IS DISTINCT FROM 'paid' OR OLD.fee_paid_status = 'paid' THEN
    RETURN NEW;
  END IF;
  IF public.has_active_enumerator_fee_bridge(NEW.id) THEN
    RETURN NEW;
  END IF;

  v_gross_fee := round(COALESCE(NEW.enumerator_fee, 0) + COALESCE(NEW.transport_fee, 0), 2);
  v_advance_offset := COALESCE(NEW.fee_advance_offset_amount, 0);
  v_cash_account := CASE
    WHEN lower(replace(COALESCE(NEW.fee_payment_method, ''), ' ', '_')) = 'bank_transfer'
      THEN '1020'
    ELSE '1010'
  END;
  SELECT country_id INTO v_country_id FROM public.mmp_files WHERE id = NEW.mmp_file_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.cycle_exception_actions action
    WHERE action.redirect_fee_site_entry_id = NEW.id
      AND action.decision = 'redirect'
      AND action.executed = true
      AND coalesce(action.correction_status, '') NOT IN (
        'reopened_for_correction',
        'historically_reconciled'
      )
    UNION ALL
    SELECT 1
    FROM public.cycle_exception_action_allocations allocation
    JOIN public.cycle_exception_actions action ON action.id = allocation.action_id
    WHERE allocation.target_site_id = NEW.id
      AND action.decision = 'redirect'
      AND action.executed = true
      AND coalesce(action.correction_status, '') NOT IN (
        'reopened_for_correction',
        'historically_reconciled'
      )
  ) INTO v_has_redirect;

  IF v_has_redirect THEN
    SELECT COALESCE(sum(allocation.amount), 0)
    INTO v_authoritative_offset
    FROM public.cycle_exception_action_allocations allocation
    JOIN public.cycle_exception_actions action ON action.id = allocation.action_id
    WHERE allocation.target_site_id = NEW.id
      AND action.decision = 'redirect'
      AND action.executed = true
      AND coalesce(action.correction_status, '') NOT IN (
        'reopened_for_correction',
        'historically_reconciled'
      );

    SELECT v_authoritative_offset + COALESCE(sum(
      COALESCE(action.redirect_fee_settled_amount, action.decision_amount, action.advance_amount)
    ), 0)
    INTO v_authoritative_offset
    FROM public.cycle_exception_actions action
    WHERE action.redirect_fee_site_entry_id = NEW.id
      AND action.decision = 'redirect'
      AND action.executed = true
      AND coalesce(action.correction_status, '') NOT IN (
        'reopened_for_correction',
        'historically_reconciled'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.cycle_exception_action_allocations allocation
        WHERE allocation.action_id = action.id
      );

    v_authoritative_offset := round(COALESCE(v_authoritative_offset, 0), 2);
    v_expected_cash := round(GREATEST(v_gross_fee - v_authoritative_offset, 0), 2);
    v_cash_amount := COALESCE(NEW.fee_cash_paid_amount, v_expected_cash);

    IF v_authoritative_offset < 0 OR v_authoritative_offset > v_gross_fee
       OR COALESCE(NEW.fee_paid_amount, 0) <> v_gross_fee
       OR COALESCE(NEW.fee_advance_offset_amount, 0) <> v_authoritative_offset
       OR v_cash_amount <> round(v_cash_amount, 2)
       OR v_cash_amount <> v_expected_cash THEN
      RAISE EXCEPTION
        'Redirect fee completion components must equal the gross fee (gross %, authoritative advance offset %, required cash %)',
        v_gross_fee, v_authoritative_offset, v_expected_cash;
    END IF;
    IF v_cash_amount <= 0 THEN RETURN NEW; END IF;
    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_code', '5200', 'debit_credit', 'DR', 'amount', v_cash_amount,
        'currency', 'SDG',
        'description', 'Cash completion after advance offset — '
          || COALESCE(NEW.site_name, 'Site') || '; cash SDG ' || v_cash_amount
          || '; prior advance offset SDG ' || v_advance_offset,
        'function', 'program'
      ),
      jsonb_build_object(
        'account_code', v_cash_account, 'debit_credit', 'CR', 'amount', v_cash_amount,
        'currency', 'SDG',
        'description', 'Cash completion after advance offset — '
          || COALESCE(NEW.site_name, 'Site') || '; cash SDG ' || v_cash_amount,
        'function', 'none'
      )
    );
  ELSE
    v_cash_amount := COALESCE(NEW.fee_cash_paid_amount, v_gross_fee);
    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_code', '5200', 'debit_credit', 'DR', 'amount', v_gross_fee,
        'currency', 'SDG',
        'description', 'Enumerator Fee — ' || COALESCE(NEW.site_name, 'Site'),
        'function', 'program'
      ),
      jsonb_build_object(
        'account_code', v_cash_account, 'debit_credit', 'CR', 'amount', v_cash_amount,
        'currency', 'SDG',
        'description', 'Enumerator fee cash component — ' || COALESCE(NEW.site_name, 'Site'),
        'function', 'none'
      ),
      jsonb_build_object(
        'account_code', '1510', 'debit_credit', 'CR', 'amount', v_advance_offset,
        'currency', 'SDG',
        'description', 'Transport advance offset — ' || COALESCE(NEW.site_name, 'Site'),
        'function', 'program'
      )
    );
  END IF;

  BEGIN
    v_entry_id := public.acct_bridge_post_journal(
      'mmp_site_entries', NEW.id, 'enumerator_fee_paid',
      COALESCE(NEW.fee_paid_at::date, current_date),
      'Enumerator Fee Paid: ' || COALESCE(NEW.site_name, NEW.id::text),
      'أجر معدد مدفوع: ' || COALESCE(NEW.site_name, NEW.id::text),
      v_lines, NEW.fee_paid_by, v_country_id
    );
    INSERT INTO public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, journal_entry_id)
    VALUES ('mmp_site_entries', NEW.id, 'enumerator_fee_paid', 'success', v_entry_id);
  EXCEPTION WHEN OTHERS THEN
    IF v_has_redirect THEN
      RAISE;
    END IF;
    INSERT INTO public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, error_message)
    VALUES ('mmp_site_entries', NEW.id, 'enumerator_fee_paid', 'error', SQLERRM);
  END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE VIEW public.cycle_redirect_correction_history AS
SELECT
  action.id AS action_id,
  action.mmp_file_id,
  action.mmp_site_entry_id,
  action.advance_id,
  action.site_name,
  action.enumerator_id,
  action.enumerator_name,
  action.advance_amount,
  action.advance_status,
  action.executed_at,
  action.executed_by,
  action.gl_journal_entry_id AS original_journal_entry_id,
  action.correction_status,
  action.corrected_at,
  action.corrected_by,
  action.corrected_by_name,
  action.correction_reason,
  action.correction_reversal_journal_id AS reversal_journal_entry_id,
  action.correction_replacement_action_id AS replacement_action_id
FROM public.cycle_exception_actions action
WHERE action.decision = 'redirect'
  AND action.correction_status IN ('reopened_for_correction', 'historically_reconciled');

GRANT SELECT ON public.cycle_redirect_correction_history TO authenticated;

COMMIT;
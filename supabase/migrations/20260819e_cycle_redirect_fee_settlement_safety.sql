-- =============================================================================
-- Cycle Close Redirect: eligible fee settlement and overpayment safety
--
-- A transport advance on a not-covered site can only be redirected to a
-- different, covered site. The existing cash payment is retained as the source
-- payment; this migration records the amount as an advance offset against the
-- target site's fee. A fee is partial until cash + approved offsets equal its
-- configured gross fee.
-- =============================================================================

BEGIN;

-- Keep the settlement components separately. fee_paid_amount is the total
-- settled fee amount, while the two component fields make cash and advance
-- offsets auditable and prevent a large advance from over-crediting fee expense.
ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS fee_cash_paid_amount numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_advance_offset_amount numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_unallocated_amount numeric(18,2) NOT NULL DEFAULT 0;

ALTER TABLE public.cycle_exception_actions
  ADD COLUMN IF NOT EXISTS redirect_fee_gross_amount numeric(18,2),
  ADD COLUMN IF NOT EXISTS redirect_fee_prior_settled_amount numeric(18,2),
  ADD COLUMN IF NOT EXISTS redirect_fee_settled_amount numeric(18,2),
  ADD COLUMN IF NOT EXISTS redirect_fee_remaining_amount numeric(18,2),
  ADD COLUMN IF NOT EXISTS redirect_fee_status text,
  ADD COLUMN IF NOT EXISTS source_payment_references jsonb NOT NULL DEFAULT '[]'::jsonb;

-- The original fee-status check only allowed unpaid / paid. Allow an auditable
-- partial state. The dynamic lookup avoids assuming the generated check name.
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.mmp_site_entries'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%fee_paid_status%'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.mmp_site_entries DROP CONSTRAINT %I', v_constraint);
  END IF;

  ALTER TABLE public.mmp_site_entries
    ADD CONSTRAINT mmp_site_entries_fee_paid_status_check
    CHECK (fee_paid_status IN ('unpaid', 'partially_paid', 'paid'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Normalise existing fully-paid rows into the component ledger. Existing rows
-- predate the components, so their configured gross fee is authoritative.
UPDATE public.mmp_site_entries AS site
SET
  fee_advance_offset_amount = CASE
    WHEN site.fee_payment_method = 'advance_offset'
      THEN COALESCE(site.fee_paid_amount, COALESCE(site.enumerator_fee, 0) + COALESCE(site.transport_fee, 0))
    ELSE LEAST(
      COALESCE(site.enumerator_fee, 0) + COALESCE(site.transport_fee, 0),
      COALESCE((
        SELECT MAX(COALESCE(request.total_paid_amount, request.requested_amount, 0))
        FROM public.down_payment_requests AS request
        WHERE request.mmp_site_entry_id = site.id
          AND request.status IN ('paid', 'fully_paid', 'partially_paid')
      ), 0)
    )
  END,
  fee_cash_paid_amount = CASE
    WHEN site.fee_payment_method = 'advance_offset' THEN 0
    ELSE GREATEST(
      COALESCE(site.enumerator_fee, 0) + COALESCE(site.transport_fee, 0)
      - LEAST(
        COALESCE(site.enumerator_fee, 0) + COALESCE(site.transport_fee, 0),
        COALESCE((
          SELECT MAX(COALESCE(request.total_paid_amount, request.requested_amount, 0))
          FROM public.down_payment_requests AS request
          WHERE request.mmp_site_entry_id = site.id
            AND request.status IN ('paid', 'fully_paid', 'partially_paid')
        ), 0)
      ),
      0
    )
  END,
  fee_paid_amount = COALESCE(site.enumerator_fee, 0) + COALESCE(site.transport_fee, 0)
WHERE site.fee_paid_status = 'paid';

-- Preserve the original implementation for non-redirect actions. A wrapper
-- below adds target-fee validation and paid-advance reassignment without
-- weakening the established Return / Write-Off / Roll / Hold controls.
DO $$
BEGIN
  IF to_regprocedure('public.execute_cycle_close_exception(uuid,uuid,uuid,text,numeric,text,uuid,uuid,text,text,date)') IS NOT NULL
     AND to_regprocedure('public.execute_cycle_close_exception_legacy(uuid,uuid,uuid,text,numeric,text,uuid,uuid,text,text,date)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.execute_cycle_close_exception(uuid,uuid,uuid,text,numeric,text,uuid,uuid,text,text,date) RENAME TO execute_cycle_close_exception_legacy';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.execute_cycle_close_exception(
  p_mmp_id             uuid,
  p_site_id            uuid,
  p_advance_id         uuid,
  p_decision           text,
  p_amount             numeric DEFAULT NULL,
  p_justification      text DEFAULT NULL,
  p_target_mmp_id      uuid DEFAULT NULL,
  p_target_site_id     uuid DEFAULT NULL,
  p_receipt_reference  text DEFAULT NULL,
  p_return_method      text DEFAULT NULL,
  p_recovery_date      date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_source_mmp record;
  v_source_site record;
  v_target_site record;
  v_advance record;
  v_action record;
  v_action_id uuid;
  v_result jsonb;
  v_paid_amount numeric(18,2);
  v_gross_fee numeric(18,2);
  v_prior_settled numeric(18,2);
  v_applied_amount numeric(18,2);
  v_remaining_fee numeric(18,2);
  v_target_status text;
  v_cross_enumerator boolean;
  v_is_manager boolean;
  v_source_refs jsonb := '[]'::jsonb;
  v_executed_at timestamptz;
BEGIN
  -- Preserve all pre-existing action semantics other than paid reassignment and
  -- redirect. The legacy implementation remains the single source of truth for
  -- every other decision.
  IF p_decision <> 'redirect' THEN
    SELECT * INTO v_advance FROM public.down_payment_requests WHERE id = p_advance_id;
    IF p_decision <> 'reassign'
       OR NOT FOUND
       OR v_advance.status NOT IN ('paid', 'fully_paid', 'partially_paid') THEN
      RETURN public.execute_cycle_close_exception_legacy(
        p_mmp_id, p_site_id, p_advance_id, p_decision, p_amount, p_justification,
        p_target_mmp_id, p_target_site_id, p_receipt_reference, p_return_method, p_recovery_date
      );
    END IF;
  END IF;

  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.is_cycle_exception_executor(v_actor_id) THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Access denied: FOM / Finance / Admin / Super Admin role required');
  END IF;
  v_is_manager := public.is_cycle_exception_manager(v_actor_id);
  SELECT COALESCE(full_name, email, id::text) INTO v_actor_name
  FROM public.profiles WHERE id = v_actor_id;

  IF p_decision = 'reassign' AND NOT v_is_manager THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Paid advance reassignment requires FOM / Admin / Super Admin authorization');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cea_advance:' || p_advance_id::text));

  SELECT * INTO v_action
  FROM public.cycle_exception_actions
  WHERE mmp_file_id = p_mmp_id AND advance_id = p_advance_id
  ORDER BY created_at DESC
  LIMIT 1;
  IF FOUND AND v_action.executed THEN
    IF v_action.decision IS DISTINCT FROM p_decision
       OR v_action.mmp_site_entry_id IS DISTINCT FROM p_site_id THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'A conflicting executed exception action already exists for this advance');
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'action_id', v_action.id, 'executed_at', v_action.executed_at,
      'journal_entry_id', v_action.gl_journal_entry_id, 'message', 'Already executed (idempotent)'
    );
  END IF;

  SELECT * INTO v_source_mmp FROM public.mmp_files WHERE id = p_mmp_id;
  IF NOT FOUND
     OR COALESCE(v_source_mmp.cycle_status, '') = 'closed'
     OR COALESCE(v_source_mmp.status, '') = 'closed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Source MMP is missing or closed');
  END IF;

  SELECT * INTO v_source_site
  FROM public.mmp_site_entries
  WHERE id = p_site_id AND mmp_file_id = p_mmp_id
  FOR UPDATE;
  IF NOT FOUND
     OR NOT (COALESCE(v_source_site.not_covered_flag, false)
             OR lower(COALESCE(v_source_site.status, '')) = 'not_covered') THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Source site must be a not-covered site in the selected cycle');
  END IF;

  SELECT * INTO v_advance
  FROM public.down_payment_requests
  WHERE id = p_advance_id AND mmp_site_entry_id = p_site_id
  FOR UPDATE;
  IF NOT FOUND OR v_advance.status NOT IN ('paid', 'fully_paid', 'partially_paid') THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'The selected action requires a paid advance on the not-covered source site');
  END IF;
  v_paid_amount := COALESCE(NULLIF(v_advance.total_paid_amount, 0), v_advance.requested_amount, 0);

  IF p_target_site_id IS NULL THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Select another covered site in this cycle before executing this action');
  END IF;
  IF p_target_site_id = p_site_id THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'The source not-covered site cannot be its own target');
  END IF;
  IF p_target_mmp_id IS NOT NULL AND p_target_mmp_id <> p_mmp_id THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Redirect and paid reassignment targets must be in the same cycle');
  END IF;

  SELECT * INTO v_target_site
  FROM public.mmp_site_entries
  WHERE id = p_target_site_id AND mmp_file_id = p_mmp_id
  FOR UPDATE;
  IF NOT FOUND
     OR COALESCE(v_target_site.not_covered_flag, false)
     OR lower(COALESCE(v_target_site.status, '')) = 'not_covered' THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Target must be a different covered site in the same cycle');
  END IF;

  IF v_source_site.accepted_by IS NULL OR v_target_site.accepted_by IS NULL THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Both source and target sites must have an assigned enumerator');
  END IF;
  v_cross_enumerator := v_source_site.accepted_by IS DISTINCT FROM v_target_site.accepted_by;
  IF v_cross_enumerator AND NOT v_is_manager THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Cross-enumerator transfers require FOM / Admin / Super Admin authorization');
  END IF;

  IF p_decision = 'reassign' THEN
    INSERT INTO public.cycle_exception_actions (
      mmp_file_id, mmp_site_entry_id, advance_id, enumerator_name, site_name,
      advance_amount, advance_status, decision, target_site_id,
      rollover_site_id, rollover_site_name, executed, executed_at, executed_by,
      executed_by_name, execution_note, created_by_name, action_payload
    ) VALUES (
      p_mmp_id, p_site_id, p_advance_id, v_source_site.accepted_by, v_source_site.site_name,
      v_paid_amount, v_advance.status, 'reassign', p_target_site_id,
      p_target_site_id, v_target_site.site_name, true, now(), v_actor_id,
      v_actor_name, 'Paid advance reassigned via Cycle Close', v_actor_name,
      jsonb_build_object(
        'source_site_id', p_site_id, 'target_site_id', p_target_site_id,
        'cross_enumerator', v_cross_enumerator, 'actor_id', v_actor_id
      )
    ) RETURNING id, executed_at INTO v_action_id, v_executed_at;

    UPDATE public.down_payment_requests
    SET mmp_site_entry_id = p_target_site_id,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'exception_action_id', v_action_id, 'reassigned_by', v_actor_id,
          'reassigned_at', now(), 'from_site_id', p_site_id, 'to_site_id', p_target_site_id,
          'cross_enumerator', v_cross_enumerator
        )
    WHERE id = p_advance_id;

    RETURN jsonb_build_object(
      'ok', true, 'action_id', v_action_id, 'executed_at', v_executed_at,
      'message', 'Paid advance reassigned successfully'
    );
  END IF;

  -- Redirect-specific validation. It must settle the complete advance, and the
  -- destination fee must have enough outstanding balance. This makes an advance
  -- smaller than the fee a partial fee settlement, while disallowing a surplus
  -- from becoming false fee expense.
  IF COALESCE(p_amount, 0) <> v_paid_amount OR v_paid_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Redirect amount must equal the complete paid advance (SDG ' || v_paid_amount || ')');
  END IF;
  IF p_justification IS NULL OR trim(p_justification) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A redirect justification is required');
  END IF;

  v_gross_fee := COALESCE(v_target_site.enumerator_fee, 0) + COALESCE(v_target_site.transport_fee, 0);
  v_prior_settled := COALESCE(v_target_site.fee_paid_amount, 0);
  v_remaining_fee := GREATEST(v_gross_fee - v_prior_settled, 0);
  IF v_gross_fee <= 0 THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Target site has no eligible enumerator fee to settle');
  END IF;
  IF v_paid_amount > v_remaining_fee THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Redirect would over-settle the target fee. Fee remaining is SDG '
        || v_remaining_fee || '; recover or reassign the surplus instead.');
  END IF;

  -- Delegate the journal, original payment preservation, and source-advance
  -- transition to the previously deployed atomic implementation. It writes a
  -- temporary fee settlement on the source; the rows below immediately move the
  -- settlement trace to the validated target in the same transaction.
  v_result := public.execute_cycle_close_exception_legacy(
    p_mmp_id, p_site_id, p_advance_id, p_decision, p_amount, p_justification,
    NULL, p_target_site_id, p_receipt_reference, p_return_method, p_recovery_date
  );
  IF NOT COALESCE((v_result ->> 'ok')::boolean, false) THEN
    RETURN v_result;
  END IF;
  v_action_id := (v_result ->> 'action_id')::uuid;

  SELECT COALESCE(jsonb_agg(to_jsonb(request.wallet_transaction_ids)), '[]'::jsonb)
  INTO v_source_refs
  FROM public.down_payment_requests AS request
  WHERE request.id = p_advance_id
    AND request.wallet_transaction_ids IS NOT NULL;

  v_applied_amount := v_paid_amount;
  v_remaining_fee := GREATEST(v_gross_fee - (v_prior_settled + v_applied_amount), 0);
  v_target_status := CASE WHEN v_remaining_fee = 0 THEN 'paid' ELSE 'partially_paid' END;

  -- Prevent the generic fee-paid trigger from posting an additional journal
  -- when the offset completes the target fee. The cycle exception journal is
  -- already the authoritative Debit Fees / Credit Transport Advance posting.
  IF v_target_status = 'paid' THEN
    INSERT INTO public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, journal_entry_id)
    SELECT 'mmp_site_entries', p_target_site_id, 'enumerator_fee_paid', 'success',
      (v_result ->> 'journal_entry_id')::uuid
    WHERE NOT EXISTS (
      SELECT 1 FROM public.acct_gl_bridge_log
      WHERE source_table = 'mmp_site_entries'
        AND source_id = p_target_site_id
        AND event_type = 'enumerator_fee_paid'
        AND status = 'success'
    );
  END IF;

  UPDATE public.mmp_site_entries
  SET
    fee_paid_status = v_target_status,
    fee_paid_amount = v_prior_settled + v_applied_amount,
    fee_advance_offset_amount = COALESCE(fee_advance_offset_amount, 0) + v_applied_amount,
    fee_paid_at = now(),
    fee_paid_by = v_actor_id,
    fee_payment_method = 'advance_offset',
    fee_payment_notes = concat_ws(
      '; ',
      NULLIF(fee_payment_notes, ''),
      'Cycle Close redirect: SDG ' || v_applied_amount || ' from advance ' || p_advance_id::text,
      'action ' || v_action_id::text,
      'GL journal ' || COALESCE(v_result ->> 'journal_entry_id', 'not recorded')
    )
  WHERE id = p_target_site_id;

  -- Remove only the temporary source fee marker installed by the legacy
  -- redirect. The transport payment and wallet references stay on the advance.
  UPDATE public.mmp_site_entries
  SET fee_paid_status = 'unpaid',
      fee_paid_amount = 0,
      fee_cash_paid_amount = 0,
      fee_advance_offset_amount = 0,
      fee_payment_method = NULL,
      fee_payment_notes = NULL,
      fee_paid_at = NULL,
      fee_paid_by = NULL
  WHERE id = p_site_id;

  DELETE FROM public.acct_gl_bridge_log
  WHERE source_table = 'mmp_site_entries'
    AND source_id = p_site_id
    AND event_type = 'enumerator_fee_paid'
    AND journal_entry_id = (v_result ->> 'journal_entry_id')::uuid;

  UPDATE public.cycle_exception_actions
  SET
    target_site_id = p_target_site_id,
    rollover_site_id = p_target_site_id,
    rollover_site_name = v_target_site.site_name,
    redirect_fee_site_entry_id = p_target_site_id,
    redirect_fee_gross_amount = v_gross_fee,
    redirect_fee_prior_settled_amount = v_prior_settled,
    redirect_fee_settled_amount = v_applied_amount,
    redirect_fee_remaining_amount = v_remaining_fee,
    redirect_fee_status = v_target_status,
    source_payment_references = v_source_refs,
    action_payload = COALESCE(action_payload, '{}'::jsonb) || jsonb_build_object(
      'redirect_target_site_id', p_target_site_id,
      'fee_gross_amount', v_gross_fee,
      'fee_prior_settled_amount', v_prior_settled,
      'fee_settled_by_advance', v_applied_amount,
      'fee_remaining_amount', v_remaining_fee,
      'fee_status', v_target_status,
      'source_payment_references', v_source_refs,
      'cross_enumerator', v_cross_enumerator
    )
  WHERE id = v_action_id;

  RETURN v_result || jsonb_build_object(
    'target_site_id', p_target_site_id,
    'fee_gross_amount', v_gross_fee,
    'fee_settled_amount', v_applied_amount,
    'fee_remaining_amount', v_remaining_fee,
    'fee_status', v_target_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_cycle_close_exception(
  uuid, uuid, uuid, text, numeric, text, uuid, uuid, text, text, date
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_cycle_close_exception(
  uuid, uuid, uuid, text, numeric, text, uuid, uuid, text, text, date
) TO authenticated;

COMMENT ON FUNCTION public.execute_cycle_close_exception(
  uuid, uuid, uuid, text, numeric, text, uuid, uuid, text, text, date
) IS 'Cycle Close executor with covered-target redirect validation, partial fee settlement, and paid-advance reassignment.';

-- Post only the cash component after a partial Cycle Close redirect. The
-- redirect itself already posted its Debit Fees / Credit Advance journal; a
-- later cash settlement must not post that offset a second time.
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
  v_cash_account text;
  v_country_id uuid;
  v_entry_id uuid;
  v_lines jsonb;
  v_has_redirect boolean;
BEGIN
  IF NEW.fee_paid_status IS DISTINCT FROM 'paid' OR OLD.fee_paid_status = 'paid' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.acct_gl_bridge_log
    WHERE source_table = 'mmp_site_entries'
      AND source_id = NEW.id
      AND event_type = 'enumerator_fee_paid'
      AND status = 'success'
  ) THEN
    RETURN NEW;
  END IF;

  v_gross_fee := COALESCE(NEW.enumerator_fee, 0) + COALESCE(NEW.transport_fee, 0);
  v_cash_amount := COALESCE(NEW.fee_cash_paid_amount, v_gross_fee);
  v_advance_offset := COALESCE(NEW.fee_advance_offset_amount, 0);
  v_cash_account := CASE WHEN NEW.fee_payment_method = 'bank_transfer' THEN '1020' ELSE '1010' END;
  SELECT country_id INTO v_country_id FROM public.mmp_files WHERE id = NEW.mmp_file_id;
  SELECT EXISTS (
    SELECT 1 FROM public.cycle_exception_actions
    WHERE redirect_fee_site_entry_id = NEW.id
      AND decision = 'redirect'
      AND executed = true
  ) INTO v_has_redirect;

  -- If a prior redirect posted the advance component, cash is the only new
  -- expense. Otherwise this is the normal combined fee settlement.
  IF v_has_redirect THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '5200', 'debit_credit', 'DR', 'amount', v_cash_amount,
        'currency', 'SDG', 'description', 'Enumerator fee cash settlement — ' || COALESCE(NEW.site_name, 'Site'), 'function', 'program'),
      jsonb_build_object('account_code', v_cash_account, 'debit_credit', 'CR', 'amount', v_cash_amount,
        'currency', 'SDG', 'description', 'Enumerator fee cash settlement — ' || COALESCE(NEW.site_name, 'Site'), 'function', 'none')
    );
  ELSE
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '5200', 'debit_credit', 'DR', 'amount', v_gross_fee,
        'currency', 'SDG', 'description', 'Enumerator Fee — ' || COALESCE(NEW.site_name, 'Site'), 'function', 'program'),
      jsonb_build_object('account_code', v_cash_account, 'debit_credit', 'CR', 'amount', v_cash_amount,
        'currency', 'SDG', 'description', 'Enumerator fee cash component — ' || COALESCE(NEW.site_name, 'Site'), 'function', 'none'),
      jsonb_build_object('account_code', '1510', 'debit_credit', 'CR', 'amount', v_advance_offset,
        'currency', 'SDG', 'description', 'Transport advance offset — ' || COALESCE(NEW.site_name, 'Site'), 'function', 'program')
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
    INSERT INTO public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, error_message)
    VALUES ('mmp_site_entries', NEW.id, 'enumerator_fee_paid', 'error', SQLERRM);
  END;
  RETURN NEW;
END;
$$;

COMMIT;
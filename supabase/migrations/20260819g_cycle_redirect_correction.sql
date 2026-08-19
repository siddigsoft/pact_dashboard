-- Safely reopen a legacy Cycle Close Redirect without erasing its accounting
-- or execution history. The original journal is reversed, the original action
-- is marked corrected, and a new unexecuted action row restores the advance to
-- the Step 4 queue.

BEGIN;

ALTER TABLE public.cycle_exception_actions
  ADD COLUMN IF NOT EXISTS correction_status text,
  ADD COLUMN IF NOT EXISTS corrected_at timestamptz,
  ADD COLUMN IF NOT EXISTS corrected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS corrected_by_name text,
  ADD COLUMN IF NOT EXISTS correction_reason text,
  ADD COLUMN IF NOT EXISTS correction_reversal_journal_id uuid REFERENCES public.acct_journal_entries(id),
  ADD COLUMN IF NOT EXISTS correction_replacement_action_id uuid REFERENCES public.cycle_exception_actions(id),
  ADD COLUMN IF NOT EXISTS correction_idempotency_key text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cycle_exception_actions_correction_status_check'
      AND conrelid = 'public.cycle_exception_actions'::regclass
  ) THEN
    ALTER TABLE public.cycle_exception_actions
      ADD CONSTRAINT cycle_exception_actions_correction_status_check
      CHECK (correction_status IS NULL OR correction_status = 'reopened_for_correction');
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cea_correction_idempotency
  ON public.cycle_exception_actions (correction_idempotency_key)
  WHERE correction_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cea_corrected_redirects
  ON public.cycle_exception_actions (mmp_file_id, corrected_at DESC)
  WHERE correction_status = 'reopened_for_correction';

-- Preserve the original bridge row exactly as posted and link its reversal in a
-- separate immutable audit record. Deleting the original success row would
-- erase the accounting trace that explains why the fee was once marked paid.
CREATE TABLE IF NOT EXISTS public.acct_gl_bridge_reversal_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_log_id uuid NOT NULL UNIQUE REFERENCES public.acct_gl_bridge_log(id),
  original_journal_entry_id uuid NOT NULL REFERENCES public.acct_journal_entries(id),
  reversal_journal_entry_id uuid NOT NULL UNIQUE REFERENCES public.acct_journal_entries(id),
  correction_action_id uuid NOT NULL UNIQUE REFERENCES public.cycle_exception_actions(id),
  reason text NOT NULL,
  reversed_by uuid NOT NULL REFERENCES public.profiles(id),
  reversed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.acct_gl_bridge_reversal_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS acct_gl_bridge_reversal_links_read
  ON public.acct_gl_bridge_reversal_links;
CREATE POLICY acct_gl_bridge_reversal_links_read
  ON public.acct_gl_bridge_reversal_links
  FOR SELECT TO authenticated
  USING (public.is_cycle_exception_executor(auth.uid()));
GRANT SELECT ON public.acct_gl_bridge_reversal_links TO authenticated;

-- Serialize every reversal insert against its original journal, including
-- callers that invoke acct_post_reversal directly. This closes the race where
-- two different idempotency keys could otherwise post two reversing journals
-- before either caller marked the original as reversed.
CREATE OR REPLACE FUNCTION public.acct_guard_reversal_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_original_status text;
  v_linked_reversal_id uuid;
  v_existing_same_request uuid;
BEGIN
  IF NEW.source_type <> 'reversal' OR NEW.source_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status::text, reversed_by_entry_id
  INTO v_original_status, v_linked_reversal_id
  FROM public.acct_journal_entries
  WHERE id = NEW.source_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORIGINAL_NOT_FOUND: journal entry % does not exist', NEW.source_id;
  END IF;

  IF v_original_status = 'posted' AND v_linked_reversal_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- A concurrent retry with the same key reaches this trigger only after the
  -- first transaction commits. Skip the duplicate INSERT so the caller's
  -- existing ON CONFLICT branch can return the already-linked journal.
  SELECT id
  INTO v_existing_same_request
  FROM public.acct_journal_entries
  WHERE idempotency_key = NEW.idempotency_key
    AND source_type = 'reversal'
    AND source_id = NEW.source_id
    AND id = v_linked_reversal_id;

  IF v_original_status = 'reversed' AND v_existing_same_request IS NOT NULL THEN
    RETURN NULL;
  END IF;

  RAISE EXCEPTION
    'ORIGINAL_NOT_REVERSIBLE: entry % has status % and linked reversal %',
    NEW.source_id, v_original_status, coalesce(v_linked_reversal_id::text, 'none');
END;
$$;

DROP TRIGGER IF EXISTS trg_acct_guard_reversal_insert
  ON public.acct_journal_entries;
CREATE TRIGGER trg_acct_guard_reversal_insert
  BEFORE INSERT ON public.acct_journal_entries
  FOR EACH ROW
  WHEN (NEW.source_type = 'reversal')
  EXECUTE FUNCTION public.acct_guard_reversal_insert();

CREATE OR REPLACE FUNCTION public.is_cycle_redirect_correction_authorizer(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND lower(regexp_replace(coalesce(p.role::text, ''), '[^a-z0-9]', '', 'g'))
          IN ('superadmin', 'finance', 'accountant')
  );
$$;

REVOKE ALL ON FUNCTION public.is_cycle_redirect_correction_authorizer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_cycle_redirect_correction_authorizer(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reopen_cycle_redirect_for_correction(
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
  v_replacement_action_id uuid;
  v_original_paid_status text;
  v_settled_amount numeric;
  v_prior_settled numeric;
  v_gross_fee numeric;
  v_bridge_log_id uuid;
  v_bridge_log_count bigint;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication is required.');
  END IF;

  IF NOT public.is_cycle_redirect_correction_authorizer(v_actor_id) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Only Super Admin, Finance, or Accountant users may reverse and reopen a Redirect.'
    );
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'A correction reason of at least 10 characters is required.'
    );
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 12 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A valid idempotency key is required.');
  END IF;
  v_reversal_idempotency_key := 'cycle-redirect-correction:'
    || p_action_id::text || ':' || trim(p_idempotency_key);

  SELECT *
  INTO v_action
  FROM public.cycle_exception_actions
  WHERE id = p_action_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cycle exception action was not found.');
  END IF;

  -- A retry after a lost response returns the completed correction instead of
  -- trying to reverse the journal twice.
  IF v_action.correction_status = 'reopened_for_correction' THEN
    IF v_action.correction_idempotency_key IS DISTINCT FROM trim(p_idempotency_key) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'This Redirect was already reopened with a different correction request.'
      );
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'already_corrected', true,
      'action_id', v_action.id,
      'advance_id', v_action.advance_id,
      'reversal_journal_entry_id', v_action.correction_reversal_journal_id,
      'replacement_action_id', v_action.correction_replacement_action_id,
      'corrected_at', v_action.corrected_at
    );
  END IF;

  IF v_action.decision <> 'redirect' OR NOT coalesce(v_action.executed, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Only an executed Redirect action can be reopened by this correction.'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cycle_exception_action_allocations a
    WHERE a.action_id = v_action.id
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This Redirect uses the normalized allocation ledger and is not a legacy correction candidate.'
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
      'error', 'Reopen the cycle before correcting its Redirect action.'
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
      'error', 'The source site must still be marked not covered before this Redirect can be reopened.'
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

  IF v_advance.status <> 'cancelled'
     OR coalesce(v_advance.metadata->>'exception_action_id', '') <> v_action.id::text THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The advance changed after this Redirect and cannot be restored automatically.'
    );
  END IF;

  IF v_action.advance_status NOT IN ('paid', 'fully_paid', 'partially_paid') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The original paid advance status was not recorded safely on this action.'
    );
  END IF;
  v_original_paid_status := v_action.advance_status;

  IF v_action.gl_journal_entry_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The original Redirect has no GL journal reference and cannot be corrected automatically.'
    );
  END IF;

  SELECT *
  INTO v_journal
  FROM public.acct_journal_entries
  WHERE id = v_action.gl_journal_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The original Redirect journal no longer exists.'
    );
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

  -- This automated correction is deliberately limited to the old executor that
  -- incorrectly settled the not-covered source site. Newer single-target
  -- redirects have a real target snapshot and require their own correction
  -- workflow; normalized multi-target actions were rejected above.
  IF v_action.redirect_fee_site_entry_id IS NOT NULL
     AND v_action.redirect_fee_site_entry_id <> v_action.mmp_site_entry_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This Redirect settled a separate target site and is not eligible for the legacy source-site correction.'
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
    FROM public.acct_gl_bridge_log l
    WHERE l.source_table = 'mmp_site_entries'
      AND l.source_id = v_target_id
      AND l.event_type = 'enumerator_fee_paid'
      AND l.status = 'success'
      AND l.journal_entry_id IS DISTINCT FROM v_journal.id
      AND l.created_at > coalesce(v_action.executed_at, v_action.created_at)
  ) OR EXISTS (
    SELECT 1
    FROM public.cycle_exception_action_allocations a
    WHERE a.target_site_id = v_target_id
      AND a.created_at > coalesce(v_action.executed_at, v_action.created_at)
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Later fee-settlement activity exists for the affected site. Finance must review it manually before reopening this Redirect.'
    );
  END IF;

  v_settled_amount := coalesce(
    nullif(v_action.redirect_fee_settled_amount, 0),
    nullif(v_action.decision_amount, 0),
    nullif(v_action.advance_amount, 0),
    0
  );

  IF v_settled_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The Redirect settlement amount is missing.');
  END IF;

  -- The old executor wrote paid/status/actor/time on the source. Migration
  -- 20260819e later normalized that historical row to gross=cash and offset=0
  -- because the redirected advance was already cancelled. Require that exact
  -- signature plus the exact original bridge row before clearing anything.
  -- Any manual edit, later cash settlement, receipt, or component change makes
  -- the record fail closed for Finance review.
  v_gross_fee := round(
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
      'error', 'The legacy source fee no longer matches the exact Redirect snapshot. Finance must review it manually before reopening this advance.'
    );
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'line_no', l.line_no,
      'account_id', l.account_id,
      'fund_id', l.fund_id,
      'function', coalesce(l.function, 'none'),
      'project_id', l.project_id,
      'grant_id', l.grant_id,
      'cost_center_id', l.cost_center_id,
      'partner_id', l.partner_id,
      'debit_credit', CASE l.debit_credit WHEN 'DR' THEN 'CR' ELSE 'DR' END,
      'original_amount', l.original_amount,
      'original_currency', l.original_currency,
      'functional_amount', l.functional_amount,
      'functional_currency', l.functional_currency,
      'fx_rate', l.fx_rate,
      'description', 'Correction reversal: ' || trim(p_reason)
    )
    ORDER BY l.line_no
  )
  INTO v_reversal_payload
  FROM public.acct_journal_lines l
  WHERE l.entry_id = v_journal.id;

  IF v_reversal_payload IS NULL OR jsonb_array_length(v_reversal_payload) < 2 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The original Redirect journal lines are missing or incomplete.'
    );
  END IF;

  v_reversal_payload := jsonb_build_object(
    'description_en', 'Reverse incorrect Cycle Close Redirect — ' || trim(p_reason),
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
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'GL reversal failed: ' || SQLERRM
    );
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
      fee_payment_notes = 'Legacy Redirect reversed on ' || v_now::date || ': ' || trim(p_reason)
  WHERE id = v_target_id;

  UPDATE public.down_payment_requests
  SET status = v_original_paid_status,
      mmp_site_entry_id = v_action.mmp_site_entry_id,
      metadata = (
        coalesce(metadata, '{}'::jsonb)
        - ARRAY[
          'exception_action_id',
          'redirected_to_fees_by',
          'redirected_at',
          'justification',
          'gl_journal_entry_id'
        ]::text[]
      ) || jsonb_build_object(
        'cycle_redirect_correction', jsonb_build_object(
          'original_action_id', v_action.id,
          'original_journal_entry_id', v_journal.id,
          'reversal_journal_entry_id', v_reversal_journal_id,
          'corrected_by', v_actor_id,
          'corrected_at', v_now,
          'reason', trim(p_reason)
        )
      )
  WHERE id = v_action.advance_id;

  SELECT coalesce(full_name, email, id::text)
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor_id;

  INSERT INTO public.cycle_exception_actions (
    mmp_file_id,
    mmp_site_entry_id,
    advance_id,
    enumerator_id,
    enumerator_name,
    site_name,
    advance_amount,
    advance_status,
    decision,
    decision_amount,
    justification,
    executed,
    created_by_name,
    action_payload
  ) VALUES (
    v_action.mmp_file_id,
    v_action.mmp_site_entry_id,
    v_action.advance_id,
    v_action.enumerator_id,
    v_action.enumerator_name,
    v_action.site_name,
    v_action.advance_amount,
    v_original_paid_status,
    'redirect',
    NULL,
    NULL,
    false,
    v_actor_name,
    jsonb_build_object(
      'reopened_from_action_id', v_action.id,
      'reopened_at', v_now,
      'reopened_by', v_actor_id
    )
  )
  RETURNING id INTO v_replacement_action_id;

  UPDATE public.cycle_exception_actions
  SET correction_status = 'reopened_for_correction',
      corrected_at = v_now,
      corrected_by = v_actor_id,
      corrected_by_name = v_actor_name,
      correction_reason = trim(p_reason),
      correction_reversal_journal_id = v_reversal_journal_id,
      correction_replacement_action_id = v_replacement_action_id,
      correction_idempotency_key = trim(p_idempotency_key),
      action_payload = coalesce(action_payload, '{}'::jsonb) || jsonb_build_object(
        'correction', jsonb_build_object(
          'status', 'reopened_for_correction',
          'corrected_at', v_now,
          'corrected_by', v_actor_id,
          'reason', trim(p_reason),
          'original_journal_entry_id', v_journal.id,
          'reversal_journal_entry_id', v_reversal_journal_id,
          'replacement_action_id', v_replacement_action_id
        )
      )
  WHERE id = v_action.id;

  RETURN jsonb_build_object(
    'ok', true,
    'action_id', v_action.id,
    'advance_id', v_action.advance_id,
    'source_site_id', v_action.mmp_site_entry_id,
    'reversal_journal_entry_id', v_reversal_journal_id,
    'replacement_action_id', v_replacement_action_id,
    'restored_advance_status', v_original_paid_status,
    'corrected_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_cycle_redirect_for_correction(uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_cycle_redirect_for_correction(uuid, text, uuid, text) TO authenticated;

-- A historical bridge success stops being an active posting sentinel once its
-- journal is reversed. Both the live trigger and reconciliation RPC use this
-- helper so the original audit row can remain immutable without suppressing a
-- later legitimate fee payment.
CREATE OR REPLACE FUNCTION public.has_active_enumerator_fee_bridge(p_site_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.acct_gl_bridge_log bridge
    JOIN public.acct_journal_entries journal
      ON journal.id = bridge.journal_entry_id
    LEFT JOIN public.acct_gl_bridge_reversal_links reversal
      ON reversal.bridge_log_id = bridge.id
    WHERE bridge.source_table = 'mmp_site_entries'
      AND bridge.source_id = p_site_id
      AND bridge.event_type = 'enumerator_fee_paid'
      AND bridge.status = 'success'
      AND journal.status = 'posted'
      AND reversal.id IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.has_active_enumerator_fee_bridge(uuid) FROM PUBLIC;

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
      AND action.correction_status IS DISTINCT FROM 'reopened_for_correction'
    UNION ALL
    SELECT 1
    FROM public.cycle_exception_action_allocations allocation
    JOIN public.cycle_exception_actions action ON action.id = allocation.action_id
    WHERE allocation.target_site_id = NEW.id
      AND action.decision = 'redirect'
      AND action.executed = true
      AND action.correction_status IS DISTINCT FROM 'reopened_for_correction'
  ) INTO v_has_redirect;

  IF v_has_redirect THEN
    SELECT COALESCE(sum(allocation.amount), 0)
    INTO v_authoritative_offset
    FROM public.cycle_exception_action_allocations allocation
    JOIN public.cycle_exception_actions action ON action.id = allocation.action_id
    WHERE allocation.target_site_id = NEW.id
      AND action.decision = 'redirect'
      AND action.executed = true
      AND action.correction_status IS DISTINCT FROM 'reopened_for_correction';

    SELECT v_authoritative_offset + COALESCE(sum(
      COALESCE(action.redirect_fee_settled_amount, action.decision_amount, action.advance_amount)
    ), 0)
    INTO v_authoritative_offset
    FROM public.cycle_exception_actions action
    WHERE action.redirect_fee_site_entry_id = NEW.id
      AND action.decision = 'redirect'
      AND action.executed = true
      AND action.correction_status IS DISTINCT FROM 'reopened_for_correction'
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

CREATE OR REPLACE FUNCTION public.post_enumerator_fees_to_gl()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posted  int := 0;
  v_skipped int := 0;
  v_errors  int := 0;
  v_rec     RECORD;
  v_advance numeric(18,2);
  v_net     numeric(18,2);
  v_fee     numeric(18,2);
  v_acc     text;
  v_lines   jsonb;
  v_eid     uuid;
  v_cid     uuid;
BEGIN
  FOR v_rec IN
    SELECT s.*, m.country_id
    FROM public.mmp_site_entries s
    JOIN public.mmp_files m ON m.id = s.mmp_file_id
    WHERE s.fee_paid_status = 'paid'
      AND NOT public.has_active_enumerator_fee_bridge(s.id)
    ORDER BY s.fee_paid_at NULLS LAST
  LOOP
    BEGIN
      v_fee := COALESCE(v_rec.enumerator_fee, 0) + COALESCE(v_rec.transport_fee, 0);
      IF v_fee <= 0 THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      SELECT COALESCE(total_paid_amount, requested_amount, 0)
      INTO v_advance
      FROM public.down_payment_requests
      WHERE mmp_site_entry_id = v_rec.id
        AND status IN ('paid','fully_paid','partially_paid')
      ORDER BY total_paid_amount DESC NULLS LAST
      LIMIT 1;

      v_advance := COALESCE(v_advance, 0);
      v_net := GREATEST(v_fee - v_advance, 0);
      v_acc := CASE
        WHEN v_rec.fee_payment_method = 'bank_transfer' THEN '1020'
        ELSE '1010'
      END;
      v_cid := v_rec.country_id;

      IF v_advance > 0 THEN
        v_lines := jsonb_build_array(
          jsonb_build_object('account_code','5200','debit_credit','DR','amount',v_fee,'currency','SDG','description','Enumerator Fee — '||COALESCE(v_rec.site_name,'Site'),'function','program'),
          jsonb_build_object('account_code',v_acc,'debit_credit','CR','amount',v_net,'currency','SDG','description','Cash paid (net) — '||COALESCE(v_rec.site_name,'Site'),'function','none'),
          jsonb_build_object('account_code','1510','debit_credit','DR','amount',v_advance,'currency','SDG','description','Advance offset — '||COALESCE(v_rec.site_name,'Site'),'function','program'),
          jsonb_build_object('account_code','5200','debit_credit','CR','amount',v_advance,'currency','SDG','description','Advance offsets fee — '||COALESCE(v_rec.site_name,'Site'),'function','program')
        );
      ELSE
        v_lines := jsonb_build_array(
          jsonb_build_object('account_code','5200','debit_credit','DR','amount',v_fee,'currency','SDG','description','Enumerator Fee — '||COALESCE(v_rec.site_name,'Site'),'function','program'),
          jsonb_build_object('account_code',v_acc,'debit_credit','CR','amount',v_fee,'currency','SDG','description','Cash payment — '||COALESCE(v_rec.site_name,'Site'),'function','none')
        );
      END IF;

      v_eid := public.acct_bridge_post_journal(
        'mmp_site_entries', v_rec.id, 'enumerator_fee_paid',
        COALESCE(v_rec.fee_paid_at::date, current_date),
        'Enumerator Fee Paid: ' || COALESCE(v_rec.site_name, v_rec.id::text),
        'أجر معدد مدفوع: ' || COALESCE(v_rec.site_name, v_rec.id::text),
        v_lines, v_rec.fee_paid_by, v_cid
      );

      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      VALUES
        ('mmp_site_entries', v_rec.id, 'enumerator_fee_paid', 'success', v_eid);
      v_posted := v_posted + 1;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      VALUES
        ('mmp_site_entries', v_rec.id, 'enumerator_fee_paid', 'error', SQLERRM);
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'posted', v_posted,
    'skipped', v_skipped,
    'errors', v_errors
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_enumerator_fees_to_gl() TO authenticated;

CREATE OR REPLACE VIEW public.cycle_redirect_correction_history
WITH (security_invoker = true)
AS
SELECT
  a.id AS action_id,
  a.mmp_file_id,
  a.mmp_site_entry_id AS source_site_id,
  a.advance_id,
  a.site_name AS source_site_name,
  a.enumerator_id,
  a.enumerator_name,
  a.advance_amount,
  a.advance_status,
  a.executed_at,
  a.executed_by,
  a.gl_journal_entry_id AS original_journal_entry_id,
  a.correction_status,
  a.corrected_at,
  a.corrected_by,
  a.corrected_by_name,
  a.correction_reason,
  a.correction_reversal_journal_id AS reversal_journal_entry_id,
  a.correction_replacement_action_id AS replacement_action_id
FROM public.cycle_exception_actions a
WHERE a.decision = 'redirect'
  AND a.correction_status = 'reopened_for_correction';

GRANT SELECT ON public.cycle_redirect_correction_history TO authenticated;

COMMIT;
-- =============================================================================
-- Cycle Close Redirect: multi-site advance allocations
--
-- One paid transport advance may settle one or more covered sites' outstanding
-- Enumerator Fees. Every target allocation is explicit and auditable. The full
-- advance must be allocated before the source exception is completed.
--
-- Accounting per target:
--   DR Enumerator Fees      allocation amount
--   CR Transport Advance    allocation amount
--
-- This migration is additive. It does not rewrite legacy redirect journals.
-- =============================================================================

BEGIN;

ALTER TABLE public.cycle_exception_actions
  ADD COLUMN IF NOT EXISTS redirect_allocation_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS redirect_unallocated_amount numeric(18,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.cycle_exception_action_allocations (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id                    uuid NOT NULL
                                 REFERENCES public.cycle_exception_actions(id) ON DELETE CASCADE,
  allocation_order             integer NOT NULL,
  source_advance_id            uuid NOT NULL REFERENCES public.down_payment_requests(id),
  source_site_id               uuid NOT NULL REFERENCES public.mmp_site_entries(id),
  target_site_id               uuid NOT NULL REFERENCES public.mmp_site_entries(id),
  target_site_name             text NOT NULL,
  source_enumerator_id         text,
  target_enumerator_id         text,
  cross_enumerator             boolean NOT NULL DEFAULT false,
  amount                       numeric(18,2) NOT NULL CHECK (amount > 0),
  fee_gross_amount             numeric(18,2) NOT NULL CHECK (fee_gross_amount >= 0),
  fee_prior_settled_amount     numeric(18,2) NOT NULL CHECK (fee_prior_settled_amount >= 0),
  fee_remaining_amount         numeric(18,2) NOT NULL CHECK (fee_remaining_amount >= 0),
  fee_status                   text NOT NULL
                                 CHECK (fee_status IN ('partially_paid', 'paid')),
  gl_journal_entry_id          uuid,
  source_payment_references    jsonb NOT NULL DEFAULT '[]'::jsonb,
  justification                text NOT NULL,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  created_by                   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (action_id, target_site_id),
  UNIQUE (action_id, allocation_order)
);

CREATE INDEX IF NOT EXISTS idx_cea_allocations_action
  ON public.cycle_exception_action_allocations(action_id);
CREATE INDEX IF NOT EXISTS idx_cea_allocations_advance
  ON public.cycle_exception_action_allocations(source_advance_id);
CREATE INDEX IF NOT EXISTS idx_cea_allocations_target
  ON public.cycle_exception_action_allocations(target_site_id);

ALTER TABLE public.cycle_exception_action_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cea_allocations_executor_select"
  ON public.cycle_exception_action_allocations;
CREATE POLICY "cea_allocations_executor_select"
  ON public.cycle_exception_action_allocations
  FOR SELECT
  USING (public.is_cycle_exception_executor(auth.uid()));

-- Mutations are deliberately RPC-only.
REVOKE INSERT, UPDATE, DELETE ON public.cycle_exception_action_allocations
  FROM authenticated;
GRANT SELECT ON public.cycle_exception_action_allocations TO authenticated;

CREATE OR REPLACE FUNCTION public.execute_cycle_close_redirect_allocations(
  p_mmp_id          uuid,
  p_source_site_id  uuid,
  p_advance_id      uuid,
  p_allocations     jsonb,
  p_justification   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id              uuid := auth.uid();
  v_actor_name            text;
  v_is_manager            boolean;
  v_mmp                   record;
  v_source_site           record;
  v_advance               record;
  v_existing_action       record;
  v_reuse_action          boolean := false;
  v_target                record;
  v_allocation            jsonb;
  v_action_id             uuid;
  v_journal_id            uuid;
  v_country_id            uuid;
  v_paid_amount           numeric(18,2);
  v_amount                numeric(18,2);
  v_total_allocated       numeric(18,2) := 0;
  v_total_gross           numeric(18,2) := 0;
  v_total_prior           numeric(18,2) := 0;
  v_total_remaining       numeric(18,2) := 0;
  v_gross_fee             numeric(18,2);
  v_prior_settled         numeric(18,2);
  v_remaining_before      numeric(18,2);
  v_remaining_after       numeric(18,2);
  v_target_status         text;
  v_cross_enumerator      boolean;
  v_has_cross_enumerator  boolean := false;
  v_all_paid              boolean := true;
  v_allocation_count      integer;
  v_allocation_order      integer := 0;
  v_target_count          integer;
  v_advance_account       text;
  v_fee_account           text;
  v_source_refs           jsonb := '[]'::jsonb;
  v_normalized            jsonb := '[]'::jsonb;
  v_result_allocations    jsonb := '[]'::jsonb;
  v_lines                 jsonb := '[]'::jsonb;
  v_line_description      text;
  v_header_en             text;
  v_header_ar             text;
  v_now                   timestamptz := now();
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'NOT_AUTHENTICATED',
      'error', 'Not authenticated');
  END IF;
  IF NOT public.is_cycle_exception_executor(v_actor_id) THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'ACCESS_DENIED',
      'error', 'FOM, Finance, Admin, or Super Admin authorization is required');
  END IF;
  v_is_manager := public.is_cycle_exception_manager(v_actor_id);

  SELECT COALESCE(full_name, email, id::text)
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor_id;

  -- All retries for the same paid advance serialize here.
  PERFORM pg_advisory_xact_lock(hashtext('cea_advance:' || p_advance_id::text));

  -- Return the authoritative completed trace before re-validating a source
  -- advance whose status was intentionally changed by the first execution.
  SELECT *
  INTO v_existing_action
  FROM public.cycle_exception_actions
  WHERE mmp_file_id = p_mmp_id
    AND advance_id = p_advance_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND AND v_existing_action.executed THEN
    IF v_existing_action.decision IS DISTINCT FROM 'redirect'
       OR v_existing_action.mmp_site_entry_id IS DISTINCT FROM p_source_site_id THEN
      RETURN jsonb_build_object('ok', false, 'error_code', 'ACTION_CONFLICT',
        'error', 'A conflicting executed exception action already exists for this advance');
    END IF;

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'target_site_id', allocation.target_site_id,
        'target_site_name', allocation.target_site_name,
        'target_enumerator_id', allocation.target_enumerator_id,
        'same_enumerator', NOT allocation.cross_enumerator,
        'amount', allocation.amount,
        'fee_gross_amount', allocation.fee_gross_amount,
        'fee_prior_settled_amount', allocation.fee_prior_settled_amount,
        'fee_remaining_amount', allocation.fee_remaining_amount,
        'fee_status', allocation.fee_status,
        'journal_entry_id', allocation.gl_journal_entry_id
      ) ORDER BY allocation.allocation_order
    ), '[]'::jsonb)
    INTO v_result_allocations
    FROM public.cycle_exception_action_allocations allocation
    WHERE allocation.action_id = v_existing_action.id;

    RETURN jsonb_build_object(
      'ok', true,
      'action_id', v_existing_action.id,
      'executed_at', v_existing_action.executed_at,
      'journal_entry_id', v_existing_action.gl_journal_entry_id,
      'allocations', v_result_allocations,
      'unallocated_amount', v_existing_action.redirect_unallocated_amount,
      'message', 'Already executed (idempotent)'
    );
  END IF;
  IF FOUND THEN
    IF v_existing_action.decision IS DISTINCT FROM 'redirect'
       OR v_existing_action.mmp_site_entry_id IS DISTINCT FROM p_source_site_id THEN
      RETURN jsonb_build_object('ok', false, 'error_code', 'ACTION_CONFLICT',
        'error', 'A conflicting pending exception action already exists for this advance');
    END IF;
    v_reuse_action := true;
  END IF;

  IF p_justification IS NULL OR trim(p_justification) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'JUSTIFICATION_REQUIRED',
      'error', 'A redirect justification is required');
  END IF;
  IF p_allocations IS NULL
     OR jsonb_typeof(p_allocations) <> 'array'
     OR jsonb_array_length(p_allocations) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'ALLOCATION_REQUIRED',
      'error', 'Select at least one covered target allocation');
  END IF;

  v_allocation_count := jsonb_array_length(p_allocations);

  -- Lock the MMP first so Final Close cannot race this allocation.
  SELECT *
  INTO v_mmp
  FROM public.mmp_files
  WHERE id = p_mmp_id
  FOR UPDATE;
  IF NOT FOUND
     OR lower(COALESCE(v_mmp.status, '')) = 'closed'
     OR lower(COALESCE(v_mmp.cycle_status, '')) = 'closed' THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'MMP_CLOSED',
      'error', 'The source cycle is missing or already closed');
  END IF;
  v_country_id := NULLIF(to_jsonb(v_mmp) ->> 'country_id', '')::uuid;

  SELECT *
  INTO v_source_site
  FROM public.mmp_site_entries
  WHERE id = p_source_site_id
    AND mmp_file_id = p_mmp_id
  FOR UPDATE;
  IF NOT FOUND
     OR NOT (
       COALESCE(v_source_site.not_covered_flag, false)
       OR lower(COALESCE(v_source_site.status, '')) = 'not_covered'
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'SOURCE_NOT_ELIGIBLE',
      'error', 'The source must be a not-covered site in the selected cycle');
  END IF;
  IF v_source_site.accepted_by IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'SOURCE_ENUMERATOR_MISSING',
      'error', 'The source site must have an assigned enumerator');
  END IF;

  SELECT *
  INTO v_advance
  FROM public.down_payment_requests
  WHERE id = p_advance_id
    AND mmp_site_entry_id = p_source_site_id
  FOR UPDATE;
  IF NOT FOUND OR v_advance.status NOT IN ('paid', 'fully_paid', 'partially_paid') THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'ADVANCE_NOT_PAID',
      'error', 'A paid advance belonging to the not-covered source site is required');
  END IF;

  v_paid_amount := round(
    COALESCE(NULLIF(v_advance.total_paid_amount, 0), v_advance.requested_amount, 0)::numeric,
    2
  );
  IF v_paid_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'ADVANCE_AMOUNT_INVALID',
      'error', 'The paid advance amount must be greater than zero');
  END IF;
  v_source_refs := CASE
    WHEN jsonb_typeof(to_jsonb(v_advance) -> 'wallet_transaction_ids') = 'array'
      THEN to_jsonb(v_advance) -> 'wallet_transaction_ids'
    ELSE '[]'::jsonb
  END;

  -- Reject malformed IDs and duplicates before casting to UUID.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_allocations) item
    WHERE COALESCE(item ->> 'target_site_id', '') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'TARGET_ID_INVALID',
      'error', 'Every allocation must contain a valid target_site_id');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_allocations) item
    GROUP BY item ->> 'target_site_id'
    HAVING count(*) > 1
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'DUPLICATE_TARGET',
      'error', 'A covered target site may only appear once');
  END IF;

  -- Lock all targets in a stable order to avoid deadlocks between advances.
  PERFORM 1
  FROM public.mmp_site_entries target
  WHERE target.id IN (
    SELECT (item ->> 'target_site_id')::uuid
    FROM jsonb_array_elements(p_allocations) item
  )
  ORDER BY target.id
  FOR UPDATE;

  SELECT count(*)
  INTO v_target_count
  FROM public.mmp_site_entries target
  WHERE target.id IN (
    SELECT (item ->> 'target_site_id')::uuid
    FROM jsonb_array_elements(p_allocations) item
  );
  IF v_target_count <> v_allocation_count THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'TARGET_NOT_FOUND',
      'error', 'One or more selected target sites no longer exist');
  END IF;

  -- Normalize and validate every allocation against current locked fee values.
  FOR v_allocation IN
    SELECT item
    FROM jsonb_array_elements(p_allocations) item
    ORDER BY item ->> 'target_site_id'
  LOOP
    BEGIN
      v_amount := (v_allocation ->> 'amount')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RETURN jsonb_build_object('ok', false, 'error_code', 'AMOUNT_INVALID',
        'error', 'Every allocation amount must be a valid positive number');
    END;

    IF v_amount <= 0 OR v_amount <> round(v_amount, 2) THEN
      RETURN jsonb_build_object('ok', false, 'error_code', 'AMOUNT_INVALID',
        'error', 'Every allocation amount must be positive with no more than two decimal places');
    END IF;
    v_amount := round(v_amount, 2);

    SELECT *
    INTO v_target
    FROM public.mmp_site_entries
    WHERE id = (v_allocation ->> 'target_site_id')::uuid;

    IF v_target.id = p_source_site_id THEN
      RETURN jsonb_build_object('ok', false, 'error_code', 'SOURCE_TARGET_FORBIDDEN',
        'error', 'The original not-covered site cannot receive an Enumerator Fee allocation');
    END IF;
    IF v_target.mmp_file_id IS DISTINCT FROM p_mmp_id
       OR COALESCE(v_target.not_covered_flag, false)
       OR lower(COALESCE(v_target.status, '')) = 'not_covered' THEN
      RETURN jsonb_build_object('ok', false, 'error_code', 'TARGET_NOT_COVERED',
        'error', 'Every target must be a different covered site in the same cycle');
    END IF;
    IF v_target.accepted_by IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error_code', 'TARGET_ENUMERATOR_MISSING',
        'error', 'Every target site must have an assigned enumerator');
    END IF;

    v_cross_enumerator := v_source_site.accepted_by IS DISTINCT FROM v_target.accepted_by;
    IF v_cross_enumerator AND NOT v_is_manager THEN
      RETURN jsonb_build_object('ok', false, 'error_code', 'CROSS_ENUMERATOR_FORBIDDEN',
        'error', 'Cross-enumerator allocations require FOM, Admin, or Super Admin authorization');
    END IF;
    v_has_cross_enumerator := v_has_cross_enumerator OR v_cross_enumerator;

    v_gross_fee := round(
      (COALESCE(v_target.enumerator_fee, 0) + COALESCE(v_target.transport_fee, 0))::numeric,
      2
    );
    v_prior_settled := round(GREATEST(
      COALESCE(v_target.fee_paid_amount, 0),
      COALESCE(v_target.fee_cash_paid_amount, 0)
        + COALESCE(v_target.fee_advance_offset_amount, 0)
    )::numeric, 2);
    v_remaining_before := GREATEST(v_gross_fee - v_prior_settled, 0);

    IF v_gross_fee <= 0 OR v_remaining_before <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error_code', 'TARGET_HAS_NO_CAPACITY',
        'error', 'Target ' || COALESCE(v_target.site_name, v_target.id::text)
          || ' has no outstanding Enumerator Fee');
    END IF;
    IF v_amount > v_remaining_before THEN
      RETURN jsonb_build_object('ok', false, 'error_code', 'CAPACITY_CHANGED',
        'error', 'Allocation for ' || COALESCE(v_target.site_name, v_target.id::text)
          || ' exceeds its current remaining fee of SDG ' || v_remaining_before);
    END IF;

    v_remaining_after := round(GREATEST(v_remaining_before - v_amount, 0), 2);
    v_target_status := CASE WHEN v_remaining_after = 0 THEN 'paid' ELSE 'partially_paid' END;
    v_all_paid := v_all_paid AND v_target_status = 'paid';
    v_total_allocated := round(v_total_allocated + v_amount, 2);
    v_total_gross := round(v_total_gross + v_gross_fee, 2);
    v_total_prior := round(v_total_prior + v_prior_settled, 2);
    v_total_remaining := round(v_total_remaining + v_remaining_after, 2);
    v_allocation_order := v_allocation_order + 1;

    v_normalized := v_normalized || jsonb_build_array(jsonb_build_object(
      'allocation_order', v_allocation_order,
      'target_site_id', v_target.id,
      'target_site_name', v_target.site_name,
      'target_enumerator_id', v_target.accepted_by,
      'same_enumerator', NOT v_cross_enumerator,
      'amount', v_amount,
      'fee_gross_amount', v_gross_fee,
      'fee_prior_settled_amount', v_prior_settled,
      'fee_remaining_amount', v_remaining_after,
      'fee_status', v_target_status
    ));

    v_line_description := concat(
      'Advance ', p_advance_id::text,
      ' from not-covered site ', COALESCE(v_source_site.site_name, p_source_site_id::text),
      ' redirected to covered site ', COALESCE(v_target.site_name, v_target.id::text),
      ': SDG ', v_amount,
      '; fee gross SDG ', v_gross_fee,
      '; previously settled SDG ', v_prior_settled,
      '; remaining SDG ', v_remaining_after,
      '; status ', CASE WHEN v_target_status = 'paid' THEN 'fully paid' ELSE 'partially paid' END,
      '; reason: ', trim(p_justification)
    );
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', '__FEE_ACCOUNT__',
        'debit_credit', 'DR',
        'amount', v_amount,
        'currency', 'SDG',
        'description', v_line_description,
        'function', 'program'
      ),
      jsonb_build_object(
        'account_code', '__ADVANCE_ACCOUNT__',
        'debit_credit', 'CR',
        'amount', v_amount,
        'currency', 'SDG',
        'description', v_line_description,
        'function', 'program'
      )
    );
  END LOOP;

  IF v_total_allocated <> v_paid_amount THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'ADVANCE_NOT_FULLY_ALLOCATED',
      'error', 'The full paid advance must be allocated. Paid: SDG ' || v_paid_amount
        || '; allocated: SDG ' || v_total_allocated
        || '; unallocated: SDG ' || GREATEST(v_paid_amount - v_total_allocated, 0),
      'unallocated_amount', GREATEST(v_paid_amount - v_total_allocated, 0)
    );
  END IF;

  SELECT code INTO v_advance_account
  FROM public.acct_accounts
  WHERE code = ANY (ARRAY['1510', '151000'])
    AND is_postable = true
    AND (country_id = v_country_id OR country_id IS NULL)
  ORDER BY CASE WHEN country_id = v_country_id THEN 0 ELSE 1 END,
           array_position(ARRAY['1510', '151000'], code)
  LIMIT 1;
  IF v_advance_account IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'GL_ACCOUNT_MISSING',
      'error', 'Transport Advance GL account is missing (expected 1510 or 151000)');
  END IF;

  SELECT code INTO v_fee_account
  FROM public.acct_accounts
  WHERE code = ANY (ARRAY['5200', '520001', '520000'])
    AND is_postable = true
    AND (country_id = v_country_id OR country_id IS NULL)
  ORDER BY CASE WHEN country_id = v_country_id THEN 0 ELSE 1 END,
           array_position(ARRAY['5200', '520001', '520000'], code)
  LIMIT 1;
  IF v_fee_account IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'GL_ACCOUNT_MISSING',
      'error', 'Enumerator Fees GL account is missing (expected 5200, 520001, or 520000)');
  END IF;

  v_lines := replace(
    replace(v_lines::text, '"__FEE_ACCOUNT__"', to_jsonb(v_fee_account)::text),
    '"__ADVANCE_ACCOUNT__"', to_jsonb(v_advance_account)::text
  )::jsonb;

  IF v_reuse_action THEN
    v_action_id := v_existing_action.id;
    DELETE FROM public.cycle_exception_action_allocations WHERE action_id = v_action_id;
    UPDATE public.cycle_exception_actions
    SET decision = 'redirect',
        decision_amount = v_paid_amount,
        justification = trim(p_justification),
        target_site_id = CASE WHEN v_allocation_count = 1
          THEN (v_normalized -> 0 ->> 'target_site_id')::uuid ELSE NULL END,
        rollover_site_id = CASE WHEN v_allocation_count = 1
          THEN (v_normalized -> 0 ->> 'target_site_id')::uuid ELSE NULL END,
        rollover_site_name = CASE WHEN v_allocation_count = 1
          THEN v_normalized -> 0 ->> 'target_site_name'
          ELSE v_allocation_count || ' covered sites' END,
        execution_error = NULL,
        action_payload = jsonb_build_object('allocations', v_normalized),
        redirect_allocation_count = v_allocation_count,
        redirect_unallocated_amount = 0
    WHERE id = v_action_id;
  ELSE
    INSERT INTO public.cycle_exception_actions (
      mmp_file_id, mmp_site_entry_id, advance_id, enumerator_name, site_name,
      advance_amount, advance_status, decision, decision_amount, justification,
      target_site_id, rollover_site_id, rollover_site_name,
      executed, executed_by, executed_by_name, execution_note, created_by_name,
      action_payload, redirect_allocation_count, redirect_unallocated_amount,
      source_payment_references
    ) VALUES (
      p_mmp_id, p_source_site_id, p_advance_id, v_source_site.accepted_by,
      v_source_site.site_name, v_paid_amount, v_advance.status, 'redirect',
      v_paid_amount, trim(p_justification),
      CASE WHEN v_allocation_count = 1
        THEN (v_normalized -> 0 ->> 'target_site_id')::uuid ELSE NULL END,
      CASE WHEN v_allocation_count = 1
        THEN (v_normalized -> 0 ->> 'target_site_id')::uuid ELSE NULL END,
      CASE WHEN v_allocation_count = 1
        THEN v_normalized -> 0 ->> 'target_site_name'
        ELSE v_allocation_count || ' covered sites' END,
      false, v_actor_id, v_actor_name,
      'Multi-site fee allocation pending GL posting', v_actor_name,
      jsonb_build_object('allocations', v_normalized),
      v_allocation_count, 0, v_source_refs
    )
    RETURNING id INTO v_action_id;
  END IF;

  v_header_en := concat(
    'Cycle Close redirect — SDG ', v_paid_amount,
    ' from advance ', p_advance_id::text,
    ' on not-covered site ', COALESCE(v_source_site.site_name, p_source_site_id::text),
    ' allocated across ', v_allocation_count, ' covered site(s); reason: ',
    trim(p_justification)
  );
  v_header_ar := concat(
    'تحويل سلفة إغلاق الدورة — ', v_paid_amount,
    ' SDG من السلفة ', p_advance_id::text,
    ' إلى ', v_allocation_count, ' موقع/مواقع مغطاة'
  );

  -- Let any accounting error abort the transaction. No fee or audit row is
  -- committed unless the balanced journal succeeds.
  v_journal_id := public.acct_bridge_post_journal(
    'cycle_exception_actions',
    v_action_id,
    'exception_redirect_allocated',
    v_now::date,
    v_header_en,
    v_header_ar,
    v_lines,
    v_actor_id,
    v_country_id
  );

  INSERT INTO public.acct_gl_bridge_log
    (source_table, source_id, event_type, status, journal_entry_id)
  VALUES
    ('cycle_exception_actions', v_action_id, 'exception_redirect_allocated', 'success', v_journal_id);

  -- Persist each target trace, then update the target fee component. The
  -- allocation row exists before the target update so the fee-paid trigger can
  -- recognize that the advance component was already posted.
  FOR v_allocation IN
    SELECT item
    FROM jsonb_array_elements(v_normalized) item
    ORDER BY (item ->> 'allocation_order')::integer
  LOOP
    INSERT INTO public.cycle_exception_action_allocations (
      action_id, allocation_order, source_advance_id, source_site_id,
      target_site_id, target_site_name, source_enumerator_id,
      target_enumerator_id, cross_enumerator, amount, fee_gross_amount,
      fee_prior_settled_amount, fee_remaining_amount, fee_status,
      gl_journal_entry_id, source_payment_references, justification,
      created_by
    ) VALUES (
      v_action_id,
      (v_allocation ->> 'allocation_order')::integer,
      p_advance_id,
      p_source_site_id,
      (v_allocation ->> 'target_site_id')::uuid,
      v_allocation ->> 'target_site_name',
      v_source_site.accepted_by,
      v_allocation ->> 'target_enumerator_id',
      NOT (v_allocation ->> 'same_enumerator')::boolean,
      (v_allocation ->> 'amount')::numeric,
      (v_allocation ->> 'fee_gross_amount')::numeric,
      (v_allocation ->> 'fee_prior_settled_amount')::numeric,
      (v_allocation ->> 'fee_remaining_amount')::numeric,
      v_allocation ->> 'fee_status',
      v_journal_id,
      v_source_refs,
      trim(p_justification),
      v_actor_id
    );

    IF v_allocation ->> 'fee_status' = 'paid' THEN
      INSERT INTO public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      SELECT
        'mmp_site_entries',
        (v_allocation ->> 'target_site_id')::uuid,
        'enumerator_fee_paid',
        'success',
        v_journal_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.acct_gl_bridge_log existing_log
        WHERE existing_log.source_table = 'mmp_site_entries'
          AND existing_log.source_id = (v_allocation ->> 'target_site_id')::uuid
          AND existing_log.event_type = 'enumerator_fee_paid'
          AND existing_log.status = 'success'
      );
    END IF;

    UPDATE public.mmp_site_entries
    SET
      fee_paid_status = v_allocation ->> 'fee_status',
      fee_paid_amount = (v_allocation ->> 'fee_gross_amount')::numeric
        - (v_allocation ->> 'fee_remaining_amount')::numeric,
      fee_advance_offset_amount = COALESCE(fee_advance_offset_amount, 0)
        + (v_allocation ->> 'amount')::numeric,
      fee_paid_at = v_now,
      fee_paid_by = v_actor_id,
      fee_payment_method = CASE
        WHEN COALESCE(fee_cash_paid_amount, 0) > 0 THEN 'mixed_advance_cash'
        ELSE 'advance_offset'
      END,
      fee_payment_notes = concat_ws(
        '; ',
        NULLIF(fee_payment_notes, ''),
        'Cycle Close multi-site redirect: SDG ' || (v_allocation ->> 'amount'),
        'source advance ' || p_advance_id::text,
        'source not-covered site ' || COALESCE(v_source_site.site_name, p_source_site_id::text),
        'target covered site ' || (v_allocation ->> 'target_site_name'),
        'fee status ' || (v_allocation ->> 'fee_status'),
        'remaining fee SDG ' || (v_allocation ->> 'fee_remaining_amount'),
        'action ' || v_action_id::text,
        'GL journal ' || v_journal_id::text
      )
    WHERE id = (v_allocation ->> 'target_site_id')::uuid;
  END LOOP;

  UPDATE public.cycle_exception_actions
  SET executed = true,
      executed_at = v_now,
      executed_by = v_actor_id,
      executed_by_name = v_actor_name,
      execution_note = 'Advance allocated across covered-site Enumerator Fees',
      execution_error = NULL,
      gl_posted = true,
      gl_posted_at = v_now,
      gl_journal_entry_id = v_journal_id,
      redirect_fee_gross_amount = v_total_gross,
      redirect_fee_prior_settled_amount = v_total_prior,
      redirect_fee_settled_amount = v_total_allocated,
      redirect_fee_remaining_amount = v_total_remaining,
      redirect_fee_status = CASE WHEN v_all_paid THEN 'paid' ELSE 'partially_paid' END,
      redirect_allocation_count = v_allocation_count,
      redirect_unallocated_amount = 0,
      source_payment_references = v_source_refs,
      action_payload = COALESCE(action_payload, '{}'::jsonb) || jsonb_build_object(
        'allocations', v_normalized,
        'allocation_count', v_allocation_count,
        'total_allocated', v_total_allocated,
        'unallocated_amount', 0,
        'cross_enumerator', v_has_cross_enumerator,
        'source_payment_references', v_source_refs,
        'gl_journal_entry_id', v_journal_id
      )
  WHERE id = v_action_id;

  -- The original disbursement and wallet references stay on this record. Its
  -- status changes only to prevent a second recovery/payment workflow.
  UPDATE public.down_payment_requests
  SET status = 'cancelled',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'exception_action_id', v_action_id,
        'exception_decision', 'redirect',
        'redirect_allocation_count', v_allocation_count,
        'redirect_allocated_amount', v_total_allocated,
        'redirect_unallocated_amount', 0,
        'redirected_by', v_actor_id,
        'redirected_at', v_now,
        'gl_journal_entry_id', v_journal_id
      )
  WHERE id = p_advance_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'target_site_id', allocation.target_site_id,
      'target_site_name', allocation.target_site_name,
      'target_enumerator_id', allocation.target_enumerator_id,
      'same_enumerator', NOT allocation.cross_enumerator,
      'amount', allocation.amount,
      'fee_gross_amount', allocation.fee_gross_amount,
      'fee_prior_settled_amount', allocation.fee_prior_settled_amount,
      'fee_remaining_amount', allocation.fee_remaining_amount,
      'fee_status', allocation.fee_status,
      'journal_entry_id', allocation.gl_journal_entry_id
    ) ORDER BY allocation.allocation_order
  ), '[]'::jsonb)
  INTO v_result_allocations
  FROM public.cycle_exception_action_allocations allocation
  WHERE allocation.action_id = v_action_id;

  RETURN jsonb_build_object(
    'ok', true,
    'action_id', v_action_id,
    'executed_at', v_now,
    'journal_entry_id', v_journal_id,
    'allocations', v_result_allocations,
    'fee_gross_amount', v_total_gross,
    'fee_settled_amount', v_total_allocated,
    'fee_remaining_amount', v_total_remaining,
    'fee_status', CASE WHEN v_all_paid THEN 'paid' ELSE 'partially_paid' END,
    'unallocated_amount', 0,
    'message', 'Advance allocated across covered-site fees successfully'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_cycle_close_redirect_allocations(
  uuid, uuid, uuid, jsonb, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_cycle_close_redirect_allocations(
  uuid, uuid, uuid, jsonb, text
) TO authenticated;

COMMENT ON FUNCTION public.execute_cycle_close_redirect_allocations(
  uuid, uuid, uuid, jsonb, text
) IS 'Atomically allocates one complete paid advance across one or more covered-site Enumerator Fees.';

-- Later cash completion of a partially offset fee must post only the cash
-- component. Recognize both legacy single-target redirects and the normalized
-- multi-site allocation ledger.
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
  IF EXISTS (
    SELECT 1 FROM public.acct_gl_bridge_log
    WHERE source_table = 'mmp_site_entries'
      AND source_id = NEW.id
      AND event_type = 'enumerator_fee_paid'
      AND status = 'success'
  ) THEN
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
    UNION ALL
    SELECT 1
    FROM public.cycle_exception_action_allocations allocation
    JOIN public.cycle_exception_actions action ON action.id = allocation.action_id
    WHERE allocation.target_site_id = NEW.id
      AND action.decision = 'redirect'
      AND action.executed = true
  ) INTO v_has_redirect;

  IF v_has_redirect THEN
    -- Never trust client-supplied fee components for a redirected target. The
    -- allocation ledger is the authoritative source of advance offsets; legacy
    -- actions are included for review-compatible historical completions.
    SELECT COALESCE(sum(allocation.amount), 0)
    INTO v_authoritative_offset
    FROM public.cycle_exception_action_allocations allocation
    JOIN public.cycle_exception_actions action ON action.id = allocation.action_id
    WHERE allocation.target_site_id = NEW.id
      AND action.decision = 'redirect'
      AND action.executed = true;

    SELECT v_authoritative_offset + COALESCE(sum(
      COALESCE(action.redirect_fee_settled_amount, action.decision_amount, action.advance_amount)
    ), 0)
    INTO v_authoritative_offset
    FROM public.cycle_exception_actions action
    WHERE action.redirect_fee_site_entry_id = NEW.id
      AND action.decision = 'redirect'
      AND action.executed = true
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
    -- A redirected completion must remain partial if its cash/bank journal
    -- cannot post. Re-throw so the enclosing fee update is rolled back.
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

-- Finance review queue for pre-ledger Redirect actions. This view identifies
-- them but intentionally does not alter their fee rows or journals.
CREATE OR REPLACE VIEW public.cycle_legacy_redirect_review
WITH (security_invoker = true)
AS
SELECT
  action.id AS action_id,
  action.mmp_file_id,
  action.mmp_site_entry_id AS source_site_id,
  action.advance_id,
  action.advance_amount,
  action.target_site_id,
  action.redirect_fee_site_entry_id,
  action.gl_journal_entry_id,
  action.executed_at,
  CASE
    WHEN action.target_site_id IS NULL THEN 'Missing covered target'
    WHEN action.target_site_id = action.mmp_site_entry_id
      OR action.redirect_fee_site_entry_id = action.mmp_site_entry_id
      THEN 'Fee settlement points to the not-covered source site'
    ELSE 'Legacy single-target redirect — verify target fee and journal'
  END AS review_reason
FROM public.cycle_exception_actions action
WHERE action.decision = 'redirect'
  AND action.executed = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.cycle_exception_action_allocations allocation
    WHERE allocation.action_id = action.id
  );

GRANT SELECT ON public.cycle_legacy_redirect_review TO authenticated;

COMMIT;
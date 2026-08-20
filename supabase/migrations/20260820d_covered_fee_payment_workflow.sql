-- =============================================================================
-- Covered-site fee payment workflow
-- =============================================================================
-- Makes WFP confirmation a durable payment eligibility signal and records
-- enumerator fee disbursements through one protected, all-or-nothing operation.
-- A browser may upload a receipt, but it can never pay a claimed/not-covered site
-- or overpay a covered site by updating mmp_site_entries directly.

BEGIN;

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS wfp_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS wfp_confirmed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wfp_override_justification text,
  ADD COLUMN IF NOT EXISTS wfp_override_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wfp_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS fee_payment_reference text,
  ADD COLUMN IF NOT EXISTS fee_pre_fund_id uuid REFERENCES public.pre_fund_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_wfp_fee_queue
  ON public.mmp_site_entries (mmp_file_id, status, fee_paid_status)
  WHERE COALESCE(not_covered_flag, false) = false;

CREATE TABLE IF NOT EXISTS public.enumerator_fee_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mmp_site_entry_id uuid NOT NULL REFERENCES public.mmp_site_entries(id) ON DELETE RESTRICT,
  mmp_file_id uuid NOT NULL REFERENCES public.mmp_files(id) ON DELETE RESTRICT,
  enumerator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL,
  payment_date date NOT NULL,
  payment_reference text,
  notes text,
  receipt_url text NOT NULL,
  pre_fund_request_id uuid REFERENCES public.pre_fund_requests(id) ON DELETE SET NULL,
  pre_fund_transaction_id uuid REFERENCES public.pre_fund_transactions(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enumerator_fee_payments_site_created
  ON public.enumerator_fee_payments (mmp_site_entry_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enumerator_fee_payments_mmp
  ON public.enumerator_fee_payments (mmp_file_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.can_manage_covered_fee_payments()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND regexp_replace(lower(coalesce(p.role, '')), '[^a-z0-9]+', '', 'g')
        IN ('finance', 'financialadmin', 'accountant', 'admin', 'superadmin',
            'superadministrator', 'fom', 'fieldoperationmanager')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_mmp_site_assignments()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND regexp_replace(lower(coalesce(p.role, '')), '[^a-z0-9]+', '', 'g')
        IN ('superadmin', 'superadministrator', 'admin', 'fom',
            'fieldoperationmanager', 'coordinator', 'ict')
  );
$$;

ALTER TABLE public.enumerator_fee_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS enumerator_fee_payments_finance_select ON public.enumerator_fee_payments;
CREATE POLICY enumerator_fee_payments_finance_select
  ON public.enumerator_fee_payments
  FOR SELECT TO authenticated
  USING (public.can_manage_covered_fee_payments());

-- Standard WFP matching was previously stored only in browser session state.
-- Persist it before Cycle Close proceeds, so every payment screen applies the
-- exact same covered-site rule.
CREATE OR REPLACE FUNCTION public.persist_wfp_covered_sites(
  p_mmp_file_id uuid,
  p_site_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  IF NOT public.can_manage_covered_fee_payments() THEN
    RAISE EXCEPTION 'FORBIDDEN: only Finance, FOM, Admin, or Super Admin may confirm WFP-covered sites.';
  END IF;
  IF p_mmp_file_id IS NULL OR coalesce(array_length(p_site_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'updated', 0);
  END IF;

  UPDATE public.mmp_site_entries
     SET status = 'wfp_confirmed',
         not_covered_flag = false,
         wfp_confirmed_at = now(),
         wfp_confirmed_by = auth.uid()
   WHERE mmp_file_id = p_mmp_file_id
     AND id = ANY(p_site_ids)
     AND lower(trim(coalesce(status, ''))) <> 'not_covered';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> cardinality(ARRAY(SELECT DISTINCT unnest(p_site_ids))) THEN
    RAISE EXCEPTION 'COVERAGE_CONFLICT: one or more selected sites are not part of this cycle or are already marked not covered.';
  END IF;

  RETURN jsonb_build_object('ok', true, 'updated', v_updated);
END;
$$;

-- Each item must be the full current cash outstanding amount for one covered
-- site. Partial Redirect settlements are already represented by the advance
-- offset; allowing arbitrary cash partials would leave the existing one-journal
-- fee bridge with an ambiguous cash method and receipt.
CREATE OR REPLACE FUNCTION public.record_covered_enumerator_fee_payments(
  p_items jsonb,
  p_payment_method text,
  p_payment_date date,
  p_receipt_url text,
  p_payment_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_pre_fund_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_site public.mmp_site_entries%ROWTYPE;
  v_actor_id uuid := auth.uid();
  v_site_id uuid;
  v_amount numeric(18,2);
  v_gross_fee numeric(18,2);
  v_outstanding numeric(18,2);
  v_new_cash_total numeric(18,2);
  v_new_settled_total numeric(18,2);
  v_new_status text;
  v_payment_id uuid;
  v_payment_ids jsonb := '[]'::jsonb;
  v_total numeric(18,2) := 0;
  v_fund public.pre_fund_requests%ROWTYPE;
  v_pre_fund_txn_id uuid;
  v_seen_site_ids uuid[] := ARRAY[]::uuid[];
  v_allocation record;
  v_alloc_remaining numeric(18,2);
  v_payment_method text;
  v_enumerator_id uuid;
BEGIN
  IF NOT public.can_manage_covered_fee_payments() THEN
    RAISE EXCEPTION 'FORBIDDEN: only Finance, FOM, Admin, or Super Admin may record covered-site fee payments.';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'VALIDATION: select at least one covered site to pay.';
  END IF;
  IF nullif(trim(coalesce(p_receipt_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'VALIDATION: a payment receipt is required.';
  END IF;
  IF nullif(trim(coalesce(p_payment_method, '')), '') IS NULL THEN
    RAISE EXCEPTION 'VALIDATION: a payment method is required.';
  END IF;
  v_payment_method := regexp_replace(lower(trim(p_payment_method)), '[^a-z0-9]+', '_', 'g');
  -- The trigger below additionally checks this marker. SECURITY DEFINER is the
  -- primary authority, while the marker keeps the intent explicit if ownership
  -- changes during a future database migration.
  PERFORM set_config('pact.covered_fee_payment_write', 'on', true);

  -- Lock and validate every row before modifying any payment or fund balance.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_site_id := nullif(v_item ->> 'site_id', '')::uuid;
    v_amount := round(coalesce((v_item ->> 'amount')::numeric, 0), 2);
    IF v_site_id IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'VALIDATION: every fee payment needs a site and a positive amount.';
    END IF;
    IF v_site_id = ANY(v_seen_site_ids) THEN
      RAISE EXCEPTION 'VALIDATION: site % appears more than once in this payment batch.', v_site_id;
    END IF;
    v_seen_site_ids := array_append(v_seen_site_ids, v_site_id);

    SELECT * INTO v_site
      FROM public.mmp_site_entries
     WHERE id = v_site_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_FOUND: site % no longer exists.', v_site_id;
    END IF;
    IF lower(trim(coalesce(v_site.status, ''))) <> 'wfp_confirmed'
       OR coalesce(v_site.not_covered_flag, false) THEN
      RAISE EXCEPTION 'NOT_PAYABLE: % is not a WFP-confirmed covered site.', coalesce(v_site.site_name, v_site_id::text);
    END IF;
    IF v_site.accepted_by IS NULL
       OR trim(v_site.accepted_by) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'NOT_PAYABLE: % has no accepted enumerator to receive this fee.', coalesce(v_site.site_name, v_site_id::text);
    END IF;

    v_gross_fee := round(coalesce(v_site.enumerator_fee, 0) + coalesce(v_site.transport_fee, 0), 2);
    v_outstanding := round(greatest(
      v_gross_fee
      - coalesce(v_site.fee_cash_paid_amount, 0)
      - coalesce(v_site.fee_advance_offset_amount, 0),
      0
    ), 2);
    IF v_outstanding <= 0 THEN
      RAISE EXCEPTION 'ALREADY_SETTLED: % has no outstanding cash fee.', coalesce(v_site.site_name, v_site_id::text);
    END IF;
    IF abs(v_amount - v_outstanding) > 0.005 THEN
      RAISE EXCEPTION 'AMOUNT_MISMATCH: % requires exactly % SDG, received % SDG.',
        coalesce(v_site.site_name, v_site_id::text), v_outstanding, v_amount;
    END IF;
    v_total := v_total + v_amount;
  END LOOP;

  IF p_pre_fund_id IS NOT NULL THEN
    SELECT * INTO v_fund
      FROM public.pre_fund_requests
     WHERE id = p_pre_fund_id
     FOR UPDATE;
    IF NOT FOUND OR v_fund.status NOT IN ('active', 'low_balance') THEN
      RAISE EXCEPTION 'PRE_FUND_UNAVAILABLE: selected pre-fund is not active.';
    END IF;
    IF v_fund.start_date IS NOT NULL AND v_fund.start_date > coalesce(p_payment_date, current_date)
       OR v_fund.end_date IS NOT NULL AND v_fund.end_date < coalesce(p_payment_date, current_date) THEN
      RAISE EXCEPTION 'PRE_FUND_UNAVAILABLE: selected pre-fund is outside its active date range.';
    END IF;
    IF coalesce(v_fund.currency, 'SDG') <> 'SDG' THEN
      RAISE EXCEPTION 'PRE_FUND_CURRENCY: fee payments require an SDG pre-fund.';
    END IF;
    IF coalesce(v_fund.available_balance, 0) < v_total THEN
      RAISE EXCEPTION 'PRE_FUND_INSUFFICIENT: selected pre-fund has % SDG available but this batch requires % SDG.',
        coalesce(v_fund.available_balance, 0), v_total;
    END IF;
    UPDATE public.pre_fund_requests
       SET available_balance = available_balance - v_total,
           paid_amount = coalesce(paid_amount, 0) + v_total
     WHERE id = p_pre_fund_id;

    -- When a pre-fund uses person allocations, charge the covered site's
    -- accepted enumerator allocation too. Aggregate the batch first so two
    -- sites for the same person cannot each pass using the same balance.
    IF EXISTS (
      SELECT 1 FROM public.pre_fund_allocations
       WHERE pre_fund_request_id = p_pre_fund_id
    ) THEN
      FOR v_allocation IN
        SELECT s.accepted_by::uuid AS user_id,
               round(sum((item.value ->> 'amount')::numeric), 2) AS amount
          FROM jsonb_array_elements(p_items) AS item(value)
          JOIN public.mmp_site_entries s
            ON s.id = (item.value ->> 'site_id')::uuid
         WHERE s.accepted_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         GROUP BY s.accepted_by::uuid
      LOOP
        SELECT allocated_amount - spent_amount
          INTO v_alloc_remaining
          FROM public.pre_fund_allocations
         WHERE pre_fund_request_id = p_pre_fund_id
           AND user_id = v_allocation.user_id
         FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'PRE_FUND_ALLOCATION: enumerator % has no allocation on this pre-fund.',
            v_allocation.user_id;
        END IF;
        IF v_alloc_remaining < v_allocation.amount THEN
          RAISE EXCEPTION 'PRE_FUND_ALLOCATION: enumerator % has % SDG remaining but this batch needs % SDG.',
            v_allocation.user_id, v_alloc_remaining, v_allocation.amount;
        END IF;
        UPDATE public.pre_fund_allocations
           SET spent_amount = coalesce(spent_amount, 0) + v_allocation.amount
         WHERE pre_fund_request_id = p_pre_fund_id
           AND user_id = v_allocation.user_id;
      END LOOP;
    END IF;
  END IF;

  -- All validation passed. Insert one immutable payment row per site and then
  -- update the denormalized operational summary used by existing reports/GL.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_site_id := (v_item ->> 'site_id')::uuid;
    v_amount := round((v_item ->> 'amount')::numeric, 2);
    SELECT * INTO v_site FROM public.mmp_site_entries WHERE id = v_site_id FOR UPDATE;
    v_enumerator_id := v_site.accepted_by::uuid;

    INSERT INTO public.enumerator_fee_payments (
      mmp_site_entry_id, mmp_file_id, enumerator_id, amount, payment_method,
      payment_date, payment_reference, notes, receipt_url, pre_fund_request_id,
      created_by
    ) VALUES (
      v_site.id, v_site.mmp_file_id, v_enumerator_id, v_amount, v_payment_method,
      coalesce(p_payment_date, current_date), nullif(trim(p_payment_reference), ''),
      nullif(trim(p_notes), ''), p_receipt_url, p_pre_fund_id, v_actor_id
    )
    RETURNING id INTO v_payment_id;

    IF p_pre_fund_id IS NOT NULL THEN
      INSERT INTO public.pre_fund_transactions (
        pre_fund_request_id, transaction_type, amount, currency, reference,
        description, transaction_date, reconciled, source_table, source_id,
        created_by, user_id, receipt_url
      ) VALUES (
        p_pre_fund_id, 'payment', v_amount, 'SDG', nullif(trim(p_payment_reference), ''),
        'Covered-site enumerator fee: ' || coalesce(v_site.site_name, v_site.id::text),
        coalesce(p_payment_date, current_date), false, 'enumerator_fee_payments',
        v_payment_id, v_actor_id, v_enumerator_id, p_receipt_url
      )
      RETURNING id INTO v_pre_fund_txn_id;

      UPDATE public.enumerator_fee_payments
         SET pre_fund_transaction_id = v_pre_fund_txn_id
       WHERE id = v_payment_id;
    END IF;

    v_new_cash_total := round(coalesce(v_site.fee_cash_paid_amount, 0) + v_amount, 2);
    v_new_settled_total := round(least(
      coalesce(v_site.enumerator_fee, 0) + coalesce(v_site.transport_fee, 0),
      v_new_cash_total + coalesce(v_site.fee_advance_offset_amount, 0)
    ), 2);
    v_new_status := CASE
      WHEN v_new_settled_total + 0.005 >= coalesce(v_site.enumerator_fee, 0) + coalesce(v_site.transport_fee, 0)
        THEN 'paid'
      ELSE 'partially_paid'
    END;

    UPDATE public.mmp_site_entries
       SET fee_paid_status = v_new_status,
           fee_paid_amount = v_new_settled_total,
           fee_cash_paid_amount = v_new_cash_total,
           fee_paid_at = coalesce(p_payment_date, current_date)::timestamptz,
           fee_paid_by = v_actor_id,
            fee_payment_method = v_payment_method,
           fee_payment_notes = concat_ws(E'\n', nullif(fee_payment_notes, ''), nullif(trim(p_notes), '')),
           fee_payment_reference = nullif(trim(p_payment_reference), ''),
           fee_receipt_url = p_receipt_url,
           fee_receipt_uploaded_at = now(),
           fee_receipt_uploaded_by = v_actor_id,
           fee_pre_fund_id = p_pre_fund_id
     WHERE id = v_site.id;

    v_payment_ids := v_payment_ids || jsonb_build_array(v_payment_id);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'payment_ids', v_payment_ids,
    'count', jsonb_array_length(v_payment_ids),
    'total_amount', v_total,
    'pre_fund_id', p_pre_fund_id
  );
END;
$$;

-- Direct table UPDATE is deliberately broad for normal field operations. Do not
-- rely on that legacy policy for financial state: payment evidence and totals
-- must be written by a SECURITY DEFINER workflow, while a manual WFP override
-- must include its authenticated audit record.
-- Acceptance determines the eventual payment recipient. It is therefore a
-- protected state transition too: field staff can accept for themselves and
-- operations managers can assign a collector, but neither action can be forged
-- through the broad legacy table UPDATE policy.
CREATE OR REPLACE FUNCTION public.set_mmp_site_entry_acceptance(
  p_site_id uuid,
  p_accepted_by uuid,
  p_status text DEFAULT 'accepted',
  p_accepted_at timestamptz DEFAULT now(),
  p_enumerator_fee numeric DEFAULT NULL,
  p_transport_fee numeric DEFAULT NULL,
  p_cost numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_site public.mmp_site_entries%ROWTYPE;
  v_is_manager boolean := false;
  v_cycle_status text;
  v_assigned_to text;
BEGIN
  IF v_actor_id IS NULL OR p_site_id IS NULL OR p_accepted_by IS NULL THEN
    RAISE EXCEPTION 'VALIDATION: a signed-in user, site, and recipient are required.';
  END IF;

  v_is_manager := public.can_manage_mmp_site_assignments();

  IF p_accepted_by <> v_actor_id AND NOT v_is_manager THEN
    RAISE EXCEPTION 'FORBIDDEN: staff may accept a site only for themselves.';
  END IF;

  SELECT s.*
    INTO v_site
    FROM public.mmp_site_entries s
   WHERE id = p_site_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: site % no longer exists.', p_site_id;
  END IF;
  SELECT cycle_status INTO v_cycle_status
    FROM public.mmp_files
   WHERE id = v_site.mmp_file_id;
  IF v_site.accepted_by IS NOT NULL
     AND v_site.accepted_by <> p_accepted_by::text
     AND NOT v_is_manager THEN
    RAISE EXCEPTION 'ALREADY_ACCEPTED: this site belongs to another enumerator.';
  END IF;
  IF lower(trim(coalesce(v_cycle_status, ''))) = 'closed' THEN
    RAISE EXCEPTION 'CYCLE_CLOSED: a closed cycle cannot be accepted or reassigned.';
  END IF;
  IF lower(trim(coalesce(v_site.status, ''))) = 'wfp_confirmed'
     OR coalesce(v_site.not_covered_flag, false) THEN
    RAISE EXCEPTION 'ACCEPTANCE_LOCKED: covered confirmation and not-covered decisions cannot change the payment recipient.';
  END IF;

  -- A field user may only accept a site that the server records as assigned to
  -- them. Operations managers are the sole exception, used by the individual
  -- dispatch flow. An unassigned site must go through the existing claim RPC.
  IF NOT v_is_manager THEN
    v_assigned_to := v_site.forwarded_to_user_id::text;
    IF v_assigned_to IS NULL OR v_assigned_to <> v_actor_id::text THEN
      RAISE EXCEPTION 'NOT_ASSIGNED: accept only a site assigned to you; use the claim flow for open sites.';
    END IF;
    IF lower(trim(coalesce(v_site.status, ''))) NOT IN ('assigned', 'smart assigned', 'dispatched', 'accepted') THEN
      RAISE EXCEPTION 'INVALID_ACCEPTANCE_STATE: this site cannot be accepted from its current state.';
    END IF;
  END IF;

  PERFORM set_config('pact.mmp_acceptance_write', 'on', true);
  UPDATE public.mmp_site_entries
     SET accepted_by = p_accepted_by::text,
         accepted_at = coalesce(p_accepted_at, now()),
         -- Only an ordinary acceptance may transition status. Individual
         -- dispatch already writes its status before calling this function.
         status = CASE
           WHEN lower(trim(coalesce(p_status, ''))) = 'accepted' THEN 'accepted'
           ELSE status
         END,
         -- Acceptance clients calculate an initial fee breakdown. Preserve
         -- approved values already on the row, while retaining that initial
         -- breakdown for newly accepted legacy rows.
         enumerator_fee = coalesce(enumerator_fee, p_enumerator_fee),
         transport_fee = coalesce(transport_fee, p_transport_fee),
         cost = coalesce(cost, p_cost),
         updated_at = now()
   WHERE id = p_site_id;

  RETURN jsonb_build_object('ok', true, 'site_id', p_site_id, 'accepted_by', p_accepted_by);
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_mmp_site_entry_financial_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_table_owner name;
  v_financial_change boolean;
  v_eligibility_change boolean;
  v_authorized_direct_override boolean;
BEGIN
  SELECT pg_get_userbyid(c.relowner)
    INTO v_table_owner
    FROM pg_class c
   WHERE c.oid = 'public.mmp_site_entries'::regclass;

  v_financial_change :=
    NEW.fee_paid_status IS DISTINCT FROM OLD.fee_paid_status
    OR NEW.fee_paid_amount IS DISTINCT FROM OLD.fee_paid_amount
    OR NEW.fee_cash_paid_amount IS DISTINCT FROM OLD.fee_cash_paid_amount
    OR NEW.fee_advance_offset_amount IS DISTINCT FROM OLD.fee_advance_offset_amount
    OR NEW.fee_unallocated_amount IS DISTINCT FROM OLD.fee_unallocated_amount
    OR NEW.fee_paid_at IS DISTINCT FROM OLD.fee_paid_at
    OR NEW.fee_paid_by IS DISTINCT FROM OLD.fee_paid_by
    OR NEW.fee_payment_method IS DISTINCT FROM OLD.fee_payment_method
    OR NEW.fee_payment_notes IS DISTINCT FROM OLD.fee_payment_notes
    OR NEW.fee_receipt_url IS DISTINCT FROM OLD.fee_receipt_url
    OR NEW.fee_receipt_uploaded_at IS DISTINCT FROM OLD.fee_receipt_uploaded_at
    OR NEW.fee_receipt_uploaded_by IS DISTINCT FROM OLD.fee_receipt_uploaded_by
    OR NEW.fee_payment_reference IS DISTINCT FROM OLD.fee_payment_reference
    OR NEW.fee_pre_fund_id IS DISTINCT FROM OLD.fee_pre_fund_id;

  -- SECURITY DEFINER payment/redirect/reversal procedures execute as the
  -- database owner. A direct authenticated API update never does.
  IF v_financial_change
     AND current_user <> v_table_owner
     AND current_setting('pact.covered_fee_payment_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'PROTECTED_FEE_STATE: use the covered-site payment or authorized exception workflow.';
  END IF;

  v_authorized_direct_override :=
    NEW.status = 'wfp_confirmed'
    AND OLD.status IS DISTINCT FROM 'wfp_confirmed'
    AND public.can_manage_covered_fee_payments()
    AND NEW.wfp_override_by = auth.uid()
    AND nullif(trim(coalesce(NEW.wfp_override_justification, '')), '') IS NOT NULL
    AND NEW.wfp_override_at IS NOT NULL;

  -- Standard matching is persisted by persist_wfp_covered_sites(). The only
  -- direct alternative is an authorized, fully-audited manual override.
  IF NEW.status = 'wfp_confirmed'
     AND OLD.status IS DISTINCT FROM 'wfp_confirmed'
     AND current_user <> v_table_owner THEN
    IF NOT v_authorized_direct_override THEN
      RAISE EXCEPTION 'PROTECTED_COVERAGE_STATE: WFP confirmation requires matching persistence or an authorized audited override.';
    END IF;
  END IF;

  -- Do not let a broad legacy UPDATE policy manufacture a recipient or clear a
  -- coverage exclusion after a site is confirmed. The audited override may
  -- clear a prior not-covered flag in the same operation, but never assign a
  -- payee; a later assignment/reassignment must use its own server workflow.
  v_eligibility_change :=
    NEW.accepted_by IS DISTINCT FROM OLD.accepted_by
    OR NEW.not_covered_flag IS DISTINCT FROM OLD.not_covered_flag
    OR NEW.wfp_confirmed_at IS DISTINCT FROM OLD.wfp_confirmed_at
    OR NEW.wfp_confirmed_by IS DISTINCT FROM OLD.wfp_confirmed_by
    OR NEW.wfp_override_justification IS DISTINCT FROM OLD.wfp_override_justification
    OR NEW.wfp_override_by IS DISTINCT FROM OLD.wfp_override_by
    OR NEW.wfp_override_at IS DISTINCT FROM OLD.wfp_override_at;

  IF NEW.accepted_by IS DISTINCT FROM OLD.accepted_by
     AND current_user <> v_table_owner
     AND current_setting('pact.mmp_acceptance_write', true) IS DISTINCT FROM 'on' THEN
    -- Existing Super Admin repair/reset flows may clear a recipient. They can
    -- never assign or reassign one without the protected RPC.
    IF NEW.accepted_by IS NOT NULL OR NOT public.can_manage_covered_fee_payments() THEN
      RAISE EXCEPTION 'PROTECTED_ACCEPTANCE_STATE: use the authorized site acceptance or assignment workflow.';
    END IF;
  END IF;

  -- The acceptance RPC trusts forwarded_to_user_id as assignment authority.
  -- It is never safe for a generic authenticated UPDATE to change that field.
  IF NEW.forwarded_to_user_id IS DISTINCT FROM OLD.forwarded_to_user_id
     AND current_user <> v_table_owner
     AND NOT public.can_manage_mmp_site_assignments() THEN
    RAISE EXCEPTION 'PROTECTED_ASSIGNMENT_STATE: use an authorized dispatch or forwarding workflow.';
  END IF;

  IF v_eligibility_change
     AND (OLD.status = 'wfp_confirmed' OR NEW.status = 'wfp_confirmed')
     AND current_user <> v_table_owner
     AND NOT (
       v_authorized_direct_override
       AND NEW.accepted_by IS NOT DISTINCT FROM OLD.accepted_by
       AND NEW.not_covered_flag = false
     ) THEN
    RAISE EXCEPTION 'PROTECTED_ELIGIBILITY_STATE: confirmed-site payee and coverage flags require an authorized server workflow.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_mmp_site_entry_financial_state ON public.mmp_site_entries;
CREATE TRIGGER trg_guard_mmp_site_entry_financial_state
  BEFORE UPDATE ON public.mmp_site_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_mmp_site_entry_financial_state();

-- A Final Close can be reached by routes other than the browser wizard. Enforce
-- the same persisted covered-only balance rule at the mmp_files boundary.
CREATE OR REPLACE FUNCTION public.guard_mmp_close_covered_fee_settlement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_unpaid_count integer;
BEGIN
  IF NEW.cycle_status = 'closed' AND OLD.cycle_status IS DISTINCT FROM 'closed' THEN
    SELECT count(*)
      INTO v_unpaid_count
      FROM public.mmp_site_entries s
     WHERE s.mmp_file_id = NEW.id
       AND s.accepted_by IS NOT NULL
       AND lower(trim(coalesce(s.status, ''))) = 'wfp_confirmed'
       AND coalesce(s.not_covered_flag, false) = false
       AND (
         coalesce(s.enumerator_fee, 0) + coalesce(s.transport_fee, 0)
         - coalesce(s.fee_cash_paid_amount, 0)
         - coalesce(s.fee_advance_offset_amount, 0)
       ) > 0.005;
    IF v_unpaid_count > 0 THEN
      RAISE EXCEPTION 'COVERED_FEES_UNPAID: % WFP-confirmed covered-site fee balance(s) remain unpaid.', v_unpaid_count;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_mmp_close_covered_fee_settlement ON public.mmp_files;
CREATE TRIGGER trg_guard_mmp_close_covered_fee_settlement
  BEFORE UPDATE OF cycle_status ON public.mmp_files
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_mmp_close_covered_fee_settlement();

REVOKE ALL ON FUNCTION public.persist_wfp_covered_sites(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.persist_wfp_covered_sites(uuid, uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.record_covered_enumerator_fee_payments(jsonb, text, date, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_covered_enumerator_fee_payments(jsonb, text, date, text, text, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.set_mmp_site_entry_acceptance(uuid, uuid, text, timestamptz, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_mmp_site_entry_acceptance(uuid, uuid, text, timestamptz, numeric, numeric, numeric) TO authenticated;

COMMENT ON FUNCTION public.record_covered_enumerator_fee_payments(jsonb, text, date, text, text, text, uuid) IS
  'Atomically records one or more full outstanding cash payments for WFP-confirmed covered sites only. Receipt, duplicate, overpayment, and pre-fund balance checks are enforced server-side.';

COMMIT;
-- Dedicated Pre-Fund payment capabilities.
-- Payment is still a shared-fund operation: allocation rows are never required,
-- capped, or incremented by Cost Submission payments.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.permissions'::regclass
      AND conname = 'permissions_action_check'
  ) THEN
    ALTER TABLE public.permissions DROP CONSTRAINT permissions_action_check;
  END IF;
  ALTER TABLE public.permissions ADD CONSTRAINT permissions_action_check CHECK (action = ANY (ARRAY[
    'create','read','update','delete','approve','assign','archive','restore',
    'override','export','submit','full_report','state_report','hub_report',
    'mark_paid','use_for_payment'
  ]::text[]));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Preserve payment ability for the existing Finance/Admin roles without
-- granting this capability to operational field roles.
INSERT INTO public.permissions (role_id, resource, action)
SELECT r.id, v.resource, v.action
FROM public.roles r
CROSS JOIN (VALUES
  ('cost_submissions', 'mark_paid'),
  ('pre_funding', 'use_for_payment')
) AS v(resource, action)
WHERE lower(replace(replace(r.name, ' ', '_'), '-', '_')) IN
  ('admin', 'financialadmin', 'financial_admin', 'finance', 'accountant')
  AND r.is_active = true
ON CONFLICT (role_id, resource, action) DO NOTHING;

CREATE OR REPLACE FUNCTION public._assert_pre_fund_payment_access()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Super Admin is deliberately checked first, before action restrictions.
  IF public.is_super_admin(auth.uid()) THEN
    RETURN;
  END IF;
  PERFORM public.assert_resource_permission('cost_submissions', 'mark_paid');
  PERFORM public.assert_resource_permission('pre_funding', 'use_for_payment');
END;
$$;

REVOKE ALL ON FUNCTION public._assert_pre_fund_payment_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._assert_pre_fund_payment_access() TO authenticated, service_role;

COMMENT ON FUNCTION public._assert_pre_fund_payment_access() IS
  'Authorizes shared Pre-Fund payment posting. Personal allocations are not an authorization or balance gate.';

-- Keep the established Finance/Admin role guard for every existing workflow.
-- The session flag only permits an already-authorized shared-payment RPC to
-- call the legacy atomic linker without requiring a second, unrelated role
-- check. It is transaction-local and cannot be set by the browser request.
CREATE OR REPLACE FUNCTION public._assert_finance_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_setting('app.pre_fund_payment_authorized', true) = 'on' THEN
    RETURN;
  END IF;

  SELECT lower(trim(role)) INTO v_role
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN (
    'super_admin', 'superadmin',
    'admin', 'administrator',
    'finance', 'finance admin',
    'financialadmin', 'financial_admin',
    'accountant'
  ) THEN
    RAISE EXCEPTION 'Access denied: finance or admin role required (role="%").',
      COALESCE(v_role, '<null>');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._assert_finance_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._assert_finance_role() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._record_shared_cost_submission_payment(
  p_source_id UUID,
  p_fund_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_payment_date DATE,
  p_created_by UUID,
  p_receipt_url TEXT,
  p_notes TEXT,
  p_payment_event_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.operational_cost_submissions%ROWTYPE;
  v_fund public.pre_fund_requests%ROWTYPE;
  v_txn_id UUID;
  v_key TEXT := NULLIF(BTRIM(p_payment_event_key), '');
  v_actor_id UUID := COALESCE(auth.uid(), p_created_by);
  v_new_paid NUMERIC;
  v_due NUMERIC;
  v_result JSONB;
BEGIN
  PERFORM public._assert_pre_fund_payment_access();
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero.'; END IF;
  IF v_key IS NULL THEN v_key := 'source-payment:operational_cost_submissions:' || p_source_id || ':' || gen_random_uuid(); END IF;

  -- Idempotent retries must return before source status, due amount, or fund
  -- balance checks. Authorization still runs above, and the event identity
  -- must match all three immutable dimensions before returning.
  IF EXISTS (SELECT 1 FROM public.pre_fund_transactions WHERE idempotency_key = v_key) THEN
    SELECT id INTO v_txn_id
    FROM public.pre_fund_transactions
    WHERE idempotency_key = v_key
      AND source_table = 'operational_cost_submissions'
      AND source_id = p_source_id
      AND pre_fund_request_id = p_fund_id;
    IF v_txn_id IS NULL THEN
      RAISE EXCEPTION 'This payment operation key was already used for a different source or Pre-Fund.';
    END IF;
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'transaction_id', v_txn_id);
  END IF;

  SELECT * INTO v_source FROM public.operational_cost_submissions WHERE id = p_source_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operational cost submission not found.'; END IF;
  IF v_source.status NOT IN ('approved', 'partially_paid') THEN
    RAISE EXCEPTION 'Operational cost submission is not ready for payment (status="%").', v_source.status;
  END IF;
  v_due := COALESCE(v_source.amount_cents, 0)::NUMERIC / 100;
  v_new_paid := COALESCE(v_source.amount_paid_cents, 0)::NUMERIC / 100 + p_amount;
  IF v_new_paid > v_due THEN RAISE EXCEPTION 'Payment exceeds the remaining approved cost.'; END IF;
  IF v_source.currency IS DISTINCT FROM p_currency THEN
    RAISE EXCEPTION 'Payment currency % does not match source currency %.', p_currency, v_source.currency;
  END IF;

  SELECT * INTO v_fund FROM public.pre_fund_requests
  WHERE id = p_fund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found.'; END IF;
  IF v_fund.status NOT IN ('active', 'low_balance') THEN RAISE EXCEPTION 'Pre-Fund is not active.'; END IF;
  IF v_fund.currency IS DISTINCT FROM p_currency THEN
    RAISE EXCEPTION 'Payment currency % does not match fund currency %.', p_currency, v_fund.currency;
  END IF;
  IF COALESCE(v_fund.available_balance, 0) < p_amount THEN
    RAISE EXCEPTION 'Insufficient available Pre-Fund balance.';
  END IF;
  PERFORM set_config('app.pre_fund_payment_rpc', 'on', true);
  UPDATE public.operational_cost_submissions
  SET status = CASE WHEN v_new_paid >= v_due THEN 'paid' ELSE 'partially_paid' END,
      amount_paid_cents = ROUND(v_new_paid * 100),
      paid_at = COALESCE(paid_at, now()), paid_by = COALESCE(paid_by, v_actor_id),
      payment_proof_url = COALESCE(p_receipt_url, payment_proof_url),
      payment_proof_notes = COALESCE(p_notes, payment_proof_notes),
      payment_proof_uploaded_at = CASE WHEN p_receipt_url IS NOT NULL THEN now() ELSE payment_proof_uploaded_at END,
      updated_at = now()
  WHERE id = p_source_id;

  -- The legacy atomic linker is retained for its GL bridge and immutable
  -- ledger accounting. Passing NULL for p_user_id deliberately prevents the
  -- old personal-allocation branch from participating in a shared OCS payment.
  PERFORM set_config('app.pre_fund_payment_authorized', 'on', true);
  v_result := public.link_payment_atomically_rpc(
    p_fund_id::TEXT, p_amount, p_currency, 'operational_cost_submissions',
    p_source_id, v_source.reference_number, v_source.description, p_payment_date,
    v_actor_id, NULL, p_receipt_url, v_key
  );
  IF COALESCE((v_result ->> 'success')::BOOLEAN, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Pre-Fund link failed: %', COALESCE(v_result ->> 'error', 'unknown error');
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public._record_shared_cost_submission_payment(UUID,UUID,NUMERIC,TEXT,DATE,UUID,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._record_shared_cost_submission_payment(UUID,UUID,NUMERIC,TEXT,DATE,UUID,TEXT,TEXT,TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_payment_eligible_pre_funds(p_currency TEXT)
RETURNS TABLE(id UUID, name TEXT, currency TEXT, available_balance NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    PERFORM public.assert_resource_permission('cost_submissions', 'mark_paid');
    PERFORM public.assert_resource_permission('pre_funding', 'use_for_payment');
  END IF;
  RETURN QUERY
  SELECT f.id, f.name, f.currency, f.available_balance
  FROM public.pre_fund_requests f
  WHERE f.status IN ('active', 'low_balance')
    AND f.currency = p_currency
  ORDER BY f.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_payment_eligible_pre_funds(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payment_eligible_pre_funds(TEXT) TO authenticated;

-- Preserve the previously deployed implementation under a private name before
-- replacing the public entry point. The guarded block makes this safe to rerun.
DO $$
BEGIN
  IF to_regprocedure('public.record_required_pre_fund_payment_rpc(text,uuid,uuid,numeric,text,date,uuid,text,text,text)') IS NOT NULL
     AND to_regprocedure('public.record_required_pre_fund_payment_legacy_rpc(text,uuid,uuid,numeric,text,date,uuid,text,text,text)') IS NULL THEN
    ALTER FUNCTION public.record_required_pre_fund_payment_rpc(
      TEXT,UUID,UUID,NUMERIC,TEXT,DATE,UUID,TEXT,TEXT,TEXT
    ) RENAME TO record_required_pre_fund_payment_legacy_rpc;
  END IF;
END $$;

-- The canonical RPC remains atomic and performs the row lock, exact currency
-- check, and current-balance check. This wrapper adds the dedicated capability
-- check before it mutates either the source or the fund.
CREATE OR REPLACE FUNCTION public.record_required_pre_fund_payment_rpc(
  p_source_table TEXT,
  p_source_id UUID,
  p_fund_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_created_by UUID DEFAULT NULL,
  p_receipt_url TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_payment_event_key TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_source_table = 'operational_cost_submissions' THEN
    RETURN public._record_shared_cost_submission_payment(
      p_source_id, p_fund_id, p_amount, p_currency, p_payment_date,
      p_created_by, p_receipt_url, p_notes, p_payment_event_key
    );
  ELSE
    PERFORM public._assert_finance_role();
  END IF;

  -- Delegate to the previous atomic implementation. It locks the source and
  -- fund rows, validates status/currency/current balance, and inserts the
  -- immutable event in the same transaction.
  v_result := public.record_required_pre_fund_payment_legacy_rpc(
    p_source_table, p_source_id, p_fund_id, p_amount, p_currency,
    p_payment_date, p_created_by, p_receipt_url, p_notes, p_payment_event_key
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_required_pre_fund_payment_rpc(
  TEXT,UUID,UUID,NUMERIC,TEXT,DATE,UUID,TEXT,TEXT,TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_required_pre_fund_payment_rpc(
  TEXT,UUID,UUID,NUMERIC,TEXT,DATE,UUID,TEXT,TEXT,TEXT
) TO authenticated;

-- Recreate the reconciliation wrapper so OCS calls the dedicated payment
-- path before the legacy Finance-role guard. The Down-Payment branch is kept
-- identical to 20260830_reconcile_legacy_down_payment_source_totals.sql.
CREATE OR REPLACE FUNCTION public.record_reconciled_required_pre_fund_payment_rpc(
  p_source_table TEXT,
  p_source_id UUID,
  p_fund_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_created_by UUID DEFAULT NULL,
  p_receipt_url TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_payment_event_key TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.down_payment_requests%ROWTYPE;
  v_due_amount NUMERIC;
  v_recorded_paid NUMERIC;
  v_linked_paid NUMERIC;
  v_result JSONB;
  v_reconciled BOOLEAN := false;
BEGIN
  -- OCS must use the dedicated two-capability path, not the legacy role guard.
  IF p_source_table = 'operational_cost_submissions' THEN
    RETURN public._record_shared_cost_submission_payment(
      p_source_id, p_fund_id, p_amount, p_currency, p_payment_date,
      p_created_by, p_receipt_url, p_notes, p_payment_event_key
    );
  END IF;

  PERFORM public._assert_finance_role();

  -- Preserve the canonical RPC's idempotent retry behavior before inspecting a
  -- source that may already have moved to fully_paid.
  IF NULLIF(BTRIM(p_payment_event_key), '') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.pre_fund_transactions t
       WHERE t.idempotency_key = BTRIM(p_payment_event_key)
         AND t.pre_fund_request_id = p_fund_id
         AND t.source_table = p_source_table
         AND t.source_id = p_source_id
     )
  THEN
    RETURN public.record_required_pre_fund_payment_rpc(
      p_source_table, p_source_id, p_fund_id, p_amount, p_currency,
      p_payment_date, p_created_by, p_receipt_url, p_notes,
      p_payment_event_key
    );
  END IF;

  IF p_source_table = 'down_payment_requests' THEN
    SELECT * INTO v_source
    FROM public.down_payment_requests
    WHERE id = p_source_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Down-payment request not found.'; END IF;

    v_due_amount := COALESCE(
      NULLIF(v_source.approved_amount::NUMERIC, 0),
      NULLIF((v_source.metadata ->> 'approved_amount')::NUMERIC, 0),
      v_source.requested_amount, 0
    );
    v_recorded_paid := COALESCE(v_source.total_paid_amount, 0);

    SELECT GREATEST(COALESCE(SUM(
      CASE
        WHEN t.transaction_type = 'payment' THEN t.amount
        WHEN t.transaction_type IN ('reversal', 'return') THEN -t.amount
        ELSE 0
      END
    ), 0), 0) INTO v_linked_paid
    FROM public.pre_fund_transactions t
    WHERE t.source_table = 'down_payment_requests'
      AND t.source_id = p_source_id;

    IF v_linked_paid > v_recorded_paid THEN
      IF v_linked_paid > v_due_amount THEN
        RAISE EXCEPTION
          'This advance is over-linked: % is approved, but % remains linked in the immutable Pre-Fund ledger. Reverse the incorrect prior payment before paying again.',
          v_due_amount, v_linked_paid;
      END IF;
      IF v_linked_paid + p_amount > v_due_amount THEN
        RAISE EXCEPTION
          'Payment exceeds the true remaining advance after legacy reconciliation (% approved, % already linked, % requested).',
          v_due_amount, v_linked_paid, p_amount;
      END IF;

      PERFORM set_config('app.pre_fund_payment_rpc', 'on', true);
      UPDATE public.down_payment_requests
      SET status = CASE WHEN v_linked_paid >= v_due_amount THEN 'fully_paid' ELSE 'partially_paid' END,
          total_paid_amount = v_linked_paid,
          remaining_amount = GREATEST(v_due_amount - v_linked_paid, 0),
          metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
            'pre_fund_source_total_reconciled', true,
            'pre_fund_source_total_reconciled_from', v_recorded_paid,
            'pre_fund_source_total_reconciled_to', v_linked_paid,
            'pre_fund_source_total_reconciled_at', now()
          ),
          updated_at = now()
      WHERE id = p_source_id;
      v_reconciled := true;
    END IF;
  END IF;

  v_result := public.record_required_pre_fund_payment_rpc(
    p_source_table, p_source_id, p_fund_id, p_amount, p_currency,
    p_payment_date, p_created_by, p_receipt_url, p_notes, p_payment_event_key
  );
  RETURN v_result || jsonb_build_object(
    'legacy_source_total_reconciled', v_reconciled,
    'previous_recorded_paid_amount', v_recorded_paid,
    'previous_linked_paid_amount', v_linked_paid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_reconciled_required_pre_fund_payment_rpc(
  TEXT,UUID,UUID,NUMERIC,TEXT,DATE,UUID,TEXT,TEXT,TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_reconciled_required_pre_fund_payment_rpc(
  TEXT,UUID,UUID,NUMERIC,TEXT,DATE,UUID,TEXT,TEXT,TEXT
) TO authenticated;

-- The source transition trigger still protects direct REST writes and all
-- Down-Payment transitions. Only the atomic OCS payment path may use the
-- transaction-local bypass after its dedicated two-action assertion.
CREATE OR REPLACE FUNCTION public.guard_finance_resource_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  before_row jsonb := to_jsonb(OLD);
  after_row jsonb := to_jsonb(NEW);
  resource text;
  approval_changed boolean;
  payment_changed boolean;
BEGIN
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'operational_cost_submissions'
     AND current_setting('app.pre_fund_payment_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;
  resource := CASE WHEN TG_TABLE_NAME = 'down_payment_requests' THEN 'down_payments' ELSE 'cost_submissions' END;
  approval_changed := (before_row->>'status' IS DISTINCT FROM after_row->>'status'
      AND after_row->>'status' IN ('approved','rejected','under_review','pending_admin'))
    OR before_row->>'tier1_status' IS DISTINCT FROM after_row->>'tier1_status'
    OR before_row->>'tier2_status' IS DISTINCT FROM after_row->>'tier2_status'
    OR before_row->>'supervisor_approved_by' IS DISTINCT FROM after_row->>'supervisor_approved_by'
    OR before_row->>'admin_processed_by' IS DISTINCT FROM after_row->>'admin_processed_by';
  payment_changed := before_row->>'total_paid_amount' IS DISTINCT FROM after_row->>'total_paid_amount'
    OR before_row->>'paid_amount_cents' IS DISTINCT FROM after_row->>'paid_amount_cents'
    OR before_row->>'wallet_transaction_id' IS DISTINCT FROM after_row->>'wallet_transaction_id'
    OR before_row->>'wallet_transaction_ids' IS DISTINCT FROM after_row->>'wallet_transaction_ids'
    OR (before_row->>'status' IS DISTINCT FROM after_row->>'status' AND after_row->>'status' IN ('paid','partially_paid','fully_paid'));
  IF payment_changed THEN
    PERFORM public.assert_resource_permission(resource, 'approve');
    PERFORM public.assert_resource_permission('pre_funding', 'update');
    IF TG_TABLE_NAME = 'down_payment_requests' THEN PERFORM public.assert_resource_permission('wallets', 'update'); END IF;
  ELSIF approval_changed THEN
    PERFORM public.assert_resource_permission(resource, 'approve');
  ELSE
    PERFORM public.assert_resource_permission(resource, 'update');
  END IF;
  RETURN NEW;
END;
$$;
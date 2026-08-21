-- ============================================================================
-- PRE-FUND FINANCE EXCEPTION REVIEWS
-- ============================================================================
-- This migration adds an evidence-first resolution layer on top of the
-- immutable Pre-Fund payment ledger. It never edits historic payment events.
-- Records without proof remain excluded from verified Paid Out.

CREATE TABLE IF NOT EXISTS public.pre_fund_finance_exception_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_key TEXT NOT NULL,
  exception_type TEXT NOT NULL CHECK (exception_type IN ('unverified_source_payment', 'source_payment_gap')),
  resolution TEXT NOT NULL CHECK (resolution IN ('keep_excluded', 'evidence_confirmed')),
  fund_id UUID REFERENCES public.pre_fund_requests(id) ON DELETE RESTRICT,
  transaction_id UUID REFERENCES public.pre_fund_transactions(id) ON DELETE RESTRICT,
  source_table TEXT,
  source_id UUID,
  evidence_note TEXT NOT NULL,
  evidence_reference TEXT,
  confirmed_paid_amount NUMERIC,
  correction_transaction_id UUID REFERENCES public.pre_fund_transactions(id) ON DELETE RESTRICT,
  idempotency_key TEXT UNIQUE,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_role TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pre_fund_finance_exception_decisions
  ADD COLUMN IF NOT EXISTS confirmed_paid_amount NUMERIC;

CREATE INDEX IF NOT EXISTS idx_pre_fund_exception_decisions_key
  ON public.pre_fund_finance_exception_decisions(exception_key, decided_at DESC);

ALTER TABLE public.pre_fund_finance_exception_decisions ENABLE ROW LEVEL SECURITY;

-- All reads and writes are mediated by the authorised RPCs below. This avoids a
-- browser client editing the ledger-adjacent review history directly.
REVOKE ALL ON TABLE public.pre_fund_finance_exception_decisions FROM PUBLIC;
REVOKE ALL ON TABLE public.pre_fund_finance_exception_decisions FROM authenticated;

CREATE OR REPLACE FUNCTION public._pre_fund_exception_actor_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  PERFORM public._assert_finance_role();

  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN 'service_role';
  END IF;

  SELECT lower(trim(role)) INTO v_role
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;

  RETURN COALESCE(v_role, 'unknown');
END;
$$;

REVOKE ALL ON FUNCTION public._pre_fund_exception_actor_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._pre_fund_exception_actor_role() TO authenticated;

CREATE OR REPLACE VIEW public.pre_fund_finance_exception_queue_v
WITH (security_invoker = true)
AS
WITH source_links AS (
  SELECT
    source_table,
    source_id,
    SUM(CASE
      WHEN transaction_type = 'payment' THEN amount
      WHEN transaction_type IN ('reversal', 'return') THEN -amount
      ELSE 0
    END) AS linked_amount
  FROM public.pre_fund_transactions
  WHERE source_table IN ('down_payment_requests', 'operational_cost_submissions')
    AND source_id IS NOT NULL
  GROUP BY source_table, source_id
),
base AS (
  SELECT
    CASE
      WHEN h.transaction_id IS NOT NULL THEN 'txn:' || h.transaction_id::text
      ELSE 'gap:' || h.source_table || ':' || h.source_id::text
    END AS exception_key,
    h.exception_type,
    h.fund_id,
    h.transaction_id,
    h.amount AS historic_amount,
    h.currency,
    h.transaction_date,
    h.source_table,
    h.source_id,
    h.reference,
    h.description,
    COALESCE(sl.linked_amount, 0) AS linked_amount,
    CASE
      WHEN h.source_table = 'operational_cost_submissions' AND ocs.id IS NULL THEN 'missing'
      WHEN h.source_table = 'operational_cost_submissions' THEN COALESCE(ocs.status, 'unknown')
      WHEN h.source_table = 'down_payment_requests' AND dp.id IS NULL THEN 'missing'
      WHEN h.source_table = 'down_payment_requests' THEN COALESCE(dp.status, 'unknown')
      ELSE 'not_applicable'
    END AS source_status,
    CASE
      WHEN h.source_table = 'operational_cost_submissions' THEN COALESCE(ocs.amount_paid_cents, 0)::numeric / 100
      WHEN h.source_table = 'down_payment_requests' THEN COALESCE(dp.total_paid_amount, 0)
      ELSE 0
    END AS current_paid_amount,
    CASE
      WHEN h.source_table = 'operational_cost_submissions' THEN
        COALESCE(ocs.description, 'Cost submission ' || h.source_id::text)
      WHEN h.source_table = 'down_payment_requests' THEN
        COALESCE(dp.justification, dp.site_name, 'Down-payment request ' || h.source_id::text)
      ELSE COALESCE(h.description, h.source_id::text, 'Historic ledger exception')
    END AS source_description,
    CASE
      WHEN h.exception_type = 'source_payment_gap' THEN h.amount
      WHEN h.source_table = 'operational_cost_submissions' THEN
        GREATEST((COALESCE(ocs.amount_paid_cents, 0)::numeric / 100) - COALESCE(sl.linked_amount, 0), 0)
      WHEN h.source_table = 'down_payment_requests' THEN
        GREATEST(COALESCE(dp.total_paid_amount, 0) - COALESCE(sl.linked_amount, 0), 0)
      ELSE 0
    END AS unmatched_amount
  FROM public.pre_fund_historic_exceptions_v h
  LEFT JOIN source_links sl
    ON sl.source_table = h.source_table AND sl.source_id = h.source_id
  LEFT JOIN public.operational_cost_submissions ocs
    ON h.source_table = 'operational_cost_submissions' AND ocs.id = h.source_id
  LEFT JOIN public.down_payment_requests dp
    ON h.source_table = 'down_payment_requests' AND dp.id = h.source_id
  WHERE h.exception_type IN ('unverified_source_payment', 'source_payment_gap')
),
latest_decision AS (
  SELECT DISTINCT ON (exception_key)
    exception_key, resolution, evidence_note, evidence_reference,
    correction_transaction_id, decided_by, decided_role, decided_at
  FROM public.pre_fund_finance_exception_decisions
  ORDER BY exception_key, decided_at DESC, id DESC
)
SELECT
  b.*,
  COALESCE(d.resolution, 'open') AS resolution,
  d.evidence_note AS decision_note,
  d.evidence_reference,
  d.correction_transaction_id,
  d.decided_by,
  d.decided_role,
  d.decided_at
FROM base b
LEFT JOIN latest_decision d ON d.exception_key = b.exception_key;

CREATE OR REPLACE FUNCTION public.get_pre_fund_finance_exception_queue_rpc(
  p_fund_id UUID DEFAULT NULL
) RETURNS SETOF public.pre_fund_finance_exception_queue_v
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_finance_role();

  RETURN QUERY
  SELECT *
  FROM public.pre_fund_finance_exception_queue_v q
  WHERE p_fund_id IS NULL
     OR q.fund_id = p_fund_id
     -- Source-payment gaps without a fund remain visible as unassigned
     -- mismatches. The correction RPC below refuses to guess a fund.
     OR q.fund_id IS NULL
  ORDER BY
    CASE q.resolution WHEN 'open' THEN 0 ELSE 1 END,
    q.transaction_date DESC NULLS LAST,
    q.exception_key;
END;
$$;

REVOKE ALL ON FUNCTION public.get_pre_fund_finance_exception_queue_rpc(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pre_fund_finance_exception_queue_rpc(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_pre_fund_exception_decision_rpc(
  p_exception_key TEXT,
  p_evidence_note TEXT,
  p_evidence_reference TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exception public.pre_fund_finance_exception_queue_v%ROWTYPE;
  v_role TEXT;
  v_decision_id UUID;
BEGIN
  v_role := public._pre_fund_exception_actor_role();

  IF NULLIF(BTRIM(p_evidence_note), '') IS NULL THEN
    RAISE EXCEPTION 'A Finance review note is required when keeping an exception excluded.';
  END IF;

  SELECT * INTO v_exception
  FROM public.pre_fund_finance_exception_queue_v
  WHERE exception_key = NULLIF(BTRIM(p_exception_key), '');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This exception is no longer open in the current ledger view.';
  END IF;

  INSERT INTO public.pre_fund_finance_exception_decisions (
    exception_key, exception_type, resolution, fund_id, transaction_id,
    source_table, source_id, evidence_note, evidence_reference,
    decided_by, decided_role
  ) VALUES (
    v_exception.exception_key, v_exception.exception_type, 'keep_excluded',
    v_exception.fund_id, v_exception.transaction_id, v_exception.source_table,
    v_exception.source_id, BTRIM(p_evidence_note), NULLIF(BTRIM(p_evidence_reference), ''),
    auth.uid(), v_role
  ) RETURNING id INTO v_decision_id;

  RETURN jsonb_build_object(
    'success', true,
    'decision_id', v_decision_id,
    'resolution', 'keep_excluded',
    'balances_changed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_pre_fund_exception_decision_rpc(TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_pre_fund_exception_decision_rpc(TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_pre_fund_ocs_exception_with_evidence_rpc(
  p_exception_key TEXT,
  p_evidence_note TEXT,
  p_evidence_reference TEXT,
  p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn public.pre_fund_transactions%ROWTYPE;
  v_source public.operational_cost_submissions%ROWTYPE;
  v_role TEXT;
  v_gap NUMERIC;
  v_linked_amount NUMERIC;
  v_fund_count INTEGER;
  v_link_result JSONB;
  v_correction_id UUID;
  v_decision_id UUID;
  v_transaction_id UUID;
  v_existing_decision RECORD;
  v_key TEXT := NULLIF(BTRIM(p_idempotency_key), '');
BEGIN
  v_role := public._pre_fund_exception_actor_role();

  IF NULLIF(BTRIM(p_evidence_note), '') IS NULL
     OR NULLIF(BTRIM(p_evidence_reference), '') IS NULL THEN
    RAISE EXCEPTION 'Evidence note and reference are required before confirming a payment.';
  END IF;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'An idempotency key is required for an evidence-confirmed correction.';
  END IF;

  IF NULLIF(BTRIM(p_exception_key), '') !~ '^txn:[0-9a-fA-F-]{36}$' THEN
    RAISE EXCEPTION 'Only an existing unverified OCS payment can be confirmed here. Do not guess a fund for an unassigned source gap.';
  END IF;
  v_transaction_id := substring(BTRIM(p_exception_key) FROM 5)::uuid;

  SELECT * INTO v_txn
  FROM public.pre_fund_transactions
  WHERE id = v_transaction_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_txn.transaction_type <> 'payment'
     OR v_txn.source_table <> 'operational_cost_submissions'
     OR v_txn.source_id IS NULL THEN
    RAISE EXCEPTION 'Only an existing source-linked OCS payment can be confirmed here.';
  END IF;

  SELECT * INTO v_source
  FROM public.operational_cost_submissions
  WHERE id = v_txn.source_id
  FOR UPDATE;

  SELECT id, exception_key, evidence_note, evidence_reference, correction_transaction_id
  INTO v_existing_decision
  FROM public.pre_fund_finance_exception_decisions
  WHERE idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing_decision.exception_key IS DISTINCT FROM 'txn:' || v_txn.id::text
       OR v_existing_decision.evidence_note IS DISTINCT FROM BTRIM(p_evidence_note)
       OR v_existing_decision.evidence_reference IS DISTINCT FROM BTRIM(p_evidence_reference) THEN
      RAISE EXCEPTION 'This idempotency key is already bound to a different Finance exception decision.';
    END IF;
    RETURN jsonb_build_object('success', true, 'idempotent', true,
      'decision_id', v_existing_decision.id,
      'correction_transaction_id', v_existing_decision.correction_transaction_id);
  END IF;

  IF v_source.id IS NULL OR v_source.status <> 'approved' THEN
    RAISE EXCEPTION 'OCS evidence confirmation is limited to an existing approved source; current status is "%".',
      COALESCE(v_source.status, 'missing');
  END IF;
  IF COALESCE(v_source.amount_paid_cents, 0) <= 0 THEN
    RAISE EXCEPTION 'The approved OCS has no recorded paid amount to confirm.';
  END IF;

  SELECT COUNT(DISTINCT pre_fund_request_id) INTO v_fund_count
  FROM public.pre_fund_transactions
  WHERE source_table = 'operational_cost_submissions'
    AND source_id = v_source.id;
  IF v_fund_count <> 1 THEN
    RAISE EXCEPTION 'This OCS is linked to multiple funds; reconcile it at source level before assigning a correction.';
  END IF;

  SELECT COALESCE(SUM(CASE
    WHEN transaction_type = 'payment' THEN amount
    WHEN transaction_type IN ('reversal', 'return') THEN -amount
    ELSE 0
  END), 0) INTO v_linked_amount
  FROM public.pre_fund_transactions
  WHERE source_table = 'operational_cost_submissions'
    AND source_id = v_source.id;

  v_gap := GREATEST((v_source.amount_paid_cents::numeric / 100) - v_linked_amount, 0);

  -- This status transition causes the existing immutable historic event to be
  -- included by the canonical source-verified ledger. It is audited below with
  -- the evidence decision; no event row is updated.
  UPDATE public.operational_cost_submissions
  SET status = 'paid',
      paid_at = COALESCE(paid_at, now()),
      paid_by = COALESCE(paid_by, auth.uid()),
      payment_proof_notes = concat_ws(E'\n', NULLIF(payment_proof_notes, ''),
        'Finance evidence confirmed: ' || BTRIM(p_evidence_note) ||
        ' [reference: ' || BTRIM(p_evidence_reference) || ']'),
      updated_at = now()
  WHERE id = v_source.id;

  IF v_gap > 0 THEN
    SELECT * INTO v_link_result
    FROM public.link_payment_atomically_rpc(
      v_txn.pre_fund_request_id::text,
      v_gap,
      v_txn.currency,
      'operational_cost_submissions',
      v_source.id,
      BTRIM(p_evidence_reference),
      'Evidence-confirmed historic OCS payment correction',
      CURRENT_DATE,
      auth.uid(),
      v_txn.user_id,
      NULL,
      'exception-correction:' || v_key
    );
    v_correction_id := NULLIF(v_link_result ->> 'transaction_id', '')::uuid;
    IF COALESCE((v_link_result ->> 'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Evidence correction could not be posted: %', COALESCE(v_link_result ->> 'error', 'unknown error');
    END IF;
  END IF;

  INSERT INTO public.pre_fund_finance_exception_decisions (
    exception_key, exception_type, resolution, fund_id, transaction_id,
    source_table, source_id, evidence_note, evidence_reference,
    correction_transaction_id, idempotency_key, decided_by, decided_role
  ) VALUES (
    'txn:' || v_txn.id::text, 'unverified_source_payment', 'evidence_confirmed',
    v_txn.pre_fund_request_id, v_txn.id, v_txn.source_table,
    v_txn.source_id, BTRIM(p_evidence_note), BTRIM(p_evidence_reference),
    v_correction_id, v_key, auth.uid(), v_role
  ) RETURNING id INTO v_decision_id;

  RETURN jsonb_build_object(
    'success', true,
    'decision_id', v_decision_id,
    'correction_transaction_id', v_correction_id,
    'correction_amount', v_gap
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_pre_fund_ocs_exception_with_evidence_rpc(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_pre_fund_ocs_exception_with_evidence_rpc(TEXT,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_pre_fund_down_payment_exception_with_evidence_rpc(
  p_exception_key TEXT,
  p_confirmed_amount NUMERIC,
  p_evidence_note TEXT,
  p_evidence_reference TEXT,
  p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn public.pre_fund_transactions%ROWTYPE;
  v_source public.down_payment_requests%ROWTYPE;
  v_role TEXT;
  v_gap NUMERIC;
  v_linked_amount NUMERIC;
  v_fund_count INTEGER;
  v_link_result JSONB;
  v_correction_id UUID;
  v_decision_id UUID;
  v_transaction_id UUID;
  v_existing_decision RECORD;
  v_key TEXT := NULLIF(BTRIM(p_idempotency_key), '');
BEGIN
  v_role := public._pre_fund_exception_actor_role();

  IF p_confirmed_amount IS NULL OR p_confirmed_amount <= 0 THEN
    RAISE EXCEPTION 'A confirmed paid amount greater than zero is required.';
  END IF;
  IF NULLIF(BTRIM(p_evidence_note), '') IS NULL
     OR NULLIF(BTRIM(p_evidence_reference), '') IS NULL THEN
    RAISE EXCEPTION 'Evidence note and reference are required before confirming a payment.';
  END IF;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'An idempotency key is required for an evidence-confirmed correction.';
  END IF;

  IF NULLIF(BTRIM(p_exception_key), '') !~ '^txn:[0-9a-fA-F-]{36}$' THEN
    RAISE EXCEPTION 'Only an existing unverified Down Payment can be confirmed here. Missing requests must remain exceptions.';
  END IF;
  v_transaction_id := substring(BTRIM(p_exception_key) FROM 5)::uuid;

  SELECT * INTO v_txn
  FROM public.pre_fund_transactions
  WHERE id = v_transaction_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_txn.transaction_type <> 'payment'
     OR v_txn.source_table <> 'down_payment_requests'
     OR v_txn.source_id IS NULL THEN
    RAISE EXCEPTION 'Only an existing source-linked Down Payment can be confirmed here.';
  END IF;

  SELECT * INTO v_source
  FROM public.down_payment_requests
  WHERE id = v_txn.source_id
  FOR UPDATE;

  IF v_source.id IS NULL OR COALESCE((v_source.metadata ->> 'deleted')::boolean, false) THEN
    RAISE EXCEPTION 'Missing or deleted Down Payments cannot be recreated through a ledger correction.';
  END IF;

  SELECT id, exception_key, evidence_note, evidence_reference, confirmed_paid_amount, correction_transaction_id
  INTO v_existing_decision
  FROM public.pre_fund_finance_exception_decisions
  WHERE idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing_decision.exception_key IS DISTINCT FROM 'txn:' || v_txn.id::text
       OR v_existing_decision.evidence_note IS DISTINCT FROM BTRIM(p_evidence_note)
       OR v_existing_decision.evidence_reference IS DISTINCT FROM BTRIM(p_evidence_reference)
       OR v_existing_decision.confirmed_paid_amount IS DISTINCT FROM p_confirmed_amount THEN
      RAISE EXCEPTION 'This idempotency key is already bound to a different Finance exception decision.';
    END IF;
    RETURN jsonb_build_object('success', true, 'idempotent', true,
      'decision_id', v_existing_decision.id,
      'correction_transaction_id', v_existing_decision.correction_transaction_id);
  END IF;

  IF COALESCE(v_source.status, '') NOT IN (
    'pending', 'pending_supervisor', 'pending_admin', 'draft', 'rejected', 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Down Payment evidence confirmation is limited to an existing unverified source; current status is "%".',
      COALESCE(v_source.status, 'missing');
  END IF;

  SELECT COUNT(DISTINCT pre_fund_request_id) INTO v_fund_count
  FROM public.pre_fund_transactions
  WHERE source_table = 'down_payment_requests'
    AND source_id = v_source.id;
  IF v_fund_count <> 1 THEN
    RAISE EXCEPTION 'This Down Payment is linked to multiple funds; reconcile it at source level before assigning a correction.';
  END IF;

  SELECT COALESCE(SUM(CASE
    WHEN transaction_type = 'payment' THEN amount
    WHEN transaction_type IN ('reversal', 'return') THEN -amount
    ELSE 0
  END), 0) INTO v_linked_amount
  FROM public.pre_fund_transactions
  WHERE source_table = 'down_payment_requests'
    AND source_id = v_source.id;

  IF p_confirmed_amount < v_linked_amount THEN
    RAISE EXCEPTION 'Confirmed amount (%) cannot be below the immutable linked amount (%).',
      p_confirmed_amount, v_linked_amount;
  END IF;
  v_gap := p_confirmed_amount - v_linked_amount;

  -- An evidence-backed status and cumulative-payment transition lets the
  -- existing immutable event become source-verified. The JSON audit marker is
  -- intentional: no request is restored without a Finance decision record.
  UPDATE public.down_payment_requests
  SET status = 'fully_paid',
      total_paid_amount = p_confirmed_amount,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'pre_fund_evidence_confirmed', true,
        'pre_fund_evidence_reference', BTRIM(p_evidence_reference),
        'pre_fund_evidence_confirmed_at', now()
      )
  WHERE id = v_source.id;

  IF v_gap > 0 THEN
    SELECT * INTO v_link_result
    FROM public.link_payment_atomically_rpc(
      v_txn.pre_fund_request_id::text,
      v_gap,
      v_txn.currency,
      'down_payment_requests',
      v_source.id,
      BTRIM(p_evidence_reference),
      'Evidence-confirmed historic Down Payment correction',
      CURRENT_DATE,
      auth.uid(),
      v_txn.user_id,
      NULL,
      'exception-correction:' || v_key
    );
    v_correction_id := NULLIF(v_link_result ->> 'transaction_id', '')::uuid;
    IF COALESCE((v_link_result ->> 'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Evidence correction could not be posted: %', COALESCE(v_link_result ->> 'error', 'unknown error');
    END IF;
  END IF;

  INSERT INTO public.pre_fund_finance_exception_decisions (
    exception_key, exception_type, resolution, fund_id, transaction_id,
    source_table, source_id, evidence_note, evidence_reference,
    confirmed_paid_amount, correction_transaction_id, idempotency_key, decided_by, decided_role
  ) VALUES (
    'txn:' || v_txn.id::text, 'unverified_source_payment', 'evidence_confirmed',
    v_txn.pre_fund_request_id, v_txn.id, v_txn.source_table,
    v_txn.source_id, BTRIM(p_evidence_note), BTRIM(p_evidence_reference),
    p_confirmed_amount, v_correction_id, v_key, auth.uid(), v_role
  ) RETURNING id INTO v_decision_id;

  RETURN jsonb_build_object(
    'success', true,
    'decision_id', v_decision_id,
    'correction_transaction_id', v_correction_id,
    'correction_amount', v_gap
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_pre_fund_down_payment_exception_with_evidence_rpc(TEXT,NUMERIC,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_pre_fund_down_payment_exception_with_evidence_rpc(TEXT,NUMERIC,TEXT,TEXT,TEXT) TO authenticated;
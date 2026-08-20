-- ============================================================================
-- PRE-FUND LEDGER RECONCILIATION
-- ============================================================================
-- This migration is deliberately additive. It preserves the original payment
-- rows, makes all future debit/reversal operations event-based and atomic, and
-- exposes one read model for every pre-funding screen.
--
-- IMPORTANT FOR FINANCE
-- 1. Review pre_fund_historic_exceptions_v before applying any correction.
-- 2. Do not delete, amend, or auto-reverse an exception without evidence.
-- 3. Apply a proven source-payment gap through the controlled correction RPC;
--    it creates a new immutable payment event and audit record.
-- ============================================================================

-- This migration must be runnable on a clean schema. Do not rely on an earlier
-- pre-fund migration having created the authorization helper.
CREATE OR REPLACE FUNCTION public._assert_finance_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Server-side automations use a service-role JWT. Human callers are checked
  -- against profiles below.
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
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
    'accountant', 'fom'
  ) THEN
    RAISE EXCEPTION 'Access denied: finance or admin role required (role="%").',
      COALESCE(v_role, '<null>');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._assert_finance_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._assert_finance_role() TO authenticated;

ALTER TABLE public.pre_fund_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS reversal_of_id UUID REFERENCES public.pre_fund_transactions(id),
  ADD COLUMN IF NOT EXISTS event_actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_reason TEXT,
  ADD COLUMN IF NOT EXISTS event_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Existing records predate event keys. Give each one a traceable legacy key;
-- do not infer a relationship between historical records from source ids alone.
UPDATE public.pre_fund_transactions
SET idempotency_key = 'legacy:' || id::text,
    event_actor_id = COALESCE(event_actor_id, created_by),
    occurred_at = COALESCE(occurred_at, created_at, now())
WHERE idempotency_key IS NULL;

ALTER TABLE public.pre_fund_transactions
  ALTER COLUMN idempotency_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pre_fund_transactions_idempotency
  ON public.pre_fund_transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_pre_fund_transactions_reversal_of
  ON public.pre_fund_transactions(reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;

-- A financial event must have a positive amount. Its direction is represented
-- by transaction_type/reversal_of_id, never by a negative rewrite.
ALTER TABLE public.pre_fund_transactions
  DROP CONSTRAINT IF EXISTS pre_fund_transactions_positive_amount;
ALTER TABLE public.pre_fund_transactions
  ADD CONSTRAINT pre_fund_transactions_positive_amount CHECK (amount > 0) NOT VALID;

CREATE TABLE IF NOT EXISTS public.pre_fund_event_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID,
  action TEXT NOT NULL CHECK (action IN ('insert', 'reconciliation_update')),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  before_data JSONB,
  after_data JSONB
);

CREATE OR REPLACE FUNCTION public.pre_fund_guard_event_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Pre-fund payment events are immutable. Create a reversal event instead.';
  END IF;

  -- Finance can still mark a row reconciled without changing its financial facts.
  IF (to_jsonb(OLD) - ARRAY['reconciled', 'reconciled_at'])
     IS DISTINCT FROM
     (to_jsonb(NEW) - ARRAY['reconciled', 'reconciled_at']) THEN
    RAISE EXCEPTION 'Pre-fund payment events are immutable. Only reconciliation status may be updated.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pre_fund_audit_event_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pre_fund_event_audit (transaction_id, action, actor_id, after_data)
    VALUES (NEW.id, 'insert', COALESCE(NEW.event_actor_id, NEW.created_by, auth.uid()), to_jsonb(NEW));
  ELSE
    INSERT INTO public.pre_fund_event_audit (transaction_id, action, actor_id, before_data, after_data)
    VALUES (NEW.id, 'reconciliation_update', auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pre_fund_event_immutable ON public.pre_fund_transactions;
CREATE TRIGGER trg_pre_fund_event_immutable
  BEFORE UPDATE OR DELETE ON public.pre_fund_transactions
  FOR EACH ROW EXECUTE FUNCTION public.pre_fund_guard_event_immutability();

DROP TRIGGER IF EXISTS trg_pre_fund_event_audit ON public.pre_fund_transactions;
CREATE TRIGGER trg_pre_fund_event_audit
  AFTER INSERT OR UPDATE ON public.pre_fund_transactions
  FOR EACH ROW EXECUTE FUNCTION public.pre_fund_audit_event_change();

-- Allocation rows can no longer be used to spend above a staff allocation.
-- NOT VALID preserves historic rows for Finance review while enforcing the rule
-- on all new/changed allocations.
ALTER TABLE public.pre_fund_allocations
  DROP CONSTRAINT IF EXISTS pre_fund_allocations_nonnegative_amounts;
ALTER TABLE public.pre_fund_allocations
  ADD CONSTRAINT pre_fund_allocations_nonnegative_amounts
  CHECK (allocated_amount >= 0 AND spent_amount >= 0 AND spent_amount <= allocated_amount) NOT VALID;

CREATE OR REPLACE FUNCTION public.pre_fund_guard_allocation_ceiling()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_fund_amount NUMERIC;
  v_other_allocated NUMERIC;
BEGIN
  -- Payment processing updates spent_amount only. A historic over-allocation
  -- must not block a legitimate reversal or payment; Finance must resolve it
  -- before changing allocation amounts.
  IF TG_OP = 'UPDATE'
     AND NEW.allocated_amount IS NOT DISTINCT FROM OLD.allocated_amount
     AND NEW.pre_fund_request_id IS NOT DISTINCT FROM OLD.pre_fund_request_id THEN
    RETURN NEW;
  END IF;

  SELECT amount INTO v_fund_amount
  FROM public.pre_fund_requests
  WHERE id = NEW.pre_fund_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation fund % does not exist.', NEW.pre_fund_request_id;
  END IF;

  SELECT COALESCE(SUM(allocated_amount), 0) INTO v_other_allocated
  FROM public.pre_fund_allocations
  WHERE pre_fund_request_id = NEW.pre_fund_request_id
    AND (TG_OP = 'INSERT' OR id <> OLD.id);

  IF v_other_allocated + NEW.allocated_amount > v_fund_amount THEN
    RAISE EXCEPTION 'Allocation ceiling exceeded: allocations would be %, fund authorisation is %.',
      v_other_allocated + NEW.allocated_amount, v_fund_amount;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pre_fund_allocation_ceiling ON public.pre_fund_allocations;
CREATE TRIGGER trg_pre_fund_allocation_ceiling
  BEFORE INSERT OR UPDATE OF allocated_amount, pre_fund_request_id
  ON public.pre_fund_allocations
  FOR EACH ROW EXECUTE FUNCTION public.pre_fund_guard_allocation_ceiling();

-- Preserve cache state before it is canonicalised below. This table is defined
-- before the exception view because the view compares against this snapshot.
CREATE TABLE IF NOT EXISTS public.pre_fund_balance_cache_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES public.pre_fund_requests(id) ON DELETE RESTRICT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT NOT NULL,
  paid_amount NUMERIC NOT NULL,
  available_balance NUMERIC NOT NULL
);

-- One canonical event ledger. Invalid/deleted/rejected legacy sources are
-- deliberately not counted as verified spend; they remain visible in the
-- exception view below for Finance to resolve with evidence.
CREATE OR REPLACE VIEW public.pre_fund_event_ledger_v
WITH (security_invoker = true)
AS
SELECT
  t.id,
  t.pre_fund_request_id,
  t.transaction_type,
  t.amount,
  t.currency,
  t.transaction_date,
  t.source_table,
  t.source_id,
  t.reference,
  t.description,
  t.user_id,
  t.created_by,
  t.created_at,
  t.receipt_url,
  t.reconciled,
  t.reconciled_at,
  t.idempotency_key,
  t.reversal_of_id,
  t.event_reason,
  t.event_metadata,
  t.occurred_at,
  CASE
    WHEN t.source_table = 'down_payment_requests' THEN
      dp.id IS NOT NULL
      AND dp.status IN ('partially_paid', 'fully_paid', 'paid', 'reconciled')
      AND COALESCE((dp.metadata ->> 'deleted')::boolean, false) = false
    WHEN t.source_table = 'operational_cost_submissions' THEN
      ocs.id IS NOT NULL
      AND ocs.status IN ('partially_paid', 'paid', 'reconciled')
    WHEN t.source_table IS NULL THEN true
    ELSE true
  END AS source_is_verified,
  CASE
    WHEN t.transaction_type = 'payment' THEN t.amount
    WHEN t.transaction_type IN ('reversal', 'return') THEN -t.amount
    ELSE 0
  END AS signed_paid_amount
FROM public.pre_fund_transactions t
LEFT JOIN public.down_payment_requests dp
  ON t.source_table = 'down_payment_requests' AND dp.id = t.source_id
LEFT JOIN public.operational_cost_submissions ocs
  ON t.source_table = 'operational_cost_submissions' AND ocs.id = t.source_id;

CREATE OR REPLACE VIEW public.pre_fund_balance_snapshot_v
WITH (security_invoker = true)
AS
SELECT
  f.id AS fund_id,
  f.name AS fund_name,
  f.currency,
  f.amount AS funded_amount,
  COALESCE(SUM(
    CASE WHEN e.source_is_verified THEN e.signed_paid_amount ELSE 0 END
  ), 0) AS verified_paid_amount,
  -- Commitments reserve cash before a payment event exists. Availability must
  -- retain that reservation while still being derived from verified spend.
  f.amount
    - COALESCE(f.committed_amount, 0)
    - COALESCE(SUM(
      CASE WHEN e.source_is_verified THEN e.signed_paid_amount ELSE 0 END
    ), 0) AS verified_available_balance,
  f.paid_amount AS cached_paid_amount,
  f.available_balance AS cached_available_balance,
  COALESCE(SUM(CASE WHEN NOT e.source_is_verified AND e.transaction_type = 'payment' THEN e.amount ELSE 0 END), 0)
    AS unresolved_legacy_amount,
  COALESCE((SELECT SUM(a.allocated_amount) FROM public.pre_fund_allocations a WHERE a.pre_fund_request_id = f.id), 0)
    AS allocated_amount,
  COALESCE((SELECT SUM(a.spent_amount) FROM public.pre_fund_allocations a WHERE a.pre_fund_request_id = f.id), 0)
    AS allocated_spent_amount
FROM public.pre_fund_requests f
LEFT JOIN public.pre_fund_event_ledger_v e ON e.pre_fund_request_id = f.id
GROUP BY f.id;

CREATE OR REPLACE VIEW public.pre_fund_historic_exceptions_v
WITH (security_invoker = true)
AS
SELECT
  e.pre_fund_request_id AS fund_id,
  e.id AS transaction_id,
  'unverified_source_payment'::text AS exception_type,
  e.amount,
  e.currency,
  e.transaction_date,
  e.source_table,
  e.source_id,
  e.reference,
  e.description,
  e.idempotency_key,
  'The linked source is missing, deleted, rejected, cancelled, or not paid. Review evidence before a reversal.'::text AS finance_action
FROM public.pre_fund_event_ledger_v e
WHERE e.transaction_type = 'payment'
  AND NOT e.source_is_verified
UNION ALL
SELECT
  s.fund_id,
  NULL::uuid,
  'cached_balance_difference',
  ABS(s.paid_amount - b.verified_paid_amount),
  b.currency,
  CURRENT_DATE,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'The pre-migration cached balance differed from the verified immutable ledger. Review source-payment gaps before applying a controlled correction.'::text
FROM public.pre_fund_balance_cache_snapshots s
JOIN public.pre_fund_balance_snapshot_v b ON b.fund_id = s.fund_id
WHERE s.reason = 'before canonical ledger reconciliation'
  AND s.paid_amount IS DISTINCT FROM b.verified_paid_amount
UNION ALL
SELECT
  NULL::uuid,
  NULL::uuid,
  'source_payment_gap',
  GREATEST(dp.total_paid_amount - COALESCE(t.linked_amount, 0), 0),
  t.currency,
  CURRENT_DATE,
  'down_payment_requests',
  dp.id,
  NULL,
  'Source cumulative payment is greater than linked immutable payment events. Confirm the fund and add a controlled historic correction only with evidence.'::text,
  NULL,
  'Do not guess the fund. Finance must verify payment evidence before correcting this gap.'::text
FROM public.down_payment_requests dp
LEFT JOIN (
  SELECT
    source_id,
    SUM(CASE
      WHEN transaction_type = 'payment' THEN amount
      WHEN transaction_type IN ('reversal', 'return') THEN -amount
      ELSE 0
    END) AS linked_amount,
    MAX(currency) AS currency
  FROM public.pre_fund_transactions
  WHERE source_table = 'down_payment_requests'
  GROUP BY source_id
) t ON t.source_id = dp.id
WHERE dp.status IN ('partially_paid', 'fully_paid', 'paid', 'reconciled')
  AND COALESCE((dp.metadata ->> 'deleted')::boolean, false) = false
  AND dp.total_paid_amount > COALESCE(t.linked_amount, 0)
UNION ALL
SELECT
  NULL::uuid,
  NULL::uuid,
  'source_payment_gap',
  GREATEST((ocs.amount_paid_cents / 100.0) - COALESCE(t.linked_amount, 0), 0),
  t.currency,
  CURRENT_DATE,
  'operational_cost_submissions',
  ocs.id,
  NULL,
  'Source cumulative payment is greater than linked immutable payment events. Confirm the fund and add a controlled historic correction only with evidence.'::text,
  NULL,
  'Do not guess the fund. Finance must verify payment evidence before correcting this gap.'::text
FROM public.operational_cost_submissions ocs
LEFT JOIN (
  SELECT
    source_id,
    SUM(CASE
      WHEN transaction_type = 'payment' THEN amount
      WHEN transaction_type IN ('reversal', 'return') THEN -amount
      ELSE 0
    END) AS linked_amount,
    MAX(currency) AS currency
  FROM public.pre_fund_transactions
  WHERE source_table = 'operational_cost_submissions'
  GROUP BY source_id
) t ON t.source_id = ocs.id
WHERE ocs.status IN ('partially_paid', 'paid', 'reconciled')
  AND (ocs.amount_paid_cents / 100.0) > COALESCE(t.linked_amount, 0);

-- A source can become invalid later (for example, cancellation or soft delete).
-- Refresh its linked fund cache in the same source update transaction so every
-- screen continues to read one source-validated balance.
CREATE OR REPLACE FUNCTION public.refresh_pre_fund_balance_for_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_id UUID := COALESCE(NEW.id, OLD.id);
BEGIN
  UPDATE public.pre_fund_requests f
  SET paid_amount = b.verified_paid_amount,
      available_balance = b.verified_available_balance,
      updated_at = now()
  FROM public.pre_fund_balance_snapshot_v b
  WHERE b.fund_id = f.id
    AND EXISTS (
      SELECT 1 FROM public.pre_fund_transactions t
      WHERE t.pre_fund_request_id = f.id
        AND t.source_table = TG_TABLE_NAME
        AND t.source_id = v_source_id
    );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_pre_fund_refresh_down_payment_source ON public.down_payment_requests;
CREATE TRIGGER trg_pre_fund_refresh_down_payment_source
  AFTER UPDATE OF status, metadata ON public.down_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.refresh_pre_fund_balance_for_source();

DROP TRIGGER IF EXISTS trg_pre_fund_refresh_operational_cost_source ON public.operational_cost_submissions;
CREATE TRIGGER trg_pre_fund_refresh_operational_cost_source
  AFTER UPDATE OF status ON public.operational_cost_submissions
  FOR EACH ROW EXECUTE FUNCTION public.refresh_pre_fund_balance_for_source();

-- Preserve the pre-migration cache values separately before canonicalising the
-- cache columns. This is an audit snapshot, not a correction.
INSERT INTO public.pre_fund_balance_cache_snapshots (fund_id, reason, paid_amount, available_balance)
SELECT id, 'before canonical ledger reconciliation', paid_amount, available_balance
FROM public.pre_fund_requests
WHERE NOT EXISTS (
  SELECT 1 FROM public.pre_fund_balance_cache_snapshots s
  WHERE s.fund_id = pre_fund_requests.id
    AND s.reason = 'before canonical ledger reconciliation'
);

-- Bring the cached compatibility fields in line with the verified ledger. The
-- historical differences are retained in the snapshot and exception views.
UPDATE public.pre_fund_requests f
SET paid_amount = b.verified_paid_amount,
    available_balance = b.verified_available_balance,
    updated_at = now()
FROM public.pre_fund_balance_snapshot_v b
WHERE b.fund_id = f.id
  AND (f.paid_amount IS DISTINCT FROM b.verified_paid_amount
       OR f.available_balance IS DISTINCT FROM b.verified_available_balance);

-- Replace weak source-level idempotency with a distinct event key. Application
-- callers provide an operation UUID; a legacy direct RPC caller gets a new
-- server-generated event rather than collapsing a legitimate instalment.
DROP FUNCTION IF EXISTS public.link_payment_atomically_rpc(UUID,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,DATE,UUID,UUID,TEXT);
DROP FUNCTION IF EXISTS public.link_payment_atomically_rpc(UUID,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,DATE,UUID);

CREATE FUNCTION public.link_payment_atomically_rpc(
  p_fund_id TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_source_table TEXT,
  p_source_id UUID,
  p_reference TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_created_by UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_receipt_url TEXT DEFAULT NULL,
  p_payment_event_key TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fund_id UUID := p_fund_id::uuid;
  v_fund RECORD;
  v_txn_id UUID;
  v_existing RECORD;
  v_event_key TEXT;
  v_alloc RECORD;
  v_has_allocation BOOLEAN := false;
  v_paid NUMERIC;
  v_available NUMERIC;
  v_liability_account_id UUID;
  v_receipt_account_id UUID;
  v_journal_entry_id UUID;
  v_source_status TEXT;
  v_source_paid_amount NUMERIC := 0;
  v_linked_source_amount NUMERIC := 0;
  v_source_deleted BOOLEAN := false;
BEGIN
  PERFORM public._assert_finance_role();

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.';
  END IF;
  IF p_source_table NOT IN ('down_payment_requests', 'operational_cost_submissions') THEN
    RAISE EXCEPTION 'Unsupported pre-fund payment source "%".', p_source_table;
  END IF;
  IF p_source_table = 'down_payment_requests' THEN
    PERFORM 1 FROM public.down_payment_requests WHERE id = p_source_id;
  ELSE
    PERFORM 1 FROM public.operational_cost_submissions WHERE id = p_source_id;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment source %/% does not exist; do not create an unlinked fund event.',
      p_source_table, p_source_id;
  END IF;

  v_event_key := NULLIF(BTRIM(p_payment_event_key), '');
  IF v_event_key IS NULL THEN
    v_event_key := 'server-generated:' || gen_random_uuid()::text;
  END IF;

  SELECT id, pre_fund_request_id INTO v_existing
  FROM public.pre_fund_transactions
  WHERE idempotency_key = v_event_key;
  IF FOUND THEN
    IF v_existing.pre_fund_request_id <> v_fund_id THEN
      RAISE EXCEPTION 'Payment event key is already linked to a different fund.';
    END IF;
    SELECT verified_paid_amount, verified_available_balance INTO v_paid, v_available
    FROM public.pre_fund_balance_snapshot_v WHERE fund_id = v_fund_id;
    RETURN jsonb_build_object('success', true, 'idempotent', true,
      'transaction_id', v_existing.id, 'new_balance', v_available, 'paid_amount', v_paid);
  END IF;

  -- Lock and validate the source before debiting the fund. A source payment
  -- must already be in the same eligible state used by the canonical ledger,
  -- and its recorded cumulative amount must cover this event plus earlier
  -- immutable events for that source.
  IF p_source_table = 'down_payment_requests' THEN
    SELECT status, COALESCE(total_paid_amount, 0),
      COALESCE((metadata ->> 'deleted')::boolean, false)
    INTO v_source_status, v_source_paid_amount, v_source_deleted
    FROM public.down_payment_requests
    WHERE id = p_source_id
    FOR UPDATE;

    IF v_source_deleted
       OR v_source_status NOT IN ('partially_paid', 'fully_paid', 'paid', 'reconciled') THEN
      RAISE EXCEPTION 'Down-payment source is not eligible for ledger posting (status="%").', v_source_status;
    END IF;
  ELSE
    SELECT status, COALESCE(amount_paid_cents, 0)::NUMERIC / 100
    INTO v_source_status, v_source_paid_amount
    FROM public.operational_cost_submissions
    WHERE id = p_source_id
    FOR UPDATE;

    IF v_source_status NOT IN ('partially_paid', 'paid', 'reconciled') THEN
      RAISE EXCEPTION 'Operational cost source is not eligible for ledger posting (status="%").', v_source_status;
    END IF;
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN transaction_type = 'payment' THEN amount
      WHEN transaction_type IN ('reversal', 'return') THEN -amount
      ELSE 0
    END
  ), 0)
  INTO v_linked_source_amount
  FROM public.pre_fund_transactions
  WHERE source_table = p_source_table
    AND source_id = p_source_id;

  IF p_amount > v_source_paid_amount - v_linked_source_amount THEN
    RAISE EXCEPTION 'Source payment evidence is insufficient (% recorded, % already linked, % requested).',
      v_source_paid_amount, v_linked_source_amount, p_amount;
  END IF;

  SELECT * INTO v_fund
  FROM public.pre_fund_requests
  WHERE id = v_fund_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fund not found.');
  END IF;
  IF v_fund.currency <> p_currency THEN
    RAISE EXCEPTION 'Payment currency % does not match fund currency %.', p_currency, v_fund.currency;
  END IF;
  IF v_fund.available_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Insufficient pre-fund balance (%s %s available; %s requested).',
        v_fund.available_balance, p_currency, p_amount));
  END IF;

  IF p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pre_fund_allocations WHERE pre_fund_request_id = v_fund_id
  ) THEN
    SELECT * INTO v_alloc FROM public.pre_fund_allocations
    WHERE pre_fund_request_id = v_fund_id AND user_id = p_user_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'User has no allocation for this fund. Allocate budget before linking payment.';
    END IF;
    v_has_allocation := true;
    IF v_alloc.spent_amount + p_amount > v_alloc.allocated_amount THEN
      RAISE EXCEPTION 'Insufficient personal allocation (% remaining; % requested).',
        v_alloc.allocated_amount - v_alloc.spent_amount, p_amount;
    END IF;
  END IF;

  INSERT INTO public.pre_fund_transactions (
    pre_fund_request_id, transaction_type, amount, currency, reference,
    description, transaction_date, source_table, source_id, created_by, user_id,
    receipt_url, idempotency_key, event_actor_id, event_reason, event_metadata
  ) VALUES (
    v_fund_id, 'payment', p_amount, p_currency, p_reference,
    COALESCE(p_description, 'Linked payment from ' || p_source_table),
    p_payment_date, p_source_table, p_source_id, p_created_by,
    COALESCE(p_user_id, p_created_by), p_receipt_url, v_event_key,
    COALESCE(p_created_by, auth.uid()), 'payment_event',
    jsonb_build_object('payment_event_key', v_event_key)
  ) RETURNING id INTO v_txn_id;

  -- Each payment event posts independently. The event UUID, rather than the
  -- source id, is the GL idempotency boundary so later instalments are posted.
  IF v_fund.gl_liability_account IS NOT NULL AND v_fund.gl_receipt_account IS NOT NULL THEN
    SELECT id INTO v_liability_account_id
    FROM public.acct_accounts WHERE code = v_fund.gl_liability_account LIMIT 1;
    SELECT id INTO v_receipt_account_id
    FROM public.acct_accounts WHERE code = v_fund.gl_receipt_account LIMIT 1;
    IF v_liability_account_id IS NOT NULL AND v_receipt_account_id IS NOT NULL THEN
      INSERT INTO public.acct_journal_entries (
        description_en, description_ar, posting_date, status,
        source_type, source_id, idempotency_key, created_by
      ) VALUES (
        'Pre-Fund Disbursement — ' || COALESCE(p_description, p_source_table),
        'صرف التمويل المسبق — ' || COALESCE(p_description, p_source_table),
        p_payment_date, 'draft', 'pre_fund_transactions', v_txn_id,
        'pf-paid-event:' || v_txn_id::text, p_created_by
      ) RETURNING id INTO v_journal_entry_id;
      INSERT INTO public.acct_journal_lines (
        entry_id, line_no, account_id, debit_credit, original_amount,
        original_currency, functional_amount, functional_currency, description, function
      ) VALUES
        (v_journal_entry_id, 1, v_liability_account_id, 'DR', p_amount, p_currency,
          p_amount, p_currency, 'Pre-fund disbursement — liability released', 'program'),
        (v_journal_entry_id, 2, v_receipt_account_id, 'CR', p_amount, p_currency,
          p_amount, p_currency, 'Pre-fund disbursement — cash/bank outflow', 'program');
      INSERT INTO public.acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
      VALUES ('pre_fund_transactions', v_txn_id, 'pre_fund_paid', 'success', v_journal_entry_id);
    END IF;
  END IF;

  IF v_has_allocation THEN
    UPDATE public.pre_fund_allocations
    SET spent_amount = spent_amount + p_amount, updated_at = now()
    WHERE id = v_alloc.id;
  END IF;

  IF p_source_table = 'down_payment_requests' THEN
    UPDATE public.down_payment_requests SET pre_fund_transaction_id = v_txn_id WHERE id = p_source_id;
  ELSE
    UPDATE public.operational_cost_submissions SET pre_fund_transaction_id = v_txn_id WHERE id = p_source_id;
  END IF;

  SELECT verified_paid_amount, verified_available_balance INTO v_paid, v_available
  FROM public.pre_fund_balance_snapshot_v WHERE fund_id = v_fund_id;
  UPDATE public.pre_fund_requests
  SET paid_amount = v_paid, available_balance = v_available, updated_at = now()
  WHERE id = v_fund_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_txn_id,
    'new_balance', v_available, 'paid_amount', v_paid);
END;
$$;

REVOKE ALL ON FUNCTION public.link_payment_atomically_rpc(TEXT,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,DATE,UUID,UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_payment_atomically_rpc(TEXT,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,DATE,UUID,UUID,TEXT,TEXT) TO authenticated;

-- Manual Finance entries use the same immutable ledger and cache calculation.
-- The source-specific linker above remains the only route for source payments.
DROP FUNCTION IF EXISTS public.add_pre_fund_transaction_rpc(UUID,TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT,DATE,UUID,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.add_pre_fund_transaction_rpc(UUID,TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT,DATE,UUID,TEXT,TEXT,UUID);

CREATE FUNCTION public.add_pre_fund_transaction_rpc(
  p_fund_id UUID,
  p_fund_name TEXT,
  p_transaction_type TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_reference TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_transaction_date DATE DEFAULT CURRENT_DATE,
  p_created_by UUID DEFAULT NULL,
  p_gl_debit_code TEXT DEFAULT NULL,
  p_gl_credit_code TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_payment_event_key TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fund RECORD;
  v_alloc RECORD;
  v_txn_id UUID;
  v_existing UUID;
  v_event_key TEXT;
  v_paid NUMERIC;
  v_available NUMERIC;
  v_dr_id UUID;
  v_cr_id UUID;
  v_je_id UUID;
BEGIN
  PERFORM public._assert_finance_role();
  IF p_transaction_type NOT IN ('receipt','commitment','carry_forward','return','adjustment') THEN
    RAISE EXCEPTION 'Unsupported pre-fund transaction type "%".', p_transaction_type;
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Transaction amount must be greater than zero.';
  END IF;

  v_event_key := NULLIF(BTRIM(p_payment_event_key), '');
  IF v_event_key IS NULL THEN
    v_event_key := 'manual:' || p_fund_id::text || ':' || p_transaction_type || ':' ||
      COALESCE(p_reference, '') || ':' || p_transaction_date::text || ':' || p_amount::text;
  END IF;
  SELECT id INTO v_existing FROM public.pre_fund_transactions WHERE idempotency_key = v_event_key;
  IF FOUND THEN
    SELECT verified_paid_amount, verified_available_balance INTO v_paid, v_available
    FROM public.pre_fund_balance_snapshot_v WHERE fund_id = p_fund_id;
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'transaction_id', v_existing,
      'new_balance', v_available, 'paid_amount', v_paid);
  END IF;

  SELECT * INTO v_fund FROM public.pre_fund_requests WHERE id = p_fund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found.'; END IF;
  IF v_fund.currency <> p_currency THEN
    RAISE EXCEPTION 'Transaction currency % does not match fund currency %.', p_currency, v_fund.currency;
  END IF;
  IF p_transaction_type = 'payment' AND v_fund.available_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient pre-fund balance.';
  END IF;

  IF p_transaction_type = 'payment' AND p_user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.pre_fund_allocations WHERE pre_fund_request_id = p_fund_id) THEN
    SELECT * INTO v_alloc FROM public.pre_fund_allocations
    WHERE pre_fund_request_id = p_fund_id AND user_id = p_user_id FOR UPDATE;
    IF NOT FOUND OR v_alloc.spent_amount + p_amount > v_alloc.allocated_amount THEN
      RAISE EXCEPTION 'Insufficient personal allocation for manual payment.';
    END IF;
  END IF;

  INSERT INTO public.pre_fund_transactions (
    pre_fund_request_id, transaction_type, amount, currency, reference, description,
    transaction_date, created_by, user_id, idempotency_key, event_actor_id, event_reason, event_metadata
  ) VALUES (
    p_fund_id, p_transaction_type, p_amount, p_currency, p_reference, p_description,
    p_transaction_date, p_created_by, COALESCE(p_user_id, p_created_by), v_event_key,
    COALESCE(p_created_by, auth.uid()), 'manual_finance_entry',
    jsonb_build_object('payment_event_key', v_event_key)
  ) RETURNING id INTO v_txn_id;

  IF p_transaction_type = 'payment' AND v_alloc.id IS NOT NULL THEN
    UPDATE public.pre_fund_allocations
    SET spent_amount = spent_amount + p_amount, updated_at = now()
    WHERE id = v_alloc.id;
  END IF;

  IF p_gl_debit_code IS NOT NULL OR p_gl_credit_code IS NOT NULL THEN
    IF p_gl_debit_code IS NULL OR p_gl_credit_code IS NULL THEN
      RAISE EXCEPTION 'Both debit and credit GL accounts are required when posting a manual transaction.';
    END IF;
    SELECT id INTO v_dr_id FROM public.acct_accounts WHERE code = p_gl_debit_code LIMIT 1;
    SELECT id INTO v_cr_id FROM public.acct_accounts WHERE code = p_gl_credit_code LIMIT 1;
    IF v_dr_id IS NULL OR v_cr_id IS NULL THEN
      RAISE EXCEPTION 'GL account not found (DR: %, CR: %).', p_gl_debit_code, p_gl_credit_code;
    END IF;
    INSERT INTO public.acct_journal_entries (
      description_en, posting_date, status, source_type, source_id, idempotency_key, created_by
    ) VALUES (
      'Pre-Fund ' || p_transaction_type || ' — ' || p_fund_name,
      p_transaction_date, 'draft', 'pre_fund_transactions', v_txn_id,
      'pf-event:' || v_txn_id::text, p_created_by
    ) RETURNING id INTO v_je_id;
    INSERT INTO public.acct_journal_lines (
      entry_id, line_no, account_id, debit_credit, original_amount, original_currency,
      functional_amount, functional_currency, description, function
    ) VALUES
      (v_je_id, 1, v_dr_id, 'DR', p_amount, p_currency, p_amount, p_currency,
        'Pre-fund ' || p_transaction_type, 'program'),
      (v_je_id, 2, v_cr_id, 'CR', p_amount, p_currency, p_amount, p_currency,
        'Pre-fund ' || p_transaction_type, 'program');
  END IF;

  SELECT verified_paid_amount, verified_available_balance INTO v_paid, v_available
  FROM public.pre_fund_balance_snapshot_v WHERE fund_id = p_fund_id;
  UPDATE public.pre_fund_requests
  SET paid_amount = v_paid, available_balance = v_available, updated_at = now()
  WHERE id = p_fund_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_txn_id,
    'journal_entry_id', v_je_id, 'gl_posted', v_je_id IS NOT NULL,
    'new_balance', v_available, 'paid_amount', v_paid);
END;
$$;

REVOKE ALL ON FUNCTION public.add_pre_fund_transaction_rpc(UUID,TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT,DATE,UUID,TEXT,TEXT,UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_pre_fund_transaction_rpc(UUID,TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT,DATE,UUID,TEXT,TEXT,UUID,TEXT) TO authenticated;

-- Private ledger primitive. Do not grant this to authenticated callers: OCS
-- reversals must also transition their source in the authorised outer RPC.
CREATE OR REPLACE FUNCTION public._unlink_pre_fund_payment_internal_rpc(
  p_source_table TEXT,
  p_source_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment RECORD;
  v_fund_id UUID;
  v_reversed_count INTEGER := 0;
  v_amount_restored NUMERIC := 0;
  v_paid NUMERIC;
  v_available NUMERIC;
  v_latest_id UUID;
  v_affected_fund_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  FOR v_payment IN
    SELECT t.*
    FROM public.pre_fund_transactions t
    WHERE t.source_table = p_source_table
      AND t.source_id = p_source_id
      AND t.transaction_type = 'payment'
      AND NOT EXISTS (
        SELECT 1 FROM public.pre_fund_transactions r WHERE r.reversal_of_id = t.id
      )
    ORDER BY t.occurred_at, t.id
  LOOP
    v_fund_id := v_payment.pre_fund_request_id;
    IF NOT (v_fund_id = ANY(v_affected_fund_ids)) THEN
      v_affected_fund_ids := array_append(v_affected_fund_ids, v_fund_id);
    END IF;
    PERFORM 1 FROM public.pre_fund_requests WHERE id = v_fund_id FOR UPDATE;

    INSERT INTO public.pre_fund_transactions (
      pre_fund_request_id, transaction_type, amount, currency, reference,
      description, transaction_date, source_table, source_id, created_by, user_id,
      receipt_url, idempotency_key, reversal_of_id, event_actor_id, event_reason, event_metadata
    ) VALUES (
      v_payment.pre_fund_request_id, 'reversal', v_payment.amount, v_payment.currency,
      v_payment.reference, 'Reversal of pre-fund payment ' || v_payment.id::text,
      CURRENT_DATE, v_payment.source_table, v_payment.source_id, auth.uid(), v_payment.user_id,
      v_payment.receipt_url, 'reversal:' || v_payment.id::text, v_payment.id, auth.uid(),
      'source_payment_reversed', jsonb_build_object('reversal_of_id', v_payment.id)
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    IF FOUND THEN
      IF v_payment.user_id IS NOT NULL THEN
        UPDATE public.pre_fund_allocations
        SET spent_amount = GREATEST(0, spent_amount - v_payment.amount), updated_at = now()
        WHERE pre_fund_request_id = v_payment.pre_fund_request_id
          AND user_id = v_payment.user_id;
      END IF;
      v_reversed_count := v_reversed_count + 1;
      v_amount_restored := v_amount_restored + v_payment.amount;
    END IF;
  END LOOP;

  IF v_reversed_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'no_link_found',
      'error', 'No active pre-fund payment event linked to this record.');
  END IF;

  UPDATE public.pre_fund_requests f
  SET paid_amount = b.verified_paid_amount,
      available_balance = b.verified_available_balance,
      updated_at = now()
  FROM public.pre_fund_balance_snapshot_v b
  WHERE b.fund_id = f.id
    AND f.id = ANY(v_affected_fund_ids);

  SELECT verified_paid_amount, verified_available_balance INTO v_paid, v_available
  FROM public.pre_fund_balance_snapshot_v WHERE fund_id = v_fund_id;

  SELECT id INTO v_latest_id
  FROM public.pre_fund_transactions t
  WHERE t.source_table = p_source_table AND t.source_id = p_source_id
    AND t.transaction_type = 'payment'
    AND NOT EXISTS (SELECT 1 FROM public.pre_fund_transactions r WHERE r.reversal_of_id = t.id)
  ORDER BY t.occurred_at DESC, t.id DESC LIMIT 1;

  IF p_source_table = 'down_payment_requests' THEN
    UPDATE public.down_payment_requests SET pre_fund_transaction_id = v_latest_id WHERE id = p_source_id;
  ELSIF p_source_table = 'operational_cost_submissions' THEN
    UPDATE public.operational_cost_submissions SET pre_fund_transaction_id = v_latest_id WHERE id = p_source_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'fund_id', v_fund_id,
    'reversed_event_count', v_reversed_count, 'amount_restored', v_amount_restored,
    'new_balance', v_available);
END;
$$;

REVOKE ALL ON FUNCTION public._unlink_pre_fund_payment_internal_rpc(TEXT,UUID) FROM PUBLIC;

-- Down Payment cancellation has its own authorised source transition. OCS
-- sources deliberately cannot use this public low-level reversal endpoint.
CREATE OR REPLACE FUNCTION public.unlink_payment_atomically_rpc(
  p_source_table TEXT,
  p_source_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_finance_role();
  IF p_source_table <> 'down_payment_requests' THEN
    RAISE EXCEPTION 'Operational cost payment reversals must use the authorised atomic source transition.';
  END IF;
  RETURN public._unlink_pre_fund_payment_internal_rpc(p_source_table, p_source_id);
END;
$$;

REVOKE ALL ON FUNCTION public.unlink_payment_atomically_rpc(TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlink_payment_atomically_rpc(TEXT,UUID) TO authenticated;

-- An OCS source mutation and its compensating ledger reversals must be one
-- transaction. Calling unlink and then mutating the source from the browser
-- can leave a paid source with reversed fund spend if the second request fails.
CREATE OR REPLACE FUNCTION public.revert_operational_cost_payments_atomically_rpc(
  p_source_ids UUID[],
  p_action TEXT DEFAULT 'revert'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source RECORD;
  v_source_count INTEGER;
  v_unlink_result JSONB;
  v_reverted_sources INTEGER := 0;
  v_deleted_sources INTEGER := 0;
  v_role TEXT;
  v_is_service_role BOOLEAN := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
BEGIN
  IF p_action NOT IN ('revert', 'delete') THEN
    RAISE EXCEPTION 'Unsupported OCS payment action "%".', p_action;
  END IF;
  IF COALESCE(array_length(p_source_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'At least one operational cost source is required.';
  END IF;

  -- SECURITY DEFINER bypasses OCS RLS, so preserve the former operation-level
  -- authorization here rather than broadening access through the finance helper.
  IF NOT v_is_service_role THEN
    SELECT lower(trim(role)) INTO v_role
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1;

    IF p_action = 'delete' THEN
      IF COALESCE(v_role, '') NOT IN ('super_admin', 'superadmin') THEN
        RAISE EXCEPTION 'Access denied: only a Super Admin can delete an operational cost submission.';
      END IF;
    ELSIF COALESCE(v_role, '') NOT IN ('super_admin', 'superadmin', 'admin', 'administrator') THEN
      RAISE EXCEPTION 'Access denied: only an Admin or Super Admin can revert a paid operational cost submission.';
    END IF;
  END IF;

  SELECT count(*) INTO v_source_count
  FROM public.operational_cost_submissions
  WHERE id = ANY(p_source_ids);
  IF v_source_count <> array_length(p_source_ids, 1) THEN
    RAISE EXCEPTION 'One or more operational cost sources do not exist.';
  END IF;

  -- Validate every locked source before a single reversal is written. A failure
  -- aborts this function, including every inserted reversal/cache adjustment.
  FOR v_source IN
    SELECT id, status
    FROM public.operational_cost_submissions
    WHERE id = ANY(p_source_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    IF p_action = 'revert' AND v_source.status <> 'paid' THEN
      RAISE EXCEPTION 'Only paid operational cost submissions can be reverted (source %, status "%").',
        v_source.id, v_source.status;
    END IF;
    IF p_action = 'delete' AND v_source.status = 'reconciled' THEN
      RAISE EXCEPTION 'Reconciled operational cost submissions cannot be deleted (source %).', v_source.id;
    END IF;
  END LOOP;

  -- Sources remain locked while the nested unlink RPC takes its fund locks.
  FOR v_source IN
    SELECT id
    FROM public.operational_cost_submissions
    WHERE id = ANY(p_source_ids)
    ORDER BY id
  LOOP
    v_unlink_result := public._unlink_pre_fund_payment_internal_rpc(
      'operational_cost_submissions', v_source.id
    );
    IF COALESCE((v_unlink_result ->> 'success')::boolean, false) THEN
      v_reverted_sources := v_reverted_sources + 1;
    ELSIF v_unlink_result ->> 'code' <> 'no_link_found' THEN
      RAISE EXCEPTION 'Unable to reverse source %: %',
        v_source.id, COALESCE(v_unlink_result ->> 'error', 'unknown error');
    END IF;

    IF p_action = 'delete' THEN
      DELETE FROM public.operational_cost_submissions WHERE id = v_source.id;
      v_deleted_sources := v_deleted_sources + 1;
    ELSE
      UPDATE public.operational_cost_submissions
      SET status = 'approved',
          paid_at = NULL,
          paid_by = NULL,
          amount_paid_cents = 0,
          payment_proof_url = NULL,
          payment_proof_notes = NULL,
          payment_proof_uploaded_at = NULL,
          updated_at = now()
      WHERE id = v_source.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'source_count', v_source_count,
    'reversed_source_count', v_reverted_sources,
    'deleted_source_count', v_deleted_sources
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revert_operational_cost_payments_atomically_rpc(UUID[],TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revert_operational_cost_payments_atomically_rpc(UUID[],TEXT) TO authenticated;

-- Finance-only controlled repair: invoke only after evidence proves a source
-- payment belongs to this fund. The original history remains untouched.
CREATE OR REPLACE FUNCTION public.apply_pre_fund_historic_correction_rpc(
  p_fund_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_source_table TEXT,
  p_source_id UUID,
  p_reference TEXT,
  p_evidence_note TEXT,
  p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(BTRIM(p_evidence_note), '') = '' THEN
    RAISE EXCEPTION 'Historic correction requires an evidence note.';
  END IF;
  RETURN public.link_payment_atomically_rpc(
    p_fund_id::text, p_amount, p_currency, p_source_table, p_source_id,
    p_reference, 'Historic payment correction: ' || p_evidence_note,
    CURRENT_DATE, auth.uid(), NULL, NULL,
    'historic-correction:' || p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_pre_fund_historic_correction_rpc(UUID,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_pre_fund_historic_correction_rpc(UUID,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
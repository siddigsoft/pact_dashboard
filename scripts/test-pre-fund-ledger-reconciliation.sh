#!/usr/bin/env bash
set -euo pipefail

# Disposable PostgreSQL regression harness for
# supabase/migrations/20260820e_pre_fund_ledger_reconciliation.sql.
# It deliberately uses a local cluster: no Supabase data is touched.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="$(dirname "$(command -v initdb)")"
TMP_DIR="$(mktemp -d)"
PORT="${PRE_FUND_TEST_PORT:-55439}"
SOCKET_DIR="$TMP_DIR/socket"
DB="pre_fund_ledger_test"

cleanup() {
  "$PG_BIN/pg_ctl" -D "$TMP_DIR/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$SOCKET_DIR"
"$PG_BIN/initdb" -D "$TMP_DIR/data" --no-locale --encoding=UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$TMP_DIR/data" -o "-k $SOCKET_DIR -p $PORT" -w start >/dev/null
PSQL=("$PG_BIN/psql" -h "$SOCKET_DIR" -p "$PORT" -U "$(id -un)" -d postgres -v ON_ERROR_STOP=1)

"${PSQL[@]}" <<'SQL'
CREATE EXTENSION pgcrypto;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text);
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001');
INSERT INTO public.profiles VALUES ('00000000-0000-0000-0000-000000000001', 'super_admin');

CREATE TABLE public.pre_fund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, currency text NOT NULL,
  amount numeric NOT NULL, available_balance numeric NOT NULL DEFAULT 0, paid_amount numeric NOT NULL DEFAULT 0,
  committed_amount numeric NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'active',
  gl_liability_account text, gl_receipt_account text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.pre_fund_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pre_fund_request_id uuid NOT NULL REFERENCES public.pre_fund_requests(id),
  transaction_type text NOT NULL, amount numeric NOT NULL, currency text NOT NULL,
  reference text, description text, transaction_date date NOT NULL DEFAULT current_date,
  reconciled boolean NOT NULL DEFAULT false, reconciled_at timestamptz,
  source_table text, source_id uuid, encumbrance_id uuid, gl_entry_id uuid,
  user_id uuid REFERENCES auth.users(id), receipt_url text, created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.pre_fund_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pre_fund_request_id uuid NOT NULL REFERENCES public.pre_fund_requests(id),
  user_id uuid NOT NULL REFERENCES auth.users(id), allocated_amount numeric NOT NULL, spent_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL, notes text, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(pre_fund_request_id, user_id)
);
CREATE TABLE public.down_payment_requests (
  id uuid PRIMARY KEY, status text, metadata jsonb DEFAULT '{}'::jsonb,
  total_paid_amount numeric NOT NULL DEFAULT 0, pre_fund_transaction_id uuid
);
CREATE TABLE public.operational_cost_submissions (
  id uuid PRIMARY KEY, status text, amount_paid_cents bigint NOT NULL DEFAULT 0, pre_fund_transaction_id uuid,
  paid_at timestamptz, paid_by uuid, payment_proof_url text, payment_proof_notes text,
  payment_proof_uploaded_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.acct_accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE);
CREATE TABLE public.acct_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), description_en text, description_ar text, posting_date date,
  status text, source_type text, source_id uuid, idempotency_key text UNIQUE, created_by uuid
);
CREATE TABLE public.acct_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entry_id uuid, line_no int, account_id uuid, debit_credit text,
  original_amount numeric, original_currency text, functional_amount numeric, functional_currency text,
  description text, function text
);
CREATE TABLE public.acct_gl_bridge_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_table text, source_id uuid, event_type text, status text, journal_entry_id uuid
);
-- This row exists before the migration so its initial canonical cache refresh
-- proves commitments remain reserved instead of being released.
INSERT INTO public.pre_fund_requests (
  id, name, currency, amount, available_balance, paid_amount, committed_amount,
  gl_liability_account, gl_receipt_account
) VALUES (
  '10000000-0000-0000-0000-000000000005', 'Committed Cash Regression Fund', 'SDG',
  1000, 700, 0, 300, '2400', '1200'
);
SQL

"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260820e_pre_fund_ledger_reconciliation.sql" >/dev/null

"${PSQL[@]}" <<'SQL'
INSERT INTO public.acct_accounts (code) VALUES ('1200'), ('2400');
INSERT INTO public.pre_fund_requests (
  id, name, currency, amount, available_balance, paid_amount, gl_liability_account, gl_receipt_account
) VALUES (
  '10000000-0000-0000-0000-000000000001', 'Regression Fund', 'SDG', 1000, 1000, 0, '2400', '1200'
);
INSERT INTO public.pre_fund_requests (
  id, name, currency, amount, available_balance, paid_amount, gl_liability_account, gl_receipt_account
) VALUES (
  '10000000-0000-0000-0000-000000000002', 'Second Regression Fund', 'SDG', 500, 500, 0, '2400', '1200'
);
INSERT INTO public.pre_fund_requests (
  id, name, currency, amount, available_balance, paid_amount, gl_liability_account, gl_receipt_account
) VALUES (
  '10000000-0000-0000-0000-000000000003', 'Partial Payment Fund', 'SDG', 200, 200, 0, '2400', '1200'
);
INSERT INTO public.pre_fund_requests (
  id, name, currency, amount, available_balance, paid_amount, gl_liability_account, gl_receipt_account
) VALUES (
  '10000000-0000-0000-0000-000000000004', 'Duplicate-Key Regression Fund', 'SDG', 200, 200, 0, '2400', '1200'
);
DO $$
DECLARE v_paid numeric; v_available numeric;
BEGIN
  SELECT paid_amount, available_balance INTO v_paid, v_available
  FROM public.pre_fund_requests WHERE id = '10000000-0000-0000-0000-000000000005';
  IF v_paid <> 0 OR v_available <> 700 THEN
    RAISE EXCEPTION 'committed-fund reconciliation released reserved cash: paid %, available %', v_paid, v_available;
  END IF;
END $$;
INSERT INTO public.down_payment_requests (id, status, total_paid_amount)
VALUES ('30000000-0000-0000-0000-000000000007', 'paid', 800);
DO $$
DECLARE v_result jsonb; v_available numeric;
BEGIN
  SELECT public.link_payment_atomically_rpc(
    '10000000-0000-0000-0000-000000000005', 800, 'SDG', 'down_payment_requests',
    '30000000-0000-0000-0000-000000000007', NULL, 'Must respect commitment', CURRENT_DATE,
    auth.uid(), NULL, NULL, 'committed-cash-overdraft'
  ) INTO v_result;
  SELECT available_balance INTO v_available
  FROM public.pre_fund_requests WHERE id = '10000000-0000-0000-0000-000000000005';
  IF (v_result ->> 'success')::boolean IS DISTINCT FROM false OR v_available <> 700 THEN
    RAISE EXCEPTION 'committed cash overdraft was accepted: result %, available %', v_result, v_available;
  END IF;
END $$;
SELECT public.link_payment_atomically_rpc(
  '10000000-0000-0000-0000-000000000005', 700, 'SDG', 'down_payment_requests',
  '30000000-0000-0000-0000-000000000007', NULL, 'Spend uncommitted cash', CURRENT_DATE,
  auth.uid(), NULL, NULL, 'committed-cash-allowed'
);
DO $$
DECLARE v_paid numeric; v_available numeric;
BEGIN
  SELECT paid_amount, available_balance INTO v_paid, v_available
  FROM public.pre_fund_requests WHERE id = '10000000-0000-0000-0000-000000000005';
  IF v_paid <> 700 OR v_available <> 0 THEN
    RAISE EXCEPTION 'committed-fund payment cache incorrect: paid %, available %', v_paid, v_available;
  END IF;
END $$;
INSERT INTO public.pre_fund_allocations (
  pre_fund_request_id, user_id, allocated_amount, currency
) VALUES ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 500, 'SDG');
INSERT INTO public.pre_fund_allocations (
  pre_fund_request_id, user_id, allocated_amount, currency
) VALUES ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 200, 'SDG');
INSERT INTO public.pre_fund_allocations (
  pre_fund_request_id, user_id, allocated_amount, currency
) VALUES ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 200, 'SDG');
INSERT INTO public.operational_cost_submissions (id, status, amount_paid_cents)
VALUES ('20000000-0000-0000-0000-000000000001', 'paid', 35000);
-- An initial instalment changes an approved OCS into partially_paid before it is
-- linked. The canonical view must include that first event immediately.
INSERT INTO public.operational_cost_submissions (id, status, amount_paid_cents)
VALUES ('20000000-0000-0000-0000-000000000002', 'approved', 0);
UPDATE public.operational_cost_submissions
SET status = 'partially_paid', amount_paid_cents = 3000
WHERE id = '20000000-0000-0000-0000-000000000002';
SELECT public.link_payment_atomically_rpc(
  '10000000-0000-0000-0000-000000000003', 30, 'SDG', 'operational_cost_submissions',
  '20000000-0000-0000-0000-000000000002', 'initial-partial', 'Initial partial instalment', CURRENT_DATE,
  auth.uid(), auth.uid(), NULL, 'event-initial-partial'
);
DO $$
DECLARE v_paid numeric; v_available numeric;
BEGIN
  SELECT paid_amount, available_balance INTO v_paid, v_available
  FROM public.pre_fund_requests WHERE id = '10000000-0000-0000-0000-000000000003';
  IF v_paid <> 30 OR v_available <> 170 THEN
    RAISE EXCEPTION 'initial partial-payment cache assertion failed: paid %, available %', v_paid, v_available;
  END IF;
END $$;

-- Two equal same-day instalments on one down-payment need separate operation
-- keys. A request/date/amount fingerprint would incorrectly collapse one.
INSERT INTO public.down_payment_requests (id, status, total_paid_amount)
VALUES ('30000000-0000-0000-0000-000000000001', 'paid', 100);
SELECT public.link_payment_atomically_rpc(
  '10000000-0000-0000-0000-000000000004', 50, 'SDG', 'down_payment_requests',
  '30000000-0000-0000-0000-000000000001', NULL, 'First equal instalment', CURRENT_DATE,
  auth.uid(), auth.uid(), NULL, 'dp-batch:30000000-0000-0000-0000-000000000001:operation-one'
);
SELECT public.link_payment_atomically_rpc(
  '10000000-0000-0000-0000-000000000004', 50, 'SDG', 'down_payment_requests',
  '30000000-0000-0000-0000-000000000001', NULL, 'Second equal instalment', CURRENT_DATE,
  auth.uid(), auth.uid(), NULL, 'dp-batch:30000000-0000-0000-0000-000000000001:operation-two'
);
DO $$
DECLARE v_paid numeric; v_available numeric; v_events int;
BEGIN
  SELECT paid_amount, available_balance INTO v_paid, v_available
  FROM public.pre_fund_requests WHERE id = '10000000-0000-0000-0000-000000000004';
  SELECT count(*) INTO v_events
  FROM public.pre_fund_transactions
  WHERE pre_fund_request_id = '10000000-0000-0000-0000-000000000004'
    AND transaction_type = 'payment';
  IF v_paid <> 100 OR v_available <> 100 OR v_events <> 2 THEN
    RAISE EXCEPTION 'same-day equal-instalment assertion failed: paid %, available %, events %',
      v_paid, v_available, v_events;
  END IF;
END $$;

-- The source gate must reject both unverified state and unsupported payment
-- evidence before it can reserve or debit a pre-fund balance.
INSERT INTO public.down_payment_requests (id, status, total_paid_amount)
VALUES ('30000000-0000-0000-0000-000000000002', 'pending', 100);
DO $$
BEGIN
  BEGIN
    PERFORM public.link_payment_atomically_rpc(
      '10000000-0000-0000-0000-000000000004', 50, 'SDG', 'down_payment_requests',
      '30000000-0000-0000-0000-000000000002', NULL, 'Must reject pending source', CURRENT_DATE,
      auth.uid(), auth.uid(), NULL, 'pending-source'
    );
    RAISE EXCEPTION 'pending source was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'pending source was accepted' THEN RAISE; END IF;
  END;
END $$;

INSERT INTO public.down_payment_requests (id, status, total_paid_amount)
VALUES ('30000000-0000-0000-0000-000000000003', 'approved', 100);
DO $$
BEGIN
  BEGIN
    PERFORM public.link_payment_atomically_rpc(
      '10000000-0000-0000-0000-000000000004', 50, 'SDG', 'down_payment_requests',
      '30000000-0000-0000-0000-000000000003', NULL, 'Must reject approved source', CURRENT_DATE,
      auth.uid(), auth.uid(), NULL, 'approved-down-payment-source'
    );
    RAISE EXCEPTION 'approved down-payment source was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'approved down-payment source was accepted' THEN RAISE; END IF;
  END;
END $$;

INSERT INTO public.operational_cost_submissions (id, status, amount_paid_cents)
VALUES ('20000000-0000-0000-0000-000000000003', 'approved', 10000);
DO $$
BEGIN
  BEGIN
    PERFORM public.link_payment_atomically_rpc(
      '10000000-0000-0000-0000-000000000004', 50, 'SDG', 'operational_cost_submissions',
      '20000000-0000-0000-0000-000000000003', NULL, 'Must reject approved source', CURRENT_DATE,
      auth.uid(), auth.uid(), NULL, 'approved-source'
    );
    RAISE EXCEPTION 'approved source was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'approved source was accepted' THEN RAISE; END IF;
  END;
END $$;

-- A failed source reset must roll back every reversal created in the same RPC.
-- This simulates RLS/validation/network-adjacent mutation failure at the
-- database boundary rather than allowing a paid source to lose its ledger spend.
INSERT INTO public.operational_cost_submissions (id, status, amount_paid_cents)
VALUES ('20000000-0000-0000-0000-000000000004', 'paid', 5000);
SELECT public.link_payment_atomically_rpc(
  '10000000-0000-0000-0000-000000000004', 50, 'SDG', 'operational_cost_submissions',
  '20000000-0000-0000-0000-000000000004', NULL, 'Atomic revert rollback fixture', CURRENT_DATE,
  auth.uid(), auth.uid(), NULL, 'atomic-revert-rollback-fixture'
);
-- SECURITY DEFINER must not let a broad finance role bypass the prior
-- admin/super-admin payment-revert and Super-Admin delete boundaries.
UPDATE public.profiles
SET role = 'financial_admin'
WHERE id = auth.uid();
DO $$
BEGIN
  BEGIN
    PERFORM public.unlink_payment_atomically_rpc(
      'operational_cost_submissions', '20000000-0000-0000-0000-000000000004'
    );
    RAISE EXCEPTION 'financial admin directly reversed a protected OCS payment';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'financial admin directly reversed a protected OCS payment' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.revert_operational_cost_payments_atomically_rpc(
      ARRAY['20000000-0000-0000-0000-000000000004'::uuid], 'revert'
    );
    RAISE EXCEPTION 'financial admin was allowed to revert a protected OCS';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'financial admin was allowed to revert a protected OCS' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.revert_operational_cost_payments_atomically_rpc(
      ARRAY['20000000-0000-0000-0000-000000000004'::uuid], 'delete'
    );
    RAISE EXCEPTION 'financial admin was allowed to delete a protected OCS';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'financial admin was allowed to delete a protected OCS' THEN RAISE; END IF;
  END;
END $$;
UPDATE public.profiles
SET role = 'super_admin'
WHERE id = auth.uid();
INSERT INTO public.operational_cost_submissions (id, status, amount_paid_cents)
VALUES ('20000000-0000-0000-0000-000000000005', 'reconciled', 0);
DO $$
BEGIN
  BEGIN
    PERFORM public.revert_operational_cost_payments_atomically_rpc(
      ARRAY['20000000-0000-0000-0000-000000000003'::uuid], 'revert'
    );
    RAISE EXCEPTION 'approved OCS was allowed to use the paid revert action';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'approved OCS was allowed to use the paid revert action' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.revert_operational_cost_payments_atomically_rpc(
      ARRAY['20000000-0000-0000-0000-000000000005'::uuid], 'delete'
    );
    RAISE EXCEPTION 'reconciled OCS was allowed to be deleted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'reconciled OCS was allowed to be deleted' THEN RAISE; END IF;
  END;
END $$;
CREATE OR REPLACE FUNCTION public.fail_atomic_revert_source_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id = '20000000-0000-0000-0000-000000000004'::uuid THEN
    RAISE EXCEPTION 'forced source update failure';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_fail_atomic_revert_source_update
BEFORE UPDATE ON public.operational_cost_submissions
FOR EACH ROW EXECUTE FUNCTION public.fail_atomic_revert_source_update();
DO $$
BEGIN
  BEGIN
    PERFORM public.revert_operational_cost_payments_atomically_rpc(
      ARRAY['20000000-0000-0000-0000-000000000004'::uuid], 'revert'
    );
    RAISE EXCEPTION 'atomic revert unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'atomic revert unexpectedly succeeded' THEN RAISE; END IF;
  END;
END $$;
DO $$
DECLARE v_status text; v_paid_cents bigint; v_reversals int; v_paid numeric; v_available numeric;
BEGIN
  SELECT status, amount_paid_cents INTO v_status, v_paid_cents
  FROM public.operational_cost_submissions WHERE id = '20000000-0000-0000-0000-000000000004';
  SELECT count(*) INTO v_reversals
  FROM public.pre_fund_transactions
  WHERE reversal_of_id IS NOT NULL
    AND source_id = '20000000-0000-0000-0000-000000000004';
  SELECT paid_amount, available_balance INTO v_paid, v_available
  FROM public.pre_fund_requests WHERE id = '10000000-0000-0000-0000-000000000004';
  IF v_status <> 'paid' OR v_paid_cents <> 5000 OR v_reversals <> 0 OR v_paid <> 150 OR v_available <> 50 THEN
    RAISE EXCEPTION 'atomic revert rollback assertion failed: status %, source paid %, reversals %, fund %/%',
      v_status, v_paid_cents, v_reversals, v_paid, v_available;
  END IF;
END $$;
DROP TRIGGER trg_fail_atomic_revert_source_update ON public.operational_cost_submissions;
SELECT public.revert_operational_cost_payments_atomically_rpc(
  ARRAY['20000000-0000-0000-0000-000000000004'::uuid], 'revert'
);
DO $$
DECLARE v_status text; v_paid_cents bigint; v_paid numeric; v_available numeric;
BEGIN
  SELECT status, amount_paid_cents INTO v_status, v_paid_cents
  FROM public.operational_cost_submissions WHERE id = '20000000-0000-0000-0000-000000000004';
  SELECT paid_amount, available_balance INTO v_paid, v_available
  FROM public.pre_fund_requests WHERE id = '10000000-0000-0000-0000-000000000004';
  IF v_status <> 'approved' OR v_paid_cents <> 0 OR v_paid <> 100 OR v_available <> 100 THEN
    RAISE EXCEPTION 'atomic revert success assertion failed: status %, source paid %, fund %/%',
      v_status, v_paid_cents, v_paid, v_available;
  END IF;
END $$;

SELECT public.link_payment_atomically_rpc(
  '10000000-0000-0000-0000-000000000001', 100, 'SDG', 'operational_cost_submissions',
  '20000000-0000-0000-0000-000000000001', 'first', 'First instalment', CURRENT_DATE,
  auth.uid(), auth.uid(), NULL, 'event-one'
);
SELECT public.link_payment_atomically_rpc(
  '10000000-0000-0000-0000-000000000001', 200, 'SDG', 'operational_cost_submissions',
  '20000000-0000-0000-0000-000000000001', 'second', 'Second instalment', CURRENT_DATE,
  auth.uid(), auth.uid(), NULL, 'event-two'
);
-- Same event key is a retry, not a third payment.
SELECT public.link_payment_atomically_rpc(
  '10000000-0000-0000-0000-000000000001', 100, 'SDG', 'operational_cost_submissions',
  '20000000-0000-0000-0000-000000000001', 'first', 'First instalment', CURRENT_DATE,
  auth.uid(), auth.uid(), NULL, 'event-one'
);

DO $$
DECLARE v_paid numeric; v_available numeric; v_events int; v_gl int; v_spent numeric;
BEGIN
  SELECT paid_amount, available_balance INTO v_paid, v_available
  FROM public.pre_fund_requests WHERE id = '10000000-0000-0000-0000-000000000001';
   SELECT count(*) INTO v_events
   FROM public.pre_fund_transactions
   WHERE transaction_type = 'payment'
     AND pre_fund_request_id = '10000000-0000-0000-0000-000000000001';
   SELECT count(*) INTO v_gl
   FROM public.acct_journal_entries
   WHERE source_type = 'pre_fund_transactions';
   SELECT spent_amount INTO v_spent
   FROM public.pre_fund_allocations
   WHERE pre_fund_request_id = '10000000-0000-0000-0000-000000000001';
   IF v_paid <> 300 OR v_available <> 700 OR v_events <> 2 OR v_gl <> 7 OR v_spent <> 300 THEN
    RAISE EXCEPTION 'instalment/idempotency assertion failed: paid %, avail %, events %, GL %, spent %',
      v_paid, v_available, v_events, v_gl, v_spent;
  END IF;
END $$;

-- A source may contain separate evidenced instalments paid by two funds.
SELECT public.link_payment_atomically_rpc(
  '10000000-0000-0000-0000-000000000002', 50, 'SDG', 'operational_cost_submissions',
  '20000000-0000-0000-0000-000000000001', 'third', 'Third instalment from a second fund', CURRENT_DATE,
  auth.uid(), NULL, NULL, 'event-three'
);
DO $$
DECLARE v_gaps int;
BEGIN
  SELECT count(*) INTO v_gaps
  FROM public.pre_fund_historic_exceptions_v
  WHERE exception_type = 'source_payment_gap'
    AND source_table = 'operational_cost_submissions'
    AND source_id = '20000000-0000-0000-0000-000000000001';
  IF v_gaps <> 0 THEN
    RAISE EXCEPTION 'fully covered split-fund OCS was incorrectly reported as a gap';
  END IF;
END $$;

-- A source becoming invalid must refresh the cache from the same canonical view.
UPDATE public.operational_cost_submissions
SET status = 'cancelled'
WHERE id = '20000000-0000-0000-0000-000000000001';
DO $$
DECLARE v_paid numeric; v_available numeric; v_second_paid numeric; v_second_available numeric;
BEGIN
  SELECT paid_amount, available_balance INTO v_paid, v_available
  FROM public.pre_fund_requests WHERE id = '10000000-0000-0000-0000-000000000001';
  SELECT paid_amount, available_balance INTO v_second_paid, v_second_available
  FROM public.pre_fund_requests WHERE id = '10000000-0000-0000-0000-000000000002';
  IF v_paid <> 0 OR v_available <> 1000 OR v_second_paid <> 0 OR v_second_available <> 500 THEN
    RAISE EXCEPTION 'source invalidation cache refresh failed: first %/%, second %/%',
      v_paid, v_available, v_second_paid, v_second_available;
  END IF;
END $$;
UPDATE public.operational_cost_submissions
SET status = 'paid'
WHERE id = '20000000-0000-0000-0000-000000000001';

SELECT public.revert_operational_cost_payments_atomically_rpc(
  ARRAY['20000000-0000-0000-0000-000000000001'::uuid], 'revert'
);

DO $$
DECLARE v_paid numeric; v_available numeric; v_reversals int; v_spent numeric;
        v_second_paid numeric; v_second_available numeric;
BEGIN
  SELECT paid_amount, available_balance INTO v_paid, v_available
  FROM public.pre_fund_requests WHERE id = '10000000-0000-0000-0000-000000000001';
  SELECT count(*) INTO v_reversals FROM public.pre_fund_transactions WHERE transaction_type = 'reversal';
   SELECT spent_amount INTO v_spent
   FROM public.pre_fund_allocations
   WHERE pre_fund_request_id = '10000000-0000-0000-0000-000000000001';
  SELECT paid_amount, available_balance INTO v_second_paid, v_second_available
  FROM public.pre_fund_requests WHERE id = '10000000-0000-0000-0000-000000000002';
  IF v_paid <> 0 OR v_available <> 1000 OR v_reversals <> 4 OR v_spent <> 0
     OR v_second_paid <> 0 OR v_second_available <> 500 THEN
    RAISE EXCEPTION 'reversal assertion failed: first %/%, second %/%, reversals %, spent %',
      v_paid, v_available, v_second_paid, v_second_available, v_reversals, v_spent;
  END IF;
END $$;

-- The exceptions view reconciles a source across all of its funds, so a fully
-- covered split-source creates no gap while a genuinely unlinked remainder
-- appears once without guessing which fund should receive it.
INSERT INTO public.down_payment_requests (id, status, total_paid_amount)
VALUES ('30000000-0000-0000-0000-000000000005', 'paid', 100);
SELECT public.link_payment_atomically_rpc(
  '10000000-0000-0000-0000-000000000001', 60, 'SDG', 'down_payment_requests',
  '30000000-0000-0000-0000-000000000005', NULL, 'Split DP fund one', CURRENT_DATE,
  auth.uid(), auth.uid(), NULL, 'split-dp-fund-one'
);
SELECT public.link_payment_atomically_rpc(
  '10000000-0000-0000-0000-000000000002', 40, 'SDG', 'down_payment_requests',
  '30000000-0000-0000-0000-000000000005', NULL, 'Split DP fund two', CURRENT_DATE,
  auth.uid(), NULL, NULL, 'split-dp-fund-two'
);
INSERT INTO public.down_payment_requests (id, status, total_paid_amount)
VALUES ('30000000-0000-0000-0000-000000000006', 'paid', 100);
SELECT public.link_payment_atomically_rpc(
  '10000000-0000-0000-0000-000000000004', 40, 'SDG', 'down_payment_requests',
  '30000000-0000-0000-0000-000000000006', NULL, 'Deliberate source gap', CURRENT_DATE,
  auth.uid(), auth.uid(), NULL, 'deliberate-dp-gap'
);
DO $$
DECLARE v_split_gaps int; v_gap_count int; v_gap_amount numeric; v_gap_has_fund boolean;
BEGIN
  SELECT count(*) INTO v_split_gaps
  FROM public.pre_fund_historic_exceptions_v
  WHERE exception_type = 'source_payment_gap'
    AND source_table = 'down_payment_requests'
    AND source_id = '30000000-0000-0000-0000-000000000005';
  SELECT count(*), max(amount), bool_or(fund_id IS NOT NULL)
  INTO v_gap_count, v_gap_amount, v_gap_has_fund
  FROM public.pre_fund_historic_exceptions_v
  WHERE exception_type = 'source_payment_gap'
    AND source_table = 'down_payment_requests'
    AND source_id = '30000000-0000-0000-0000-000000000006';
  IF v_split_gaps <> 0 OR v_gap_count <> 1 OR v_gap_amount <> 60 OR COALESCE(v_gap_has_fund, false) THEN
    RAISE EXCEPTION 'source gap aggregation failed: split %, gaps %, amount %, fund %',
      v_split_gaps, v_gap_count, v_gap_amount, v_gap_has_fund;
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    PERFORM public.add_pre_fund_transaction_rpc(
      '10000000-0000-0000-0000-000000000001', 'Regression Fund', 'reversal', 1, 'SDG',
      NULL, 'must be blocked', CURRENT_DATE, auth.uid(), NULL, NULL, NULL, 'manual-reversal'
    );
    RAISE EXCEPTION 'manual reversal was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'manual reversal was accepted' THEN RAISE; END IF;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.pre_fund_allocations (
      pre_fund_request_id, user_id, allocated_amount, currency
    ) VALUES (
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002', 600, 'SDG'
    );
    RAISE EXCEPTION 'allocation ceiling did not reject over-allocation';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'allocation ceiling did not reject over-allocation' THEN RAISE; END IF;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    PERFORM public.link_payment_atomically_rpc(
      '10000000-0000-0000-0000-000000000001', 1, 'SDG', 'operational_cost_submissions',
      '20000000-0000-0000-0000-000000000099', NULL, NULL, CURRENT_DATE, auth.uid(), auth.uid(), NULL, 'missing-source'
    );
    RAISE EXCEPTION 'missing source was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'missing source was accepted' THEN RAISE; END IF;
  END;
END $$;
SQL

echo "Pre-fund ledger reconciliation regression checks passed."
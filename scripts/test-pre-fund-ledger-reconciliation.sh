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
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text
);
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001');
INSERT INTO public.profiles VALUES ('00000000-0000-0000-0000-000000000001', 'super_admin');
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000002');
INSERT INTO public.profiles VALUES ('00000000-0000-0000-0000-000000000002', 'staff');
INSERT INTO auth.users VALUES ('99999999-9999-9999-9999-999999999999');
CREATE TABLE public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id),
  currency text NOT NULL DEFAULT 'SDG', balance_cents bigint NOT NULL DEFAULT 0,
  total_earned_cents bigint NOT NULL DEFAULT 0, total_paid_out_cents bigint NOT NULL DEFAULT 0,
  pending_payout_cents bigint NOT NULL DEFAULT 0, balances jsonb NOT NULL DEFAULT '{"SDG": 0}'::jsonb,
  total_earned numeric NOT NULL DEFAULT 0
);
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), wallet_id uuid REFERENCES public.wallets(id),
  user_id uuid NOT NULL REFERENCES public.profiles(id), type text NOT NULL, amount numeric,
  amount_cents bigint NOT NULL, currency text NOT NULL, description text, balance_before numeric,
  balance_after numeric, created_by uuid REFERENCES public.profiles(id), metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pre_fund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, currency text NOT NULL,
  amount numeric NOT NULL, available_balance numeric NOT NULL DEFAULT 0, paid_amount numeric NOT NULL DEFAULT 0,
  committed_amount numeric NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'active',
  -- Matches the legacy production pre-fund schema. The direct top-up RPC must
  -- normalize this text country ID before writing accounting UUID columns.
  country_id text, gl_liability_account text, gl_receipt_account text, holder_user_id uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
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
  currency text NOT NULL, notes text, receipt_url text, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(pre_fund_request_id, user_id)
);
CREATE TABLE public.down_payment_requests (
  id uuid PRIMARY KEY, status text, metadata jsonb DEFAULT '{}'::jsonb,
  total_paid_amount numeric NOT NULL DEFAULT 0, pre_fund_transaction_id uuid,
  justification text, site_name text, approved_amount numeric, requested_amount numeric,
  remaining_amount numeric, requested_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), wallet_transaction_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  installment_plan jsonb NOT NULL DEFAULT '[]'::jsonb, paid_installments jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_type text, supervisor_status text, supervisor_approved_by uuid, supervisor_approved_at timestamptz,
  supervisor_notes text, supervisor_rejection_reason text, admin_status text, admin_processed_by uuid,
  admin_processed_at timestamptz, admin_notes text, admin_rejection_reason text
);
CREATE TABLE public.operational_cost_submissions (
  id uuid PRIMARY KEY, status text, amount_paid_cents bigint NOT NULL DEFAULT 0, pre_fund_transaction_id uuid,
  paid_at timestamptz, paid_by uuid, payment_proof_url text, payment_proof_notes text,
  payment_proof_uploaded_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
  description text, amount_cents bigint NOT NULL DEFAULT 0, currency text NOT NULL DEFAULT 'SDG',
  submitted_by uuid REFERENCES auth.users(id), reference_number text
);
CREATE TABLE public.acct_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text,
  name_en text NOT NULL DEFAULT '', name_ar text NOT NULL DEFAULT '',
  account_type text, subtype text, parent_id uuid,
  country_id uuid, is_active boolean NOT NULL DEFAULT true, is_postable boolean NOT NULL DEFAULT true
);
CREATE TABLE public.acct_fiscal_periods (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL
);
CREATE TABLE public.acct_funds (
  id uuid PRIMARY KEY,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.acct_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), description_en text, description_ar text, posting_date date,
  period_id uuid NOT NULL REFERENCES public.acct_fiscal_periods(id), country_id uuid,
  status text, source_type text, source_id uuid, idempotency_key text UNIQUE, created_by uuid,
  posted_at timestamptz, posted_by uuid
);
CREATE TABLE public.acct_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entry_id uuid, line_no int, account_id uuid,
  fund_id uuid NOT NULL REFERENCES public.acct_funds(id), debit_credit text,
  original_amount numeric, original_currency text, functional_amount numeric, functional_currency text,
  description text, function text
);
CREATE TABLE public.acct_gl_bridge_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_table text, source_id uuid, event_type text, status text, journal_entry_id uuid
);
-- Simulate the older deployed ledger view. Its idempotency_key occupies the
-- position now followed by newly appended audit fields; a compatible migration
-- must not try to rename it to created_at during CREATE OR REPLACE VIEW.
ALTER TABLE public.pre_fund_transactions
  ADD COLUMN idempotency_key text,
  ADD COLUMN reversal_of_id uuid,
  ADD COLUMN event_actor_id uuid,
  ADD COLUMN event_reason text,
  ADD COLUMN event_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN occurred_at timestamptz NOT NULL DEFAULT now();
CREATE VIEW public.pre_fund_event_ledger_v AS
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
  t.idempotency_key,
  t.reversal_of_id,
  t.event_reason,
  t.event_metadata,
  t.occurred_at,
  true AS source_is_verified,
  CASE
    WHEN t.transaction_type = 'payment' THEN t.amount
    WHEN t.transaction_type IN ('reversal', 'return') THEN -t.amount
    ELSE 0
  END AS signed_paid_amount
FROM public.pre_fund_transactions t;
-- This row exists before the migration so its initial canonical cache refresh
-- proves commitments remain reserved instead of being released.
INSERT INTO public.pre_fund_requests (
  id, name, currency, amount, available_balance, paid_amount, committed_amount,
  gl_liability_account, gl_receipt_account
) VALUES (
  '10000000-0000-0000-0000-000000000005', 'Committed Cash Regression Fund', 'SDG',
  1000, 700, 0, 300, '2400', '1200'
);
INSERT INTO public.acct_fiscal_periods (id, status, start_date, end_date)
VALUES ('40000000-0000-0000-0000-000000000001', 'open', '2020-01-01', '2030-12-31');
INSERT INTO public.acct_funds (id, is_active)
VALUES ('50000000-0000-0000-0000-000000000001', true);
SQL

"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260820e_pre_fund_ledger_reconciliation.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260820f_pre_fund_finance_exception_reviews.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260821a_pre_fund_exception_visibility.sql" >/dev/null
# Supabase Studio may have committed early idempotent statements before a later
# view or RPC-definition error. The repaired scripts must be safe to rerun in order.
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260820e_pre_fund_ledger_reconciliation.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260820f_pre_fund_finance_exception_reviews.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260821a_pre_fund_exception_visibility.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260823g_open_cost_submission_pre_fund_payments.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260823h_add_fiscal_period_to_pre_fund_payment_gl.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260823i_add_accounting_fund_to_pre_fund_journal_lines.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260824_direct_pre_fund_topups.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260824b_fix_direct_pre_fund_topup_country_uuid.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260824c_repair_ops_cost_gl_bridge_account_codes.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260824d_repair_down_payment_gl_bridge_account_codes.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260825_post_direct_pre_fund_topups.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260829_reverse_latest_allocation_topup.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260829_reverse_latest_direct_fund_topup.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260829_adjust_latest_direct_fund_topup.sql" >/dev/null

"${PSQL[@]}" <<'SQL'
DO $$
DECLARE v_legacy_column text; v_appended_column text;
BEGIN
  SELECT column_name INTO v_legacy_column
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'pre_fund_event_ledger_v'
    AND ordinal_position = 13;
  SELECT column_name INTO v_appended_column
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'pre_fund_event_ledger_v'
    AND ordinal_position = 20;
  IF v_legacy_column <> 'idempotency_key' OR v_appended_column <> 'created_at' THEN
    RAISE EXCEPTION 'ledger view migration reordered existing columns: #13 %, #20 %',
      v_legacy_column, v_appended_column;
  END IF;
END $$;
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
INSERT INTO public.pre_fund_requests (
  id, name, currency, amount, available_balance, paid_amount, gl_liability_account, gl_receipt_account
) VALUES (
  '10000000-0000-0000-0000-000000000099', 'Open Cost Payment Regression Fund', 'SDG', 100, 100, 0, '2400', '1200'
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
INSERT INTO public.pre_fund_allocations (
  pre_fund_request_id, user_id, allocated_amount, currency
) VALUES ('10000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-000000000001', 100, 'SDG');

-- Allocation Add Funds reversals are newest-only, holder/admin authorised, and
-- restore the previous amount/receipt without removing audit evidence.
UPDATE public.pre_fund_requests
SET holder_user_id = '00000000-0000-0000-0000-000000000002'
WHERE id = '10000000-0000-0000-0000-000000000002';

INSERT INTO public.pre_fund_allocations (
  id, pre_fund_request_id, user_id, allocated_amount, spent_amount, currency, notes, receipt_url
) VALUES (
  '60000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000002',
  175, 20, 'SDG',
  jsonb_build_object(
    'text', 'Newest-only fixture',
    'top_up_count', 2,
    'initial_receipt_url', 'receipt-initial',
    'initial_created_at', '2026-08-01T00:00:00.000Z',
    'top_up_log', jsonb_build_array(
      jsonb_build_object(
        'date', '2026-08-02T10:00:00.000Z',
        'amount', 50,
        'previous_total', 100,
        'new_total', 150,
        'by_user_id', auth.uid(),
        'by_name', 'Admin',
        'receipt_url', 'receipt-topup-one'
      ),
      jsonb_build_object(
        'date', '2026-08-03T10:00:00.000Z',
        'amount', 25,
        'previous_total', 150,
        'new_total', 175,
        'by_user_id', auth.uid(),
        'by_name', 'Admin',
        'receipt_url', 'receipt-topup-two'
      )
    )
  )::text,
  'receipt-topup-two'
);

DO $$
BEGIN
  BEGIN
    PERFORM public.reverse_latest_pre_fund_allocation_topup_rpc(
      '60000000-0000-0000-0000-000000000001',
      '2026-08-02T10:00:00.000Z',
      'Must reject a stale older row'
    );
    RAISE EXCEPTION 'stale non-latest allocation top-up was reversed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'stale non-latest allocation top-up was reversed' THEN RAISE; END IF;
  END;
END $$;

SELECT public.reverse_latest_pre_fund_allocation_topup_rpc(
  '60000000-0000-0000-0000-000000000001',
  '2026-08-03T10:00:00.000Z',
  'Correct the newest top-up'
);

DO $$
DECLARE
  v_rows integer;
BEGIN
  -- Mirrors the UI receipt replacement compare-and-swap. A replacement that
  -- started from the pre-reversal snapshot must update zero rows and therefore
  -- cannot restore the reversed top-up metadata.
  UPDATE public.pre_fund_allocations
  SET notes = jsonb_set(
    notes::jsonb,
    '{top_up_log,1,receipt_url}',
    to_jsonb('stale-replacement-receipt'::text)
  )::text
  WHERE id = '60000000-0000-0000-0000-000000000001'
    AND allocated_amount = 175
    AND receipt_url = 'receipt-topup-two';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'stale receipt replacement overwrote a completed top-up reversal';
  END IF;
END $$;

DO $$
DECLARE
  v_amount numeric;
  v_spent numeric;
  v_receipt text;
  v_active_count integer;
  v_reversal_count integer;
  v_audit_count integer;
BEGIN
  SELECT allocated_amount, spent_amount, receipt_url,
    jsonb_array_length(notes::jsonb -> 'top_up_log'),
    jsonb_array_length(notes::jsonb -> 'top_up_reversal_log')
  INTO v_amount, v_spent, v_receipt, v_active_count, v_reversal_count
  FROM public.pre_fund_allocations
  WHERE id = '60000000-0000-0000-0000-000000000001';

  SELECT count(*) INTO v_audit_count
  FROM public.pre_fund_allocation_topup_reversal_audit
  WHERE allocation_id = '60000000-0000-0000-0000-000000000001';

  IF v_amount <> 150 OR v_spent <> 20 OR v_receipt <> 'receipt-topup-one'
     OR v_active_count <> 1 OR v_reversal_count <> 1 OR v_audit_count <> 1 THEN
    RAISE EXCEPTION 'latest top-up reversal state is inconsistent: amount %, spent %, receipt %, active %, reversed %, audit %',
      v_amount, v_spent, v_receipt, v_active_count, v_reversal_count, v_audit_count;
  END IF;
END $$;

UPDATE public.profiles SET role = 'staff' WHERE id = auth.uid();
DO $$
BEGIN
  BEGIN
    PERFORM public.reverse_latest_pre_fund_allocation_topup_rpc(
      '60000000-0000-0000-0000-000000000001',
      '2026-08-02T10:00:00.000Z',
      'Unauthorised attempt'
    );
    RAISE EXCEPTION 'non-holder non-admin reversed an allocation top-up';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'non-holder non-admin reversed an allocation top-up' THEN RAISE; END IF;
  END;
END $$;
UPDATE public.profiles SET role = 'super_admin' WHERE id = auth.uid();

SELECT public.reverse_latest_pre_fund_allocation_topup_rpc(
  '60000000-0000-0000-0000-000000000001',
  '2026-08-02T10:00:00.000Z',
  'Remove the new latest top-up'
);

DO $$
DECLARE
  v_amount numeric;
  v_receipt text;
  v_active_count integer;
  v_reversal_count integer;
BEGIN
  SELECT allocated_amount, receipt_url,
    jsonb_array_length(notes::jsonb -> 'top_up_log'),
    jsonb_array_length(notes::jsonb -> 'top_up_reversal_log')
  INTO v_amount, v_receipt, v_active_count, v_reversal_count
  FROM public.pre_fund_allocations
  WHERE id = '60000000-0000-0000-0000-000000000001';

  IF v_amount <> 100 OR v_receipt <> 'receipt-initial'
     OR v_active_count <> 0 OR v_reversal_count <> 2 THEN
    RAISE EXCEPTION 'repeated newest-to-oldest reversal failed: amount %, receipt %, active %, reversed %',
      v_amount, v_receipt, v_active_count, v_reversal_count;
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    PERFORM public.reverse_latest_pre_fund_allocation_topup_rpc(
      '60000000-0000-0000-0000-000000000001',
      '2026-08-02T10:00:00.000Z',
      'Original allocation must remain'
    );
    RAISE EXCEPTION 'original allocation was treated as an Add Funds transaction';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'original allocation was treated as an Add Funds transaction' THEN RAISE; END IF;
  END;
END $$;

UPDATE public.pre_fund_allocations
SET allocated_amount = 130,
    spent_amount = 120,
    receipt_url = 'receipt-spent-topup',
    notes = jsonb_build_object(
      'text', 'Spent protection fixture',
      'top_up_count', 1,
      'initial_receipt_url', 'receipt-initial',
      'top_up_log', jsonb_build_array(jsonb_build_object(
        'date', '2026-08-04T10:00:00.000Z',
        'amount', 30,
        'previous_total', 100,
        'new_total', 130,
        'by_user_id', auth.uid(),
        'by_name', 'Admin',
        'receipt_url', 'receipt-spent-topup'
      ))
    )::text
WHERE id = '60000000-0000-0000-0000-000000000001';

DO $$
BEGIN
  BEGIN
    PERFORM public.reverse_latest_pre_fund_allocation_topup_rpc(
      '60000000-0000-0000-0000-000000000001',
      '2026-08-04T10:00:00.000Z',
      'Must not reduce allocation below spent'
    );
    RAISE EXCEPTION 'spent allocation top-up was unsafely reversed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'spent allocation top-up was unsafely reversed' THEN RAISE; END IF;
  END;
END $$;

-- Cost Submissions now use any funded Pre-Fund in the same currency. The
-- source owner remains on the ledger but does not need an allocation row.
INSERT INTO public.operational_cost_submissions (id, status, amount_paid_cents, submitted_by)
VALUES ('20000000-0000-0000-0000-000000000099', 'paid', 2500, '00000000-0000-0000-0000-000000000002');
SELECT public.link_payment_atomically_rpc(
  '10000000-0000-0000-0000-000000000099', 25, 'SDG', 'operational_cost_submissions',
  '20000000-0000-0000-0000-000000000099', 'open-cost-fund', 'Cost Submission without allocation', CURRENT_DATE,
  auth.uid(), '00000000-0000-0000-0000-000000000002', NULL, 'open-cost-fund'
);
DO $$
DECLARE v_user_id uuid; v_period_id uuid; v_line_fund_ids uuid[]; v_spent numeric; v_available numeric;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.pre_fund_transactions
  WHERE idempotency_key = 'open-cost-fund';
  SELECT je.period_id INTO v_period_id
  FROM public.acct_journal_entries je
  JOIN public.pre_fund_transactions tx ON tx.id = je.source_id
  WHERE tx.idempotency_key = 'open-cost-fund';
  SELECT array_agg(jl.fund_id ORDER BY jl.line_no) INTO v_line_fund_ids
  FROM public.acct_journal_lines jl
  JOIN public.acct_journal_entries je ON je.id = jl.entry_id
  JOIN public.pre_fund_transactions tx ON tx.id = je.source_id
  WHERE tx.idempotency_key = 'open-cost-fund';
  SELECT spent_amount INTO v_spent
  FROM public.pre_fund_allocations
  WHERE pre_fund_request_id = '10000000-0000-0000-0000-000000000099';
  SELECT available_balance INTO v_available
  FROM public.pre_fund_requests
  WHERE id = '10000000-0000-0000-0000-000000000099';
  IF v_user_id <> '00000000-0000-0000-0000-000000000002'::uuid
     OR v_period_id <> '40000000-0000-0000-0000-000000000001'::uuid
     OR v_line_fund_ids IS DISTINCT FROM ARRAY[
       '50000000-0000-0000-0000-000000000001'::uuid,
       '50000000-0000-0000-0000-000000000001'::uuid
     ]
     OR v_spent <> 0
     OR v_available <> 75 THEN
    RAISE EXCEPTION 'open Cost Submission fund assertion failed: owner %, period %, line funds %, allocation spent %, available %',
      v_user_id, v_period_id, v_line_fund_ids, v_spent, v_available;
  END IF;
END $$;
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
  IF v_paid <> 300 OR v_available <> 700 OR v_events <> 2 OR v_gl <> 8 OR v_spent <> 0 THEN
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

-- Finance exception review queue: no-evidence decisions are append-only and
-- cannot change a source, event, or canonical balance.
INSERT INTO public.operational_cost_submissions (id, status, amount_paid_cents, description)
VALUES ('20000000-0000-0000-0000-000000000006', 'approved', 10000, 'Legacy approved OCS');
INSERT INTO public.pre_fund_transactions (
  pre_fund_request_id, transaction_type, amount, currency, reference, description,
  transaction_date, source_table, source_id, created_by, user_id, idempotency_key
) VALUES (
  '10000000-0000-0000-0000-000000000002', 'payment', 70, 'SDG', 'legacy-ocs',
  'Unverified historical OCS payment', CURRENT_DATE, 'operational_cost_submissions',
  '20000000-0000-0000-0000-000000000006', auth.uid(), auth.uid(), 'legacy-ocs-event'
);
DO $$
DECLARE v_key text; v_status text; v_events int; v_decisions int;
BEGIN
  SELECT exception_key INTO v_key
  FROM public.pre_fund_finance_exception_queue_v
  WHERE source_id = '20000000-0000-0000-0000-000000000006'
    AND exception_type = 'unverified_source_payment';
  IF v_key IS NULL THEN RAISE EXCEPTION 'unverified OCS was absent from Finance queue'; END IF;
  PERFORM public.record_pre_fund_exception_decision_rpc(
    v_key, 'Bank proof was not supplied; retain exclusion.', 'FIN-EXC-001'
  );
  SELECT status INTO v_status FROM public.operational_cost_submissions
  WHERE id = '20000000-0000-0000-0000-000000000006';
  SELECT count(*) INTO v_events FROM public.pre_fund_transactions
  WHERE source_id = '20000000-0000-0000-0000-000000000006';
  SELECT count(*) INTO v_decisions FROM public.pre_fund_finance_exception_decisions
  WHERE exception_key = v_key AND resolution = 'keep_excluded';
  IF v_status <> 'approved' OR v_events <> 1 OR v_decisions <> 1 THEN
    RAISE EXCEPTION 'keep-excluded changed financial data: status %, events %, decisions %',
      v_status, v_events, v_decisions;
  END IF;
END $$;

-- The queue itself and its resolution RPCs are Finance-only.
UPDATE public.profiles SET role = 'viewer' WHERE id = auth.uid();
DO $$
BEGIN
  BEGIN
    PERFORM public.get_pre_fund_finance_exception_queue_rpc(
      '10000000-0000-0000-0000-000000000002'
    );
    RAISE EXCEPTION 'non-finance role read Finance exception queue';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'non-finance role read Finance exception queue' THEN RAISE; END IF;
  END;
END $$;
UPDATE public.profiles SET role = 'super_admin' WHERE id = auth.uid();

-- Country Directors can see only exceptions for funds they hold. Unassigned
-- source-payment gaps remain Finance-only because their fund is unknown.
INSERT INTO public.down_payment_requests (id, status, total_paid_amount, justification)
VALUES ('30000000-0000-0000-0000-000000000010', 'paid', 25, 'Unassigned payment gap');
INSERT INTO public.pre_fund_requests (
  id, name, currency, amount, available_balance, paid_amount, gl_liability_account, gl_receipt_account
) VALUES (
  '10000000-0000-0000-0000-000000000006', 'USD Country Director Exclusion Fund', 'USD', 100, 100, 0, '2400', '1200'
);
INSERT INTO public.operational_cost_submissions (id, status, amount_paid_cents, description)
VALUES ('20000000-0000-0000-0000-000000000007', 'approved', 1000, 'Other fund OCS exception');
INSERT INTO public.pre_fund_transactions (
  pre_fund_request_id, transaction_type, amount, currency, reference, description,
  transaction_date, source_table, source_id, created_by, user_id, idempotency_key
) VALUES (
  '10000000-0000-0000-0000-000000000006', 'payment', 10, 'USD', 'country-director-scope',
  'Country Director must not read another fund exception', CURRENT_DATE, 'operational_cost_submissions',
  '20000000-0000-0000-0000-000000000007', auth.uid(), auth.uid(), 'country-director-scope-event'
);
UPDATE public.pre_fund_requests
SET holder_user_id = auth.uid()
WHERE id = '10000000-0000-0000-0000-000000000002';
UPDATE public.profiles SET role = 'country director' WHERE id = auth.uid();
DO $$
DECLARE v_visible int; v_unassigned int; v_other_fund int;
BEGIN
  SELECT count(*) INTO v_visible
  FROM public.get_pre_fund_finance_exception_queue_rpc(NULL)
  WHERE fund_id = '10000000-0000-0000-0000-000000000002';
  SELECT count(*) INTO v_unassigned
  FROM public.get_pre_fund_finance_exception_queue_rpc(NULL)
  WHERE fund_id IS NULL;
  SELECT count(*) INTO v_other_fund
  FROM public.get_pre_fund_finance_exception_queue_rpc('10000000-0000-0000-0000-000000000006');
  IF v_visible = 0 OR v_unassigned <> 0 OR v_other_fund <> 0 THEN
    RAISE EXCEPTION 'Country Director queue scope failed: held %, unassigned %, other fund %', v_visible, v_unassigned, v_other_fund;
  END IF;
END $$;
DO $$
BEGIN
  BEGIN
    PERFORM public.record_pre_fund_exception_decision_rpc(
      'txn:00000000-0000-0000-0000-000000000000', 'Country Director must not decide exceptions.', 'NO-AUTH'
    );
    RAISE EXCEPTION 'Country Director resolved a Finance exception';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Country Director resolved a Finance exception' THEN RAISE; END IF;
  END;
END $$;
UPDATE public.profiles SET role = 'super_admin' WHERE id = auth.uid();
DO $$
DECLARE v_unassigned int; v_cross_fund_currency text; v_unassigned_key text; v_unassigned_decisions int;
BEGIN
  SELECT count(*) INTO v_unassigned
  FROM public.get_pre_fund_finance_exception_queue_rpc(NULL)
  WHERE fund_id IS NULL;
  SELECT currency INTO v_cross_fund_currency
  FROM public.get_pre_fund_finance_exception_queue_rpc(NULL)
  WHERE source_id = '20000000-0000-0000-0000-000000000007';
  IF v_unassigned = 0 OR v_cross_fund_currency <> 'USD' THEN
    RAISE EXCEPTION 'Finance global exception queue omitted an unassigned source-payment gap';
  END IF;
  -- An unassigned gap has no selected fund. Finance can still record the
  -- review outcome without inventing a fund or altering an event.
  SELECT exception_key INTO v_unassigned_key
  FROM public.get_pre_fund_finance_exception_queue_rpc(NULL)
  WHERE source_id = '30000000-0000-0000-0000-000000000010';
  PERFORM public.record_pre_fund_exception_decision_rpc(
    v_unassigned_key, 'No supporting evidence identifies a fund; retain exclusion.', 'UNASSIGNED-GAP-001'
  );
  SELECT count(*) INTO v_unassigned_decisions
  FROM public.pre_fund_finance_exception_decisions
  WHERE exception_key = v_unassigned_key AND fund_id IS NULL AND resolution = 'keep_excluded';
  IF v_unassigned_decisions <> 1 THEN
    RAISE EXCEPTION 'Finance could not review an unassigned gap without a selected fund';
  END IF;
END $$;

-- Evidence confirmation atomically changes an approved OCS to paid and posts
-- the source-field gap as a new immutable event. A retry is idempotent.
DO $$
DECLARE v_key text; v_status text; v_events int; v_paid numeric; v_available numeric;
        v_correction numeric; v_result jsonb;
BEGIN
  SELECT exception_key INTO v_key
  FROM public.pre_fund_finance_exception_queue_v
  WHERE source_id = '20000000-0000-0000-0000-000000000006'
    AND exception_type = 'unverified_source_payment';
  SELECT public.confirm_pre_fund_ocs_exception_with_evidence_rpc(
    v_key, 'Matched to signed voucher.', 'VOUCHER-OCS-006', 'ocs-evidence-006'
  ) INTO v_result;
  SELECT public.confirm_pre_fund_ocs_exception_with_evidence_rpc(
    v_key, 'Matched to signed voucher.', 'VOUCHER-OCS-006', 'ocs-evidence-006'
  ) INTO v_result;
  SELECT status INTO v_status FROM public.operational_cost_submissions
  WHERE id = '20000000-0000-0000-0000-000000000006';
  SELECT count(*) INTO v_events FROM public.pre_fund_transactions
  WHERE source_id = '20000000-0000-0000-0000-000000000006'
    AND transaction_type = 'payment';
  SELECT paid_amount, available_balance INTO v_paid, v_available
  FROM public.pre_fund_requests WHERE id = '10000000-0000-0000-0000-000000000002';
  SELECT amount INTO v_correction FROM public.pre_fund_transactions
  WHERE id = (SELECT correction_transaction_id FROM public.pre_fund_finance_exception_decisions
              WHERE idempotency_key = 'ocs-evidence-006');
  IF v_status <> 'paid' OR v_events <> 2 OR v_correction <> 30
     OR v_paid <> 140 OR v_available <> 360 THEN
    RAISE EXCEPTION 'OCS evidence confirmation failed: status %, events %, correction %, fund %/%',
      v_status, v_events, v_correction, v_paid, v_available;
  END IF;
END $$;
DO $$
DECLARE v_key text;
BEGIN
  SELECT 'txn:' || id::text INTO v_key
  FROM public.pre_fund_transactions
  WHERE idempotency_key = 'legacy-ocs-event';
  BEGIN
    PERFORM public.confirm_pre_fund_ocs_exception_with_evidence_rpc(
      v_key, 'Different note must not reuse a decision key.', 'VOUCHER-CHANGED', 'ocs-evidence-006'
    );
    RAISE EXCEPTION 'idempotency key was reused for a different OCS decision';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'idempotency key was reused for a different OCS decision' THEN RAISE; END IF;
  END;
END $$;

-- Existing Down Payments can only be restored with explicit evidence. The
-- provided cumulative amount is reconciled through a new immutable event.
INSERT INTO public.down_payment_requests (id, status, total_paid_amount, justification)
VALUES ('30000000-0000-0000-0000-000000000008', 'rejected', 0, 'Historic rejected DP');
INSERT INTO public.pre_fund_transactions (
  pre_fund_request_id, transaction_type, amount, currency, reference, description,
  transaction_date, source_table, source_id, created_by, user_id, idempotency_key
) VALUES (
  '10000000-0000-0000-0000-000000000003', 'payment', 40, 'SDG', 'legacy-dp',
  'Unverified historical Down Payment', CURRENT_DATE, 'down_payment_requests',
  '30000000-0000-0000-0000-000000000008', auth.uid(), auth.uid(), 'legacy-dp-event'
);
DO $$
DECLARE v_key text; v_status text; v_total numeric; v_events int;
BEGIN
  SELECT exception_key INTO v_key
  FROM public.pre_fund_finance_exception_queue_v
  WHERE source_id = '30000000-0000-0000-0000-000000000008'
    AND exception_type = 'unverified_source_payment';
  PERFORM public.confirm_pre_fund_down_payment_exception_with_evidence_rpc(
    v_key, 50, 'Receipt and signed approval verified.', 'DP-RECEIPT-007', 'dp-evidence-007'
  );
  SELECT status, total_paid_amount INTO v_status, v_total
  FROM public.down_payment_requests WHERE id = '30000000-0000-0000-0000-000000000008';
  SELECT count(*) INTO v_events FROM public.pre_fund_transactions
  WHERE source_id = '30000000-0000-0000-0000-000000000008'
    AND transaction_type = 'payment';
  IF v_status <> 'fully_paid' OR v_total <> 50 OR v_events <> 2 THEN
    RAISE EXCEPTION 'Down Payment evidence confirmation failed: status %, total %, events %',
      v_status, v_total, v_events;
  END IF;
END $$;
DO $$
DECLARE v_key text; v_events int; v_total numeric;
BEGIN
  SELECT 'txn:' || id::text INTO v_key
  FROM public.pre_fund_transactions
  WHERE idempotency_key = 'legacy-dp-event';
  BEGIN
    PERFORM public.confirm_pre_fund_down_payment_exception_with_evidence_rpc(
      v_key, 60, 'A different key must not add a second correction.', 'DP-RECEIPT-008', 'dp-evidence-008-second'
    );
    RAISE EXCEPTION 'already-confirmed Down Payment accepted a second correction';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'already-confirmed Down Payment accepted a second correction' THEN RAISE; END IF;
  END;
  SELECT total_paid_amount INTO v_total FROM public.down_payment_requests
  WHERE id = '30000000-0000-0000-0000-000000000008';
  SELECT count(*) INTO v_events FROM public.pre_fund_transactions
  WHERE source_id = '30000000-0000-0000-0000-000000000008' AND transaction_type = 'payment';
  IF v_total <> 50 OR v_events <> 2 THEN
    RAISE EXCEPTION 'second Down Payment correction changed source data: total %, events %', v_total, v_events;
  END IF;
END $$;

-- The evidence RPC is not a generic paid-source editing API. A normal paid
-- Down Payment must be rejected even when a Finance user calls the RPC directly.
INSERT INTO public.down_payment_requests (id, status, total_paid_amount, justification)
VALUES ('30000000-0000-0000-0000-000000000009', 'paid', 100, 'Ordinary verified DP');
INSERT INTO public.pre_fund_transactions (
  pre_fund_request_id, transaction_type, amount, currency, reference, description,
  transaction_date, source_table, source_id, created_by, user_id, idempotency_key
) VALUES (
  '10000000-0000-0000-0000-000000000003', 'payment', 40, 'SDG', 'ordinary-dp',
  'Ordinary verified Down Payment', CURRENT_DATE, 'down_payment_requests',
  '30000000-0000-0000-0000-000000000009', auth.uid(), auth.uid(), 'ordinary-dp-event'
);
DO $$
DECLARE v_key text; v_status text; v_total numeric; v_events int;
BEGIN
  SELECT 'txn:' || id::text INTO v_key
  FROM public.pre_fund_transactions WHERE idempotency_key = 'ordinary-dp-event';
  BEGIN
    PERFORM public.confirm_pre_fund_down_payment_exception_with_evidence_rpc(
      v_key, 100, 'Attempted bypass', 'BYPASS-REJECT', 'ordinary-dp-bypass'
    );
    RAISE EXCEPTION 'ordinary verified Down Payment used the exception correction RPC';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'ordinary verified Down Payment used the exception correction RPC' THEN RAISE; END IF;
  END;
  SELECT status, total_paid_amount INTO v_status, v_total FROM public.down_payment_requests
  WHERE id = '30000000-0000-0000-0000-000000000009';
  SELECT count(*) INTO v_events FROM public.pre_fund_transactions
  WHERE source_id = '30000000-0000-0000-0000-000000000009' AND transaction_type = 'payment';
  IF v_status <> 'paid' OR v_total <> 100 OR v_events <> 1 THEN
    RAISE EXCEPTION 'ordinary Down Payment bypass changed data: status %, total %, events %',
      v_status, v_total, v_events;
  END IF;
END $$;

-- A source that no longer exists cannot be recreated by an evidence correction.
INSERT INTO public.pre_fund_transactions (
  pre_fund_request_id, transaction_type, amount, currency, reference, description,
  transaction_date, source_table, source_id, created_by, user_id, idempotency_key
) VALUES (
  '10000000-0000-0000-0000-000000000003', 'payment', 10, 'SDG', 'missing-source',
  'Missing OCS historic event', CURRENT_DATE, 'operational_cost_submissions',
  '20000000-0000-0000-0000-000000000099', auth.uid(), auth.uid(), 'missing-source-exception'
);
DO $$
DECLARE v_key text;
BEGIN
  SELECT exception_key INTO v_key
  FROM public.pre_fund_finance_exception_queue_v
  WHERE source_id = '20000000-0000-0000-0000-000000000099'
    AND exception_type = 'unverified_source_payment';
  BEGIN
    PERFORM public.confirm_pre_fund_ocs_exception_with_evidence_rpc(
      v_key, 'Claimed evidence', 'MISSING-NEVER-RESTORE', 'missing-ocs-evidence'
    );
    RAISE EXCEPTION 'missing OCS was recreated by evidence correction';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'missing OCS was recreated by evidence correction' THEN RAISE; END IF;
  END;
 END $$;

SQL

"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260821b_required_pre_fund_payment_links.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260821c_align_pre_fund_source_payment_links.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260821g_pre_fund_payment_correction_evidence.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260821d_atomic_down_payment_payment_workflow.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260821e_atomic_paid_down_payment_reopen.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260821f_wallet_payment_idempotency_identity.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260821h_finance_only_pre_fund_corrections.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260821i_allow_partial_operational_cost_payments.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260828_down_payment_shared_fund_balance.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260829_fix_allocation_ceiling_rls.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260830_reconcile_legacy_down_payment_source_totals.sql" >/dev/null

"${PSQL[@]}" <<'SQL'
-- Wallet-backed cancellation: paid source state, wallet evidence, and immutable
-- fund events must reverse together before a write-off can cancel the request.
INSERT INTO public.pre_fund_requests (
  id, name, currency, amount, available_balance, paid_amount, gl_liability_account, gl_receipt_account
) VALUES
  ('10000000-0000-0000-0000-000000000011', 'Wallet Cancellation Fund', 'SDG', 100, 100, 0, '2400', '1200'),
  ('10000000-0000-0000-0000-000000000012', 'Paid Reopen Fund', 'SDG', 50, 50, 0, '2400', '1200');

INSERT INTO public.down_payment_requests (
  id, status, approved_amount, requested_amount, remaining_amount, total_paid_amount,
  requested_by, justification, site_name, payment_type
) VALUES
  ('30000000-0000-0000-0000-000000000012', 'approved', 80, 80, 80, 0, auth.uid(),
    'Wallet-backed write-off fixture', 'Wallet cancellation site', 'full_advance'),
  ('30000000-0000-0000-0000-000000000013', 'approved', 50, 50, 50, 0, auth.uid(),
    'Paid reopen fixture', 'Paid reopen site', 'full_advance');

DO $$
DECLARE v_first jsonb; v_retry jsonb; v_cancel jsonb; v_source_status text; v_source_paid numeric;
        v_fund_paid numeric; v_fund_available numeric; v_wallet_count int; v_wallet_status text;
        v_reversals int; v_reason text;
BEGIN
  SELECT public.record_down_payment_with_wallet_rpc(
    '30000000-0000-0000-0000-000000000012',
    '10000000-0000-0000-0000-000000000011',
    80, 'SDG', 'https://receipt.test/write-off', 'Initial disbursement', 'source-payment:wallet-cancel-one'
  ) INTO v_first;
  SELECT public.record_down_payment_with_wallet_rpc(
    '30000000-0000-0000-0000-000000000012',
    '10000000-0000-0000-0000-000000000011',
    80, 'SDG', 'https://receipt.test/write-off', 'Transport retry', 'source-payment:wallet-cancel-one'
  ) INTO v_retry;
  BEGIN
    UPDATE public.down_payment_requests
    SET status = 'approved', total_paid_amount = 0
    WHERE id = '30000000-0000-0000-0000-000000000012';
    RAISE EXCEPTION 'direct paid reopen was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'direct paid reopen was accepted' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'A paid Down Payment must be reopened through the controlled financial reversal workflow%' THEN RAISE; END IF;
  END;
  SELECT public.cancel_paid_down_payment_request_rpc(
    '30000000-0000-0000-0000-000000000012', 'Write-off regression coverage'
  ) INTO v_cancel;
  SELECT status, total_paid_amount, metadata ->> 'cancellation_reason'
  INTO v_source_status, v_source_paid, v_reason
  FROM public.down_payment_requests WHERE id = '30000000-0000-0000-0000-000000000012';
  SELECT paid_amount, available_balance INTO v_fund_paid, v_fund_available
  FROM public.pre_fund_requests WHERE id = '10000000-0000-0000-0000-000000000011';
  SELECT count(*), max(status) INTO v_wallet_count, v_wallet_status
  FROM public.wallet_transactions
  WHERE metadata ->> 'down_payment_request_id' = '30000000-0000-0000-0000-000000000012';
  SELECT count(*) INTO v_reversals
  FROM public.pre_fund_transactions r
  WHERE r.reversal_of_id IS NOT NULL
    AND r.source_id = '30000000-0000-0000-0000-000000000012';
  IF (v_first ->> 'success')::boolean IS DISTINCT FROM true
     OR (v_retry ->> 'idempotent')::boolean IS DISTINCT FROM true
     OR (v_retry ->> 'transaction_id') IS DISTINCT FROM (v_first ->> 'transaction_id')
     OR (v_cancel ->> 'success')::boolean IS DISTINCT FROM true
     OR v_source_status <> 'cancelled'
     OR v_source_paid <> 80
     OR v_fund_paid <> 0
     OR v_fund_available <> 100
     OR v_wallet_count <> 1
     OR v_wallet_status <> 'reversed'
     OR v_reversals <> 1
     OR v_reason <> 'Write-off regression coverage' THEN
    RAISE EXCEPTION 'wallet-backed cancellation assertion failed: payment %, retry %, cancellation %, source %/%, fund %/%, wallet %/%, reversals %, reason %',
      v_first, v_retry, v_cancel, v_source_status, v_source_paid, v_fund_paid, v_fund_available,
      v_wallet_count, v_wallet_status, v_reversals, v_reason;
  END IF;
END $$;

-- Controlled reopen compensates all evidence and restores the amount to pay.
DO $$
DECLARE v_payment jsonb; v_reopen jsonb; v_status text; v_paid numeric; v_remaining numeric;
        v_fund_paid numeric; v_fund_available numeric; v_wallet_status text; v_reversals int;
BEGIN
  SELECT public.record_down_payment_with_wallet_rpc(
    '30000000-0000-0000-0000-000000000013',
    '10000000-0000-0000-0000-000000000012',
    50, 'SDG', 'https://receipt.test/reopen', 'Paid before approved reopen', 'source-payment:wallet-reopen-one'
  ) INTO v_payment;
  SELECT public.reopen_down_payment_after_reversal_rpc(
    '30000000-0000-0000-0000-000000000013', 'approved', 'Correction requires a new approval'
  ) INTO v_reopen;
  SELECT status, total_paid_amount, remaining_amount INTO v_status, v_paid, v_remaining
  FROM public.down_payment_requests WHERE id = '30000000-0000-0000-0000-000000000013';
  SELECT paid_amount, available_balance INTO v_fund_paid, v_fund_available
  FROM public.pre_fund_requests WHERE id = '10000000-0000-0000-0000-000000000012';
  SELECT max(status) INTO v_wallet_status FROM public.wallet_transactions
  WHERE metadata ->> 'down_payment_request_id' = '30000000-0000-0000-0000-000000000013';
  SELECT count(*) INTO v_reversals
  FROM public.pre_fund_transactions r
  WHERE r.reversal_of_id IS NOT NULL
    AND r.source_id = '30000000-0000-0000-0000-000000000013';
  IF (v_payment ->> 'success')::boolean IS DISTINCT FROM true
     OR (v_reopen ->> 'success')::boolean IS DISTINCT FROM true
     OR v_status <> 'approved'
     OR v_paid <> 0
     OR v_remaining <> 50
     OR v_fund_paid <> 0
     OR v_fund_available <> 50
     OR v_wallet_status <> 'reversed'
     OR v_reversals <> 1 THEN
    RAISE EXCEPTION 'controlled paid reopen assertion failed: payment %, reopen %, source %/%/%, fund %/%, wallet %, reversals %',
      v_payment, v_reopen, v_status, v_paid, v_remaining, v_fund_paid, v_fund_available, v_wallet_status, v_reversals;
  END IF;
END $$;
INSERT INTO public.pre_fund_requests (
  id, name, currency, amount, available_balance, paid_amount, status,
  gl_liability_account, gl_receipt_account
) VALUES (
  '10000000-0000-0000-0000-000000000014', 'Direct Top-Up Reversal Fund',
  'SDG', 1000, 1000, 0, 'active', '2400', '1200'
);
SELECT public.record_direct_pre_fund_topup_rpc(
  '10000000-0000-0000-0000-000000000014',
  250,
  'First donor tranche',
  'Previous top-up reversal regression',
  'https://example.test/receipt-first-reversal.pdf',
  '[]'::jsonb,
  'direct-topup-reversal-first'
);
UPDATE public.pre_fund_requests
SET status = 'active'
WHERE id = '10000000-0000-0000-0000-000000000014';
SELECT public.record_direct_pre_fund_topup_rpc(
  '10000000-0000-0000-0000-000000000014',
  100,
  'Second donor tranche',
  'Latest-first reversal regression',
  'https://example.test/receipt-second.pdf',
  '[]'::jsonb,
  'direct-topup-reversal-second'
);
DO $$
DECLARE
  v_first_id uuid;
  v_second_id uuid;
  v_amount numeric;
  v_available numeric;
  v_reversals integer;
  v_posted_reversal_journals integer;
  v_reversal_lines integer;
  v_swapped_lines integer;
  v_bridge_rows integer;
BEGIN
  SELECT id INTO v_first_id
  FROM public.pre_fund_transactions
  WHERE idempotency_key = 'direct-fund-topup:direct-topup-reversal-first';
  SELECT id INTO v_second_id
  FROM public.pre_fund_transactions
  WHERE idempotency_key = 'direct-fund-topup:direct-topup-reversal-second';

  BEGIN
    PERFORM public.reverse_latest_direct_pre_fund_topup_rpc(v_first_id, 'Stale reversal attempt');
    RAISE EXCEPTION 'an older direct fund top-up was reversed before the latest';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'an older direct fund top-up was reversed before the latest' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Only the latest direct fund top-up can be reversed%' THEN RAISE; END IF;
  END;

  INSERT INTO public.pre_fund_allocations (
    pre_fund_request_id, user_id, allocated_amount, currency, created_by
  ) VALUES (
    '10000000-0000-0000-0000-000000000014', auth.uid(), 1300, 'SDG', auth.uid()
  );
  BEGIN
    PERFORM public.reverse_latest_direct_pre_fund_topup_rpc(v_second_id, 'Would underfund allocations');
    RAISE EXCEPTION 'a direct fund top-up reversal underfunded staff allocations';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'a direct fund top-up reversal underfunded staff allocations' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'This top-up cannot be reversed because staff allocations%' THEN RAISE; END IF;
  END;
  DELETE FROM public.pre_fund_allocations
  WHERE pre_fund_request_id = '10000000-0000-0000-0000-000000000014'
    AND user_id = auth.uid();

  UPDATE public.pre_fund_requests
  SET committed_amount = 1300, available_balance = 50
  WHERE id = '10000000-0000-0000-0000-000000000014';
  BEGIN
    PERFORM public.reverse_latest_direct_pre_fund_topup_rpc(v_second_id, 'Would consume committed money');
    RAISE EXCEPTION 'a spent or committed direct fund top-up was reversed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'a spent or committed direct fund top-up was reversed' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'This top-up cannot be reversed because only%' THEN RAISE; END IF;
  END;
  UPDATE public.pre_fund_requests
  SET committed_amount = 0, available_balance = 1350
  WHERE id = '10000000-0000-0000-0000-000000000014';

  PERFORM public.reverse_latest_direct_pre_fund_topup_rpc(v_second_id, 'Duplicate latest tranche');
  -- A network retry must return the original reversal rather than creating
  -- another event or changing the balance again.
  PERFORM public.reverse_latest_direct_pre_fund_topup_rpc(v_second_id, 'Duplicate latest tranche retry');

  SELECT amount, available_balance INTO v_amount, v_available
  FROM public.pre_fund_requests
  WHERE id = '10000000-0000-0000-0000-000000000014';
  IF v_amount <> 1250 OR v_available <> 1250 THEN
    RAISE EXCEPTION 'latest direct top-up reversal restored the wrong balance: %/%', v_amount, v_available;
  END IF;

  -- Once the newest top-up is reversed, the previous top-up becomes eligible.
  PERFORM public.reverse_latest_direct_pre_fund_topup_rpc(v_first_id, 'Original regression top-up no longer needed');

  SELECT amount, available_balance INTO v_amount, v_available
  FROM public.pre_fund_requests
  WHERE id = '10000000-0000-0000-0000-000000000014';
  SELECT count(*) INTO v_reversals
  FROM public.pre_fund_transactions
  WHERE pre_fund_request_id = '10000000-0000-0000-0000-000000000014'
    AND transaction_type = 'reversal'
    AND event_metadata ->> 'event_type' = 'direct_fund_top_up_reversal';
  SELECT count(*) INTO v_posted_reversal_journals
  FROM public.acct_journal_entries
  WHERE idempotency_key LIKE 'pf-direct-topup-reversal:%'
    AND status = 'posted';
  SELECT count(*) INTO v_reversal_lines
  FROM public.acct_journal_lines line
  JOIN public.acct_journal_entries journal ON journal.id = line.entry_id
  WHERE journal.idempotency_key LIKE 'pf-direct-topup-reversal:%';
  SELECT count(*) INTO v_swapped_lines
  FROM public.pre_fund_transactions reversal
  JOIN public.acct_journal_entries reversal_journal
    ON reversal_journal.source_id = reversal.id
   AND reversal_journal.source_type = 'pre_fund_transactions'
  JOIN public.acct_journal_lines reversal_line
    ON reversal_line.entry_id = reversal_journal.id
  JOIN public.acct_journal_entries original_journal
    ON original_journal.source_id = reversal.reversal_of_id
   AND original_journal.source_type = 'pre_fund_transactions'
  JOIN public.acct_journal_lines original_line
    ON original_line.entry_id = original_journal.id
   AND original_line.line_no = reversal_line.line_no
  WHERE reversal.event_metadata ->> 'event_type' = 'direct_fund_top_up_reversal'
    AND (
      (original_line.debit_credit = 'DR' AND reversal_line.debit_credit = 'CR')
      OR (original_line.debit_credit = 'CR' AND reversal_line.debit_credit = 'DR')
    );
  SELECT count(*) INTO v_bridge_rows
  FROM public.acct_gl_bridge_log
  WHERE event_type = 'pre_fund_direct_topup_reversed'
    AND status = 'success';

  IF v_amount <> 1000 OR v_available <> 1000
     OR v_reversals <> 2 OR v_posted_reversal_journals <> 2
     OR v_reversal_lines <> 4 OR v_swapped_lines <> 4 OR v_bridge_rows <> 2 THEN
    RAISE EXCEPTION 'direct top-up LIFO reversal assertion failed: balance %/%, reversals %, journals %, lines %, swapped %, bridge %',
      v_amount, v_available, v_reversals, v_posted_reversal_journals,
      v_reversal_lines, v_swapped_lines, v_bridge_rows;
  END IF;
END $$;

-- A partially used direct top-up can be corrected downward by the amount that
-- remains uncommitted. The original event is reversed and a corrected receipt
-- replaces it, so audit and GL evidence remain balanced.
INSERT INTO public.pre_fund_requests (
  id, name, currency, amount, available_balance, paid_amount, status,
  gl_liability_account, gl_receipt_account
) VALUES (
  '10000000-0000-0000-0000-000000000015', 'Direct Top-Up Adjustment Fund',
  'SDG', 1000, 1000, 0, 'active', '2400', '1200'
);
SELECT public.record_direct_pre_fund_topup_rpc(
  '10000000-0000-0000-0000-000000000015',
  100,
  'Correction test tranche',
  'Originally recorded above the amount received',
  'https://example.test/receipt-adjustment.pdf',
  '[]'::jsonb,
  'direct-topup-adjustment-original'
);
UPDATE public.acct_journal_entries
SET status = 'draft', posted_at = NULL
WHERE idempotency_key = (
  SELECT 'pf-direct-topup:' || idempotency_key
  FROM public.pre_fund_transactions
  WHERE idempotency_key = 'direct-fund-topup:direct-topup-adjustment-original'
);
UPDATE public.pre_fund_requests
SET paid_amount = 1040, available_balance = 60
WHERE id = '10000000-0000-0000-0000-000000000015';
DO $$
DECLARE
  v_original_id uuid;
  v_result jsonb;
  v_amount numeric;
  v_available numeric;
  v_adjustment_events integer;
  v_replacement_events integer;
  v_posted_journals integer;
  v_original_journal_status text;
  v_reversal_line_amount numeric;
  v_replacement_line_amount numeric;
BEGIN
  SELECT id INTO v_original_id
  FROM public.pre_fund_transactions
  WHERE idempotency_key = 'direct-fund-topup:direct-topup-adjustment-original';

  BEGIN
    PERFORM public.adjust_latest_direct_pre_fund_topup_rpc(
      v_original_id, 10, 'Would reduce the fund below valid spending'
    );
    RAISE EXCEPTION 'an unsafe direct top-up correction was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'an unsafe direct top-up correction was accepted' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'The corrected amount is too low. Only%' THEN RAISE; END IF;
  END;

  v_result := public.adjust_latest_direct_pre_fund_topup_rpc(
    v_original_id, 60, 'Only SDG 60 was actually received'
  );
  IF (v_result ->> 'success')::boolean IS DISTINCT FROM true
     OR (v_result ->> 'corrected_amount')::numeric <> 60
     OR (v_result ->> 'adjustment_amount')::numeric <> 40 THEN
    RAISE EXCEPTION 'direct top-up adjustment returned the wrong result: %', v_result;
  END IF;

  -- A retry is idempotent and cannot post the replacement twice.
  v_result := public.adjust_latest_direct_pre_fund_topup_rpc(
    v_original_id, 60, 'Network retry'
  );
  IF (v_result ->> 'idempotent')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'direct top-up adjustment retry was not idempotent: %', v_result;
  END IF;

  SELECT amount, available_balance INTO v_amount, v_available
  FROM public.pre_fund_requests
  WHERE id = '10000000-0000-0000-0000-000000000015';
  SELECT count(*) INTO v_adjustment_events
  FROM public.pre_fund_transactions
  WHERE reversal_of_id = v_original_id
    AND event_metadata ->> 'event_type' = 'direct_fund_top_up_adjustment'
    AND (event_metadata ->> 'adjustment_amount')::numeric = 40;
  SELECT count(*) INTO v_replacement_events
  FROM public.pre_fund_transactions
  WHERE event_metadata ->> 'adjusted_from_transaction_id' = v_original_id::text
    AND transaction_type = 'receipt'
    AND amount = 60;
  SELECT count(*) INTO v_posted_journals
  FROM public.acct_journal_entries
  WHERE idempotency_key IN (
    'pf-direct-topup-adjustment-reversal:' || v_original_id::text,
    'pf-direct-topup-adjusted:' || v_original_id::text
  )
    AND status = 'posted';
  SELECT journal.status INTO v_original_journal_status
  FROM public.acct_journal_entries journal
  WHERE journal.source_type = 'pre_fund_transactions'
    AND journal.source_id = v_original_id;
  SELECT line.original_amount INTO v_reversal_line_amount
  FROM public.acct_journal_lines line
  JOIN public.acct_journal_entries journal ON journal.id = line.entry_id
  WHERE journal.idempotency_key = 'pf-direct-topup-adjustment-reversal:' || v_original_id::text
  ORDER BY line.line_no
  LIMIT 1;
  SELECT line.original_amount INTO v_replacement_line_amount
  FROM public.acct_journal_lines line
  JOIN public.acct_journal_entries journal ON journal.id = line.entry_id
  WHERE journal.idempotency_key = 'pf-direct-topup-adjusted:' || v_original_id::text
  ORDER BY line.line_no
  LIMIT 1;

  IF v_amount <> 1060 OR v_available <> 20
     OR v_adjustment_events <> 1 OR v_replacement_events <> 1
     OR v_posted_journals <> 2
     OR v_original_journal_status <> 'posted'
     OR v_reversal_line_amount <> 100 OR v_replacement_line_amount <> 60 THEN
    RAISE EXCEPTION 'direct top-up adjustment assertion failed: balance %/%, adjustment %, replacement %, journals %, line amounts %/%',
      v_amount, v_available, v_adjustment_events, v_replacement_events,
      v_posted_journals, v_reversal_line_amount, v_replacement_line_amount;
  END IF;
END $$;
SQL

"${PSQL[@]}" <<'SQL'
-- Required Pre-Fund payment links: each protected source update and its
-- immutable event share one transaction. These fixtures intentionally run after
-- the reconciliation checks above so the legacy test setup can retain its
-- historical unlinked-source cases.
INSERT INTO public.pre_fund_requests (
  id, name, currency, amount, available_balance, paid_amount, gl_liability_account, gl_receipt_account
) VALUES
  ('10000000-0000-0000-0000-000000000007', 'Protected OCS Payment Fund', 'SDG', 200, 200, 0, '2400', '1200'),
  ('10000000-0000-0000-0000-000000000008', 'Protected Split Payment Fund', 'SDG', 200, 200, 0, '2400', '1200'),
  ('10000000-0000-0000-0000-000000000009', 'Protected Insufficient Fund', 'SDG', 25, 25, 0, '2400', '1200'),
  ('10000000-0000-0000-0000-000000000010', 'Protected Allocation Fund', 'SDG', 100, 100, 0, '2400', '1200');

INSERT INTO public.pre_fund_allocations (
  pre_fund_request_id, user_id, allocated_amount, currency
) VALUES (
  '10000000-0000-0000-0000-000000000010',
  auth.uid(), 30, 'SDG'
);

INSERT INTO public.operational_cost_submissions (
  id, status, amount_cents, amount_paid_cents, currency, submitted_by, description, reference_number
) VALUES
  ('20000000-0000-0000-0000-000000000010', 'approved', 10000, 0, 'SDG', auth.uid(), 'Protected retry fixture', 'PF-OCS-010'),
  ('20000000-0000-0000-0000-000000000011', 'approved', 10000, 0, 'SDG', auth.uid(), 'Insufficient fund fixture', 'PF-OCS-011'),
  ('20000000-0000-0000-0000-000000000012', 'approved', 5000, 0, 'SDG', auth.uid(), 'Allocation ceiling fixture', 'PF-OCS-012'),
  ('20000000-0000-0000-0000-000000000013', 'approved', 10000, 0, 'SDG', auth.uid(), 'Unlinked direct update fixture', 'PF-OCS-013');

INSERT INTO public.down_payment_requests (
  id, status, approved_amount, requested_amount, remaining_amount, total_paid_amount,
  requested_by, justification
) VALUES (
  '30000000-0000-0000-0000-000000000011',
  'approved', 100, 100, 100, 0, auth.uid(), 'Protected split Pre-Fund payment'
), (
  '30000000-0000-0000-0000-000000000019',
  'approved', 20, 20, 20, 0,
  '99999999-9999-9999-9999-999999999999',
  'Shared fund payment without personal allocation'
);

-- A direct paid-state update must fail before it can create an unlinked source
-- payment that would otherwise appear in balance and reconciliation screens.
DO $$
DECLARE v_status text; v_paid bigint;
BEGIN
  BEGIN
    UPDATE public.operational_cost_submissions
    SET status = 'paid', amount_paid_cents = 10000
    WHERE id = '20000000-0000-0000-0000-000000000013';
    RAISE EXCEPTION 'direct paid update was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'direct paid update was accepted' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'A Pre-Fund must be selected before recording this payment%' THEN RAISE; END IF;
  END;
  SELECT status, amount_paid_cents INTO v_status, v_paid
  FROM public.operational_cost_submissions
  WHERE id = '20000000-0000-0000-0000-000000000013';
  IF v_status <> 'approved' OR v_paid <> 0 THEN
    RAISE EXCEPTION 'rejected direct update changed the source: status %, paid cents %', v_status, v_paid;
  END IF;
END $$;

-- The controlled operation updates the source and ledger once. A transport
-- retry with the same key must return that same immutable ledger event.
DO $$
DECLARE v_first jsonb; v_retry jsonb; v_event_id uuid; v_event_count int;
        v_status text; v_paid_cents bigint;
BEGIN
  SELECT public.record_required_pre_fund_payment_rpc(
    'operational_cost_submissions',
    '20000000-0000-0000-0000-000000000010',
    '10000000-0000-0000-0000-000000000007',
    40, 'SDG', CURRENT_DATE, auth.uid(), NULL, 'First protected instalment', 'protected-ocs-retry'
  ) INTO v_first;
  SELECT public.record_required_pre_fund_payment_rpc(
    'operational_cost_submissions',
    '20000000-0000-0000-0000-000000000010',
    '10000000-0000-0000-0000-000000000007',
    40, 'SDG', CURRENT_DATE, auth.uid(), NULL, 'Transport retry', 'protected-ocs-retry'
  ) INTO v_retry;
  v_event_id := (v_first ->> 'transaction_id')::uuid;
  SELECT count(*) INTO v_event_count
  FROM public.pre_fund_transactions
  WHERE idempotency_key = 'protected-ocs-retry';
  SELECT status, amount_paid_cents INTO v_status, v_paid_cents
  FROM public.operational_cost_submissions
  WHERE id = '20000000-0000-0000-0000-000000000010';
  IF (v_first ->> 'success')::boolean IS DISTINCT FROM true
     OR (v_retry ->> 'idempotent')::boolean IS DISTINCT FROM true
     OR (v_retry ->> 'transaction_id')::uuid IS DISTINCT FROM v_event_id
     OR v_event_count <> 1
     OR v_status <> 'partially_paid'
     OR v_paid_cents <> 4000 THEN
    RAISE EXCEPTION 'protected retry did not return its original event: first %, retry %, events %, source %/%',
      v_first, v_retry, v_event_count, v_status, v_paid_cents;
  END IF;
END $$;

-- If linking fails after the controlled source update begins, all source,
-- ledger, and balance changes must roll back together.
DO $$
DECLARE v_status text; v_paid_cents bigint; v_events int; v_available numeric;
BEGIN
  BEGIN
    PERFORM public.record_required_pre_fund_payment_rpc(
      'operational_cost_submissions',
      '20000000-0000-0000-0000-000000000011',
      '10000000-0000-0000-0000-000000000009',
      50, 'SDG', CURRENT_DATE, auth.uid(), NULL, 'Must exhaust no rows', 'protected-insufficient-fund'
    );
    RAISE EXCEPTION 'insufficient Pre-Fund payment was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'insufficient Pre-Fund payment was accepted' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Pre-Fund link failed: Insufficient pre-fund balance%' THEN RAISE; END IF;
  END;
  SELECT status, amount_paid_cents INTO v_status, v_paid_cents
  FROM public.operational_cost_submissions
  WHERE id = '20000000-0000-0000-0000-000000000011';
  SELECT count(*) INTO v_events FROM public.pre_fund_transactions
  WHERE idempotency_key = 'protected-insufficient-fund';
  SELECT available_balance INTO v_available FROM public.pre_fund_requests
  WHERE id = '10000000-0000-0000-0000-000000000009';
  IF v_status <> 'approved' OR v_paid_cents <> 0 OR v_events <> 0 OR v_available <> 25 THEN
    RAISE EXCEPTION 'insufficient-fund rollback failed: source %/%, events %, balance %',
      v_status, v_paid_cents, v_events, v_available;
  END IF;
END $$;

DO $$
DECLARE v_result jsonb; v_status text; v_paid_cents bigint; v_events int; v_spent numeric; v_available numeric;
BEGIN
  SELECT public.record_required_pre_fund_payment_rpc(
    'operational_cost_submissions',
    '20000000-0000-0000-0000-000000000012',
    '10000000-0000-0000-0000-000000000010',
    50, 'SDG', CURRENT_DATE, auth.uid(), NULL, 'Open Cost Submission fund', 'protected-open-cost-fund'
  ) INTO v_result;
  SELECT status, amount_paid_cents INTO v_status, v_paid_cents
  FROM public.operational_cost_submissions
  WHERE id = '20000000-0000-0000-0000-000000000012';
  SELECT count(*) INTO v_events FROM public.pre_fund_transactions
  WHERE idempotency_key = 'protected-open-cost-fund';
  SELECT spent_amount INTO v_spent FROM public.pre_fund_allocations
  WHERE pre_fund_request_id = '10000000-0000-0000-0000-000000000010'
    AND user_id = auth.uid();
  SELECT available_balance INTO v_available FROM public.pre_fund_requests
  WHERE id = '10000000-0000-0000-0000-000000000010';
  IF (v_result ->> 'success')::boolean IS DISTINCT FROM true
     OR v_status <> 'paid'
     OR v_paid_cents <> 5000
     OR v_events <> 1
     OR v_spent <> 0
     OR v_available <> 50 THEN
    RAISE EXCEPTION 'open Cost Submission payment failed: result %, source %/%, events %, spent %, available %',
      v_result, v_status, v_paid_cents, v_events, v_spent, v_available;
  END IF;
END $$;

-- Down Payments use the selected fund's shared balance. The requester does not
-- need a personal allocation and another user's allocation remains unchanged.
DO $$
DECLARE v_result jsonb; v_status text; v_paid numeric; v_spent numeric; v_available numeric;
BEGIN
  SELECT public.record_required_pre_fund_payment_rpc(
    'down_payment_requests',
    '30000000-0000-0000-0000-000000000019',
    '10000000-0000-0000-0000-000000000010',
    20, 'SDG', CURRENT_DATE, auth.uid(), NULL,
    'Shared Down Payment fund', 'source-payment:shared-down-payment'
  ) INTO v_result;
  SELECT status, total_paid_amount INTO v_status, v_paid
  FROM public.down_payment_requests
  WHERE id = '30000000-0000-0000-0000-000000000019';
  SELECT spent_amount INTO v_spent
  FROM public.pre_fund_allocations
  WHERE pre_fund_request_id = '10000000-0000-0000-0000-000000000010'
    AND user_id = auth.uid();
  SELECT available_balance INTO v_available
  FROM public.pre_fund_requests
  WHERE id = '10000000-0000-0000-0000-000000000010';
  IF (v_result ->> 'success')::boolean IS DISTINCT FROM true
     OR v_status <> 'fully_paid'
     OR v_paid <> 20
     OR v_spent <> 0
     OR v_available <> 30 THEN
    RAISE EXCEPTION 'shared Down Payment fund failed: result %, source %/%, allocation spent %, available %',
      v_result, v_status, v_paid, v_spent, v_available;
  END IF;
END $$;

-- A partial advance may be paid from two funds. Relinking one immutable event
-- creates a reversal plus replacement event; it never mutates or deletes history.
DO $$
DECLARE v_first jsonb; v_second jsonb; v_correction jsonb; v_retry jsonb;
        v_original_id uuid; v_original_amount numeric; v_reversals int; v_active_links int;
        v_visible_event_key text;
        v_source_status text; v_source_paid numeric; v_first_paid numeric; v_first_available numeric;
        v_second_paid numeric; v_second_available numeric;
BEGIN
  SELECT public.record_required_pre_fund_payment_rpc(
    'down_payment_requests',
    '30000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000007',
    60, 'SDG', CURRENT_DATE, auth.uid(), NULL, 'First split payment', 'source-payment:protected-split-one'
  ) INTO v_first;
  SELECT public.record_required_pre_fund_payment_rpc(
    'down_payment_requests',
    '30000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000008',
    40, 'SDG', CURRENT_DATE, auth.uid(), NULL, 'Second split payment', 'source-payment:protected-split-two'
  ) INTO v_second;
  v_original_id := (v_first ->> 'transaction_id')::uuid;
  UPDATE public.profiles SET role = 'fom' WHERE id = auth.uid();
  BEGIN
    PERFORM public.correct_required_pre_fund_payment_link_rpc(
      v_original_id,
      '10000000-0000-0000-0000-000000000008',
      'FOM must not correct a fund',
      'fom-direct-correction-attempt'
    );
    RAISE EXCEPTION 'FOM was allowed to correct a Pre-Fund payment';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FOM was allowed to correct a Pre-Fund payment' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Access denied: Finance role required for Pre-Fund corrections%' THEN RAISE; END IF;
  END;
  UPDATE public.profiles SET role = 'super_admin' WHERE id = auth.uid();
  SELECT public.correct_required_pre_fund_payment_link_rpc(
    v_original_id,
    '10000000-0000-0000-0000-000000000008',
    'Initial fund selection corrected',
    'protected-split-correction'
  ) INTO v_correction;
  SELECT public.correct_required_pre_fund_payment_link_rpc(
    v_original_id,
    '10000000-0000-0000-0000-000000000008',
    'Initial fund selection corrected',
    'protected-split-correction'
  ) INTO v_retry;
  SELECT amount INTO v_original_amount FROM public.pre_fund_transactions WHERE id = v_original_id;
  SELECT count(*) INTO v_reversals FROM public.pre_fund_transactions WHERE reversal_of_id = v_original_id;
  SELECT count(*) INTO v_active_links FROM public.pre_fund_source_payment_links_v
  WHERE source_table = 'down_payment_requests'
    AND source_id = '30000000-0000-0000-0000-000000000011';
  SELECT idempotency_key INTO v_visible_event_key
  FROM public.pre_fund_source_payment_links_v
  WHERE payment_event_id = (v_second ->> 'transaction_id')::uuid;
  SELECT status, total_paid_amount INTO v_source_status, v_source_paid
  FROM public.down_payment_requests WHERE id = '30000000-0000-0000-0000-000000000011';
  SELECT paid_amount, available_balance INTO v_first_paid, v_first_available
  FROM public.pre_fund_requests WHERE id = '10000000-0000-0000-0000-000000000007';
  SELECT paid_amount, available_balance INTO v_second_paid, v_second_available
  FROM public.pre_fund_requests WHERE id = '10000000-0000-0000-0000-000000000008';
  IF (v_correction ->> 'success')::boolean IS DISTINCT FROM true
     OR (v_retry ->> 'idempotent')::boolean IS DISTINCT FROM true
     OR v_original_amount <> 60
     OR v_reversals <> 1
     OR v_active_links <> 2
     OR v_visible_event_key <> 'source-payment:protected-split-two'
     OR v_source_status <> 'fully_paid'
     OR v_source_paid <> 100
     OR v_first_paid <> 40
     OR v_first_available <> 160
     OR v_second_paid <> 100
     OR v_second_available <> 100 THEN
    RAISE EXCEPTION 'immutable split/relink assertion failed: correction %, retry %, reversals %, links %, source %/%, funds %/%, %/%',
      v_correction, v_retry, v_reversals, v_active_links, v_source_status, v_source_paid,
      v_first_paid, v_first_available, v_second_paid, v_second_available;
  END IF;
  BEGIN
    UPDATE public.pre_fund_transactions SET amount = 61 WHERE id = v_original_id;
    RAISE EXCEPTION 'immutable original payment was updated';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'immutable original payment was updated' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Pre-fund payment events are immutable%' THEN RAISE; END IF;
  END;
END $$;

-- A direct top-up is a new receipt event, not a notification-only top-up
-- request or an allocation change. It must commit a fund increase, audit row,
-- journal entry, and receipt document references exactly once.
INSERT INTO public.pre_fund_requests (
  id, name, currency, amount, available_balance, paid_amount, status,
  country_id, gl_liability_account, gl_receipt_account
) VALUES (
  '10000000-0000-0000-0000-000000000013', 'Direct Top-Up Regression Fund',
  'SDG', 1000, 1000, 0, 'low_balance',
  '60000000-0000-0000-0000-000000000001', '2400', '1200'
);
-- Duplicate country-local codes must take precedence over their global
-- counterparts when the top-up creates GL lines.
INSERT INTO public.acct_accounts (code, country_id) VALUES
  ('1200', '60000000-0000-0000-0000-000000000001'),
  ('2400', '60000000-0000-0000-0000-000000000001');
SELECT public.record_direct_pre_fund_topup_rpc(
  '10000000-0000-0000-0000-000000000013',
  250,
  'Donor bank transfer',
  'Grant tranche received',
  'https://example.test/receipt-primary.pdf',
  jsonb_build_array(
    'https://example.test/receipt-primary.pdf',
    'https://example.test/receipt-supporting.pdf'
  ),
  'direct-topup-regression-event'
);
-- The same retry key must never add the money a second time.
SELECT public.record_direct_pre_fund_topup_rpc(
  '10000000-0000-0000-0000-000000000013',
  250,
  'Donor bank transfer',
  'Grant tranche received',
  'https://example.test/receipt-primary.pdf',
  jsonb_build_array('https://example.test/receipt-primary.pdf'),
  'direct-topup-regression-event'
);
DO $$
DECLARE
  v_amount numeric;
  v_available numeric;
  v_status text;
  v_events integer;
  v_document_count integer;
  v_audits integer;
  v_journals integer;
  v_lines integer;
  v_bridge integer;
  v_snapshot_funded numeric;
  v_snapshot_available numeric;
  v_journal_country uuid;
  v_journal_status text;
  v_country_scoped_lines integer;
BEGIN
  SELECT amount, available_balance, status
  INTO v_amount, v_available, v_status
  FROM public.pre_fund_requests
  WHERE id = '10000000-0000-0000-0000-000000000013';
  SELECT count(*),
         COALESCE(MAX(jsonb_array_length(event_metadata -> 'supporting_document_urls')), 0)
  INTO v_events, v_document_count
  FROM public.pre_fund_transactions
  WHERE pre_fund_request_id = '10000000-0000-0000-0000-000000000013'
    AND transaction_type = 'receipt';
  SELECT count(*) INTO v_audits
  FROM public.pre_fund_event_audit audit
  JOIN public.pre_fund_transactions txn ON txn.id = audit.transaction_id
  WHERE txn.pre_fund_request_id = '10000000-0000-0000-0000-000000000013'
    AND audit.action = 'insert';
  SELECT count(*) INTO v_journals
  FROM public.acct_journal_entries
  WHERE idempotency_key = 'pf-direct-topup:direct-fund-topup:direct-topup-regression-event';
  SELECT count(*) INTO v_lines
  FROM public.acct_journal_lines lines
  JOIN public.acct_journal_entries entries ON entries.id = lines.entry_id
  WHERE entries.idempotency_key = 'pf-direct-topup:direct-fund-topup:direct-topup-regression-event';
  SELECT country_id INTO v_journal_country
  FROM public.acct_journal_entries
  WHERE idempotency_key = 'pf-direct-topup:direct-fund-topup:direct-topup-regression-event';
  SELECT status INTO v_journal_status
  FROM public.acct_journal_entries
  WHERE idempotency_key = 'pf-direct-topup:direct-fund-topup:direct-topup-regression-event';
  SELECT count(*) INTO v_country_scoped_lines
  FROM public.acct_journal_lines lines
  JOIN public.acct_journal_entries entries ON entries.id = lines.entry_id
  JOIN public.acct_accounts accounts ON accounts.id = lines.account_id
  WHERE entries.idempotency_key = 'pf-direct-topup:direct-fund-topup:direct-topup-regression-event'
    AND accounts.country_id = '60000000-0000-0000-0000-000000000001';
  SELECT count(*) INTO v_bridge
  FROM public.acct_gl_bridge_log bridge
  JOIN public.pre_fund_transactions txn ON txn.id = bridge.source_id
  WHERE txn.pre_fund_request_id = '10000000-0000-0000-0000-000000000013'
    AND bridge.event_type = 'pre_fund_direct_topup_received';
  SELECT funded_amount, verified_available_balance
  INTO v_snapshot_funded, v_snapshot_available
  FROM public.pre_fund_balance_snapshot_v
  WHERE fund_id = '10000000-0000-0000-0000-000000000013';

  IF v_amount <> 1250 OR v_available <> 1250 OR v_status <> 'active'
     OR v_events <> 1 OR v_document_count <> 2 OR v_audits <> 1
     OR v_journals <> 1 OR v_lines <> 2 OR v_bridge <> 1
     OR v_journal_status <> 'posted'
     OR v_journal_country <> '60000000-0000-0000-0000-000000000001'
     OR v_country_scoped_lines <> 2
     OR v_snapshot_funded <> 1250 OR v_snapshot_available <> 1250 THEN
    RAISE EXCEPTION 'direct top-up assertion failed: fund %/%/%, events %, documents %, audit %, journals %, lines %, bridge %, journal status %, journal country %, scoped lines %, snapshot %/%',
      v_amount, v_available, v_status, v_events, v_document_count, v_audits,
      v_journals, v_lines, v_bridge, v_journal_status, v_journal_country, v_country_scoped_lines,
      v_snapshot_funded, v_snapshot_available;
  END IF;
END $$;
INSERT INTO public.acct_funds (id, is_active)
VALUES ('50000000-0000-0000-0000-000000000002', true);
DO $$
DECLARE v_amount numeric; v_available numeric;
BEGIN
  BEGIN
    PERFORM public.record_direct_pre_fund_topup_rpc(
      '10000000-0000-0000-0000-000000000013',
      10, 'Invalid accounting setup', 'Must be rejected',
      'https://example.test/multiple-active-funds.pdf', '[]'::jsonb, 'direct-topup-multiple-active-funds'
    );
    RAISE EXCEPTION 'multiple active accounting funds accepted a direct top-up';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'multiple active accounting funds accepted a direct top-up' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Exactly one active Accounting Fund must be configured for Pre-Fund top-up posting%' THEN RAISE; END IF;
  END;
  SELECT amount, available_balance INTO v_amount, v_available
  FROM public.pre_fund_requests
  WHERE id = '10000000-0000-0000-0000-000000000013';
  IF v_amount <> 1250 OR v_available <> 1250 THEN
    RAISE EXCEPTION 'ambiguous accounting fund setup changed balance: %/%', v_amount, v_available;
  END IF;
END $$;
DELETE FROM public.acct_funds WHERE id = '50000000-0000-0000-0000-000000000002';
DO $$
DECLARE
  v_amount numeric;
  v_available numeric;
  v_events integer;
  v_journals integer;
  v_bridge integer;
BEGIN
  BEGIN
    PERFORM public.record_direct_pre_fund_topup_rpc(
      '10000000-0000-0000-0000-000000000013',
      'NaN'::numeric, 'Invalid numeric amount', 'Must be rejected',
      'https://example.test/nan.pdf', '[]'::jsonb, 'direct-topup-nan-blocked'
    );
    RAISE EXCEPTION 'NaN amount was accepted for a direct top-up';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'NaN amount was accepted for a direct top-up' THEN RAISE; END IF;
    IF SQLERRM <> 'Top-up amount must be finite and greater than zero.' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_direct_pre_fund_topup_rpc(
      '10000000-0000-0000-0000-000000000013',
      'Infinity'::numeric, 'Invalid numeric amount', 'Must be rejected',
      'https://example.test/infinity.pdf', '[]'::jsonb, 'direct-topup-infinity-blocked'
    );
    RAISE EXCEPTION 'infinite amount was accepted for a direct top-up';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'infinite amount was accepted for a direct top-up' THEN RAISE; END IF;
    IF SQLERRM <> 'Top-up amount must be finite and greater than zero.' THEN RAISE; END IF;
  END;
  SELECT amount, available_balance INTO v_amount, v_available
  FROM public.pre_fund_requests
  WHERE id = '10000000-0000-0000-0000-000000000013';
  SELECT count(*) INTO v_events
  FROM public.pre_fund_transactions
  WHERE pre_fund_request_id = '10000000-0000-0000-0000-000000000013'
    AND transaction_type = 'receipt';
  SELECT count(*) INTO v_journals
  FROM public.acct_journal_entries
  WHERE idempotency_key = 'pf-direct-topup:direct-fund-topup:direct-topup-regression-event';
  SELECT count(*) INTO v_bridge
  FROM public.acct_gl_bridge_log bridge
  JOIN public.pre_fund_transactions txn ON txn.id = bridge.source_id
  WHERE txn.pre_fund_request_id = '10000000-0000-0000-0000-000000000013'
    AND bridge.event_type = 'pre_fund_direct_topup_received';
  IF v_amount <> 1250 OR v_available <> 1250 OR v_events <> 1 OR v_journals <> 1 OR v_bridge <> 1 THEN
    RAISE EXCEPTION 'NaN rejection changed financial evidence: fund %/%, events %, journals %, bridge %',
      v_amount, v_available, v_events, v_journals, v_bridge;
  END IF;
END $$;
UPDATE public.profiles SET role = 'fom' WHERE id = auth.uid();
DO $$
BEGIN
  BEGIN
    PERFORM public.record_direct_pre_fund_topup_rpc(
      '10000000-0000-0000-0000-000000000013',
      10, 'Disallowed caller', 'Must be rejected',
      'https://example.test/blocked.pdf', '[]'::jsonb, 'direct-topup-fom-blocked'
    );
    RAISE EXCEPTION 'FOM was allowed to record a direct top-up';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FOM was allowed to record a direct top-up' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Access denied: Finance, Admin, or Super Admin role required%' THEN RAISE; END IF;
  END;
END $$;
UPDATE public.profiles SET role = 'super_admin' WHERE id = auth.uid();
UPDATE public.pre_fund_requests
SET status = 'closed'
WHERE id = '10000000-0000-0000-0000-000000000013';
DO $$
DECLARE v_amount numeric; v_available numeric;
BEGIN
  BEGIN
    PERFORM public.record_direct_pre_fund_topup_rpc(
      '10000000-0000-0000-0000-000000000013',
      10, 'Closed fund attempt', 'Must be rejected',
      'https://example.test/closed.pdf', '[]'::jsonb, 'direct-topup-closed-blocked'
    );
    RAISE EXCEPTION 'closed fund accepted a direct top-up';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'closed fund accepted a direct top-up' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Direct top-ups are only allowed for active or low-balance funds%' THEN RAISE; END IF;
  END;
  SELECT amount, available_balance INTO v_amount, v_available
  FROM public.pre_fund_requests
  WHERE id = '10000000-0000-0000-0000-000000000013';
  IF v_amount <> 1250 OR v_available <> 1250 THEN
    RAISE EXCEPTION 'rejected direct top-up changed closed fund balance: %/%', v_amount, v_available;
  END IF;
END $$;

-- Legacy source totals may lag behind valid immutable payment links. The
-- reconciled payment entry point must align the stale source cache and then
-- record only the true additional amount.
INSERT INTO public.pre_fund_requests (
  id, name, currency, amount, available_balance, paid_amount,
  gl_liability_account, gl_receipt_account
) VALUES (
  '10000000-0000-0000-0000-000000000017',
  'Legacy Source Total Reconciliation Fund', 'SDG', 500, 420, 80, '2400', '1200'
);
INSERT INTO public.down_payment_requests (
  id, status, approved_amount, requested_amount, remaining_amount,
  total_paid_amount, requested_by, justification
) VALUES (
  '30000000-0000-0000-0000-000000000023',
  'partially_paid', 200, 200, 150, 50, auth.uid(), 'Legacy stale source total'
);
INSERT INTO public.pre_fund_transactions (
  pre_fund_request_id, transaction_type, amount, currency, transaction_date,
  source_table, source_id, created_by, user_id, idempotency_key
) VALUES (
  '10000000-0000-0000-0000-000000000017', 'payment', 80, 'SDG', CURRENT_DATE,
  'down_payment_requests', '30000000-0000-0000-0000-000000000023',
  auth.uid(), auth.uid(), 'legacy-source-total-existing-payment'
);
SELECT public.record_reconciled_required_pre_fund_payment_rpc(
  'down_payment_requests',
  '30000000-0000-0000-0000-000000000023',
  '10000000-0000-0000-0000-000000000017',
  40, 'SDG', CURRENT_DATE, auth.uid(), 'https://example.test/receipt.pdf',
  'Additional evidenced payment', 'legacy-source-total-new-payment'
);
DO $$
DECLARE
  v_paid numeric;
  v_remaining numeric;
  v_status text;
  v_reconciled boolean;
  v_linked numeric;
BEGIN
  SELECT total_paid_amount, remaining_amount, status,
         COALESCE((metadata ->> 'pre_fund_source_total_reconciled')::boolean, false)
    INTO v_paid, v_remaining, v_status, v_reconciled
    FROM public.down_payment_requests
   WHERE id = '30000000-0000-0000-0000-000000000023';
  SELECT COALESCE(SUM(CASE
           WHEN transaction_type = 'payment' THEN amount
           WHEN transaction_type IN ('reversal', 'return') THEN -amount
           ELSE 0
         END), 0)
    INTO v_linked
    FROM public.pre_fund_transactions
   WHERE source_table = 'down_payment_requests'
     AND source_id = '30000000-0000-0000-0000-000000000023';
  IF v_paid <> 120 OR v_remaining <> 80 OR v_status <> 'partially_paid'
     OR NOT v_reconciled OR v_linked <> 120 THEN
    RAISE EXCEPTION 'legacy source total reconciliation failed: paid %, remaining %, status %, marker %, linked %',
      v_paid, v_remaining, v_status, v_reconciled, v_linked;
  END IF;
END $$;

-- A linked amount above the approved advance is not a stale cache. It must
-- remain blocked for an audited reversal and must not mutate source evidence.
INSERT INTO public.pre_fund_requests (
  id, name, currency, amount, available_balance, paid_amount,
  gl_liability_account, gl_receipt_account
) VALUES (
  '10000000-0000-0000-0000-000000000018',
  'Over-linked Source Guard Fund', 'SDG', 200, 120, 80, '2400', '1200'
);
INSERT INTO public.down_payment_requests (
  id, status, approved_amount, requested_amount, remaining_amount,
  total_paid_amount, requested_by, justification
) VALUES (
  '30000000-0000-0000-0000-000000000024',
  'partially_paid', 70, 70, 20, 50, auth.uid(), 'Intentionally over-linked source'
);
INSERT INTO public.pre_fund_transactions (
  pre_fund_request_id, transaction_type, amount, currency, transaction_date,
  source_table, source_id, created_by, user_id, idempotency_key
) VALUES (
  '10000000-0000-0000-0000-000000000018', 'payment', 80, 'SDG', CURRENT_DATE,
  'down_payment_requests', '30000000-0000-0000-0000-000000000024',
  auth.uid(), auth.uid(), 'over-linked-source-existing-payment'
);
DO $$
DECLARE
  v_paid numeric;
  v_events integer;
BEGIN
  BEGIN
    PERFORM public.record_reconciled_required_pre_fund_payment_rpc(
      'down_payment_requests',
      '30000000-0000-0000-0000-000000000024',
      '10000000-0000-0000-0000-000000000018',
      10, 'SDG', CURRENT_DATE, auth.uid(), 'https://example.test/receipt.pdf',
      'Must remain blocked', 'over-linked-source-new-payment'
    );
    RAISE EXCEPTION 'over-linked source accepted another payment';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'over-linked source accepted another payment' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'This advance is over-linked:%' THEN RAISE; END IF;
  END;
  SELECT total_paid_amount INTO v_paid
    FROM public.down_payment_requests
   WHERE id = '30000000-0000-0000-0000-000000000024';
  SELECT count(*) INTO v_events
    FROM public.pre_fund_transactions
   WHERE source_table = 'down_payment_requests'
     AND source_id = '30000000-0000-0000-0000-000000000024';
  IF v_paid <> 50 OR v_events <> 1 THEN
    RAISE EXCEPTION 'over-linked rejection changed evidence: paid %, events %', v_paid, v_events;
  END IF;
END $$;
SQL

echo "Pre-fund ledger reconciliation regression checks passed."
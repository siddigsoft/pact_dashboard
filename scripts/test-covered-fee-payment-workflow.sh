#!/usr/bin/env bash
set -euo pipefail

# Compiles the migration against a disposable PostgreSQL database and exercises
# the protected RPC. This intentionally uses a small schema stub: it validates
# the transaction and accounting safeguards without requiring a project database.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="$(dirname "$(command -v psql)")"
PG_USER="$(id -un)"
PG_DIR="$(mktemp -d /tmp/covered-fee-payment.XXXXXX)"
PG_PORT=55461

cleanup() {
  "$PG_BIN/pg_ctl" -D "$PG_DIR" -m fast -w stop >/dev/null 2>&1 || true
  rm -rf "$PG_DIR"
}
trap cleanup EXIT

"$PG_BIN/initdb" -D "$PG_DIR" --no-locale -E UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$PG_DIR" -o "-p $PG_PORT -k /tmp" -w start >/dev/null

psql_cmd=("$PG_BIN/psql" -U "$PG_USER" -v ON_ERROR_STOP=1 -h /tmp -p "$PG_PORT" -d postgres)

"${psql_cmd[@]}" <<'SQL' >/dev/null
CREATE ROLE authenticated;
CREATE EXTENSION pgcrypto;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT '00000000-0000-0000-0000-000000000001'::uuid
$$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text, full_name text);
CREATE TABLE public.mmp_files (
  id uuid PRIMARY KEY, name text, cycle_status text,
  cycle_closed_at timestamptz, cycle_closed_by uuid, updated_at timestamptz
);
CREATE TABLE public.pre_fund_requests (
  id uuid PRIMARY KEY, name text, status text, currency text,
  available_balance numeric, paid_amount numeric, start_date date, end_date date
);
CREATE TABLE public.pre_fund_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pre_fund_request_id uuid,
  transaction_type text, amount numeric, currency text, reference text,
  description text, transaction_date date, reconciled boolean, source_table text,
  source_id uuid, created_by uuid, user_id uuid, receipt_url text
);
CREATE TABLE public.pre_fund_allocations (
  pre_fund_request_id uuid, user_id uuid, allocated_amount numeric,
  spent_amount numeric, PRIMARY KEY (pre_fund_request_id, user_id)
);
CREATE TABLE public.mmp_site_entries (
  id uuid PRIMARY KEY, mmp_file_id uuid, accepted_by text, forwarded_to_user_id uuid,
  additional_data jsonb, status text,
  not_covered_flag boolean, enumerator_fee numeric, transport_fee numeric,
  accepted_at timestamptz, updated_at timestamptz, cost numeric,
  fee_paid_status text, fee_paid_amount numeric, fee_cash_paid_amount numeric,
  fee_advance_offset_amount numeric, fee_unallocated_amount numeric,
  fee_paid_at timestamptz, fee_paid_by uuid,
  fee_payment_method text, fee_payment_notes text, fee_receipt_url text,
  fee_receipt_uploaded_at timestamptz, fee_receipt_uploaded_by uuid,
  wfp_override_justification text, wfp_override_by uuid, wfp_override_at timestamptz,
  site_name text
);
SQL

"${psql_cmd[@]}" -f "$ROOT_DIR/supabase/migrations/20260820d_covered_fee_payment_workflow.sql" >/dev/null

"${psql_cmd[@]}" <<'SQL'
INSERT INTO profiles (id, role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Finance'),
  ('00000000-0000-0000-0000-000000000002', 'Enumerator');
INSERT INTO mmp_files (id, name) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Cycle A');
INSERT INTO pre_fund_requests (id, name, status, currency, available_balance, paid_amount) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Fund A', 'active', 'SDG', 200, 0),
  ('20000000-0000-0000-0000-000000000002', 'Too Small', 'active', 'SDG', 149, 0);
INSERT INTO mmp_site_entries (
  id, mmp_file_id, accepted_by, forwarded_to_user_id, status, not_covered_flag, enumerator_fee,
  transport_fee, fee_paid_status, fee_cash_paid_amount, fee_advance_offset_amount,
  fee_unallocated_amount, site_name
) VALUES
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002', NULL, 'claimed', false, 100, 50, 'unpaid', 0, 0, 0, 'Claimed only'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002', NULL, 'not_covered', true, 100, 50, 'unpaid', 0, 0, 0, 'Not covered'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
    NULL, '00000000-0000-0000-0000-000000000001', 'assigned', false, NULL, NULL, 'unpaid', 0, 0, 0, 'Newly assigned');

-- Assigned/claimed status alone and explicit not-covered status must never pay.
DO $$
BEGIN
  PERFORM public.record_covered_enumerator_fee_payments(
    '[{"site_id":"30000000-0000-0000-0000-000000000001","amount":150}]',
    'Cash', current_date, 'https://receipt.test/claimed');
  RAISE EXCEPTION 'expected claimed site to be rejected';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'NOT_PAYABLE:%' THEN RAISE; END IF;
END $$;

SELECT public.persist_wfp_covered_sites(
  '10000000-0000-0000-0000-000000000001',
  ARRAY['30000000-0000-0000-0000-000000000001'::uuid]
);

-- Mirror the legacy broad direct UPDATE grant. The trigger must still reject
-- an authenticated caller who tries to forge payment state outside the RPC.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, UPDATE ON public.mmp_site_entries TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
INSERT INTO pre_fund_allocations (pre_fund_request_id, user_id, allocated_amount, spent_amount)
VALUES ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 200, 0);

-- Normal and offline acceptance both use the protected acceptance RPC. It must
-- retain their first calculated fee breakdown without overwriting an existing
-- approved value.
SET ROLE authenticated;
SELECT public.set_mmp_site_entry_acceptance(
  '30000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'accepted',
  now(),
  70,
  30,
  100
);
RESET ROLE;
DO $$
DECLARE v_site public.mmp_site_entries%ROWTYPE;
BEGIN
  SELECT * INTO v_site FROM public.mmp_site_entries
   WHERE id = '30000000-0000-0000-0000-000000000003';
  IF v_site.status <> 'accepted'
     OR v_site.enumerator_fee <> 70
     OR v_site.transport_fee <> 30
     OR v_site.cost <> 100 THEN
    RAISE EXCEPTION 'expected protected acceptance to retain the calculated fee breakdown';
  END IF;
END $$;
SELECT public.set_mmp_site_entry_acceptance(
  '30000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'accepted',
  now(),
  99,
  99,
  198
);

-- An invalid item causes the entire batch to roll back; the good site remains unpaid.
DO $$
BEGIN
  PERFORM public.record_covered_enumerator_fee_payments(
    '[{"site_id":"30000000-0000-0000-0000-000000000001","amount":150},{"site_id":"30000000-0000-0000-0000-000000000002","amount":150}]',
    'Cash', current_date, 'https://receipt.test/batch');
  RAISE EXCEPTION 'expected not-covered batch item to be rejected';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'NOT_PAYABLE:%' THEN RAISE; END IF;
END $$;

DO $$
BEGIN
  PERFORM public.record_covered_enumerator_fee_payments(
    '[{"site_id":"30000000-0000-0000-0000-000000000001","amount":151}]',
    'Cash', current_date, 'https://receipt.test/overpay');
  RAISE EXCEPTION 'expected overpayment to be rejected';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'AMOUNT_MISMATCH:%' THEN RAISE; END IF;
END $$;

DO $$
BEGIN
  PERFORM public.record_covered_enumerator_fee_payments(
    '[{"site_id":"30000000-0000-0000-0000-000000000001","amount":150}]',
    'Cash', current_date, 'https://receipt.test/insufficient', NULL, NULL,
    '20000000-0000-0000-0000-000000000002');
  RAISE EXCEPTION 'expected insufficient pre-fund to be rejected';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'PRE_FUND_INSUFFICIENT:%' THEN RAISE; END IF;
END $$;

-- Final Close must fail at the database boundary while the eligible WFP-covered
-- site has money due, regardless of browser-state checks or user overrides.
DO $$
BEGIN
  UPDATE mmp_files SET cycle_status = 'closed'
   WHERE id = '10000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'expected Final Close to be blocked by unpaid covered fee';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'COVERED_FEES_UNPAID:%' THEN RAISE; END IF;
END $$;

SELECT public.record_covered_enumerator_fee_payments(
  '[{"site_id":"30000000-0000-0000-0000-000000000001","amount":150}]',
  'Bank Transfer', current_date, 'https://receipt.test/final', 'V-001',
  'Batch settlement', '20000000-0000-0000-0000-000000000001'
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM mmp_site_entries
     WHERE id = '30000000-0000-0000-0000-000000000001'
       AND (status <> 'wfp_confirmed' OR fee_paid_status <> 'paid'
             OR fee_cash_paid_amount <> 150 OR fee_payment_reference <> 'V-001'
             OR fee_payment_method <> 'bank_transfer')
  ) THEN
    RAISE EXCEPTION 'covered-site payment summary was not recorded correctly';
  END IF;
  IF (SELECT available_balance FROM pre_fund_requests WHERE id = '20000000-0000-0000-0000-000000000001') <> 50 THEN
    RAISE EXCEPTION 'pre-fund balance was not reduced atomically';
  END IF;
  IF (SELECT spent_amount FROM pre_fund_allocations
      WHERE pre_fund_request_id = '20000000-0000-0000-0000-000000000001'
        AND user_id = '00000000-0000-0000-0000-000000000002') <> 150 THEN
    RAISE EXCEPTION 'enumerator allocation was not charged using text accepted_by';
  END IF;
  IF (SELECT count(*) FROM enumerator_fee_payments) <> 1 THEN
    RAISE EXCEPTION 'immutable fee payment ledger row was not recorded';
  END IF;
  IF (SELECT payment_method FROM enumerator_fee_payments LIMIT 1) <> 'bank_transfer' THEN
    RAISE EXCEPTION 'bank transfer payment method was not normalized for the GL bridge';
  END IF;
  UPDATE mmp_files SET cycle_status = 'closed'
   WHERE id = '10000000-0000-0000-0000-000000000001';
END $$;
SQL

direct_attempt="$("${psql_cmd[@]}" -c "SET ROLE authenticated; UPDATE public.mmp_site_entries SET fee_cash_paid_amount = 0, fee_paid_status = 'unpaid' WHERE id = '30000000-0000-0000-0000-000000000001';" 2>&1 || true)"
if grep -q 'PROTECTED_FEE_STATE' <<<"$direct_attempt"; then
  :
else
  echo "Expected direct authenticated fee-state update to be rejected." >&2
  echo "$direct_attempt" >&2
  exit 1
fi

eligibility_attempt="$("${psql_cmd[@]}" -c "SET ROLE authenticated; UPDATE public.mmp_site_entries SET accepted_by = '00000000-0000-0000-0000-000000000001' WHERE id = '30000000-0000-0000-0000-000000000001';" 2>&1 || true)"
if grep -q 'PROTECTED_ACCEPTANCE_STATE' <<<"$eligibility_attempt"; then
  :
else
  echo "Expected direct authenticated payee reassignment to be rejected." >&2
  echo "$eligibility_attempt" >&2
  exit 1
fi

coverage_attempt="$("${psql_cmd[@]}" -c "SET ROLE authenticated; UPDATE public.mmp_site_entries SET not_covered_flag = true WHERE id = '30000000-0000-0000-0000-000000000001';" 2>&1 || true)"
if grep -q 'PROTECTED_ELIGIBILITY_STATE' <<<"$coverage_attempt"; then
  :
else
  echo "Expected direct authenticated coverage-flag change to be rejected." >&2
  echo "$coverage_attempt" >&2
  exit 1
fi

preconfirmation_attempt="$("${psql_cmd[@]}" -c "SET ROLE authenticated; UPDATE public.mmp_site_entries SET accepted_by = '00000000-0000-0000-0000-000000000001' WHERE id = '30000000-0000-0000-0000-000000000002';" 2>&1 || true)"
if grep -q 'PROTECTED_ACCEPTANCE_STATE' <<<"$preconfirmation_attempt"; then
  :
else
  echo "Expected direct pre-confirmation payee assignment to be rejected." >&2
  echo "$preconfirmation_attempt" >&2
  exit 1
fi

assignment_attempt="$("${psql_cmd[@]}" -c "SET ROLE authenticated; UPDATE public.mmp_site_entries SET forwarded_to_user_id = '00000000-0000-0000-0000-000000000001' WHERE id = '30000000-0000-0000-0000-000000000002';" 2>&1 || true)"
if grep -q 'PROTECTED_ASSIGNMENT_STATE' <<<"$assignment_attempt"; then
  :
else
  echo "Expected direct assignment manipulation to be rejected." >&2
  echo "$assignment_attempt" >&2
  exit 1
fi

echo "Covered-site fee payment migration regression checks passed."
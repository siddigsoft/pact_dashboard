#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="$(dirname "$(command -v initdb)")"
TMP_DIR="$(mktemp -d)"
PORT="${INCENTIVE_TEST_PORT:-55462}"
SOCKET_DIR="$TMP_DIR/socket"
PSQL=("$PG_BIN/psql" -X -h "$SOCKET_DIR" -p "$PORT" -U "$(id -un)" -d postgres -v ON_ERROR_STOP=1)

cleanup() {
  status=$?
  "$PG_BIN/pg_ctl" -D "$TMP_DIR/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
  exit "$status"
}
trap cleanup EXIT

mkdir -p "$SOCKET_DIR"
"$PG_BIN/initdb" -D "$TMP_DIR/data" --no-locale --encoding=UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$TMP_DIR/data" -o "-k $SOCKET_DIR -p $PORT" -w start >/dev/null

"${PSQL[@]}" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION public.incentive_is_finance_or_admin() RETURNS boolean
 LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.incentive_is_admin() RETURNS boolean
 LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE TABLE public.profiles (
 id uuid PRIMARY KEY, role text, hub_id text, secondary_hub_id text,
 state_id text, location jsonb DEFAULT '{}'::jsonb,
 additional_roles jsonb DEFAULT '[]'::jsonb
);
CREATE TABLE public.user_classifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES public.profiles(id),
 role_scope text, is_active boolean DEFAULT true, effective_from timestamptz DEFAULT now(),
 effective_until timestamptz
);
CREATE TABLE public.hubs (id uuid PRIMARY KEY, name text);
CREATE TABLE public.hub_states (hub_id text, state_id text, state_name text);
CREATE TABLE public.mmp_files (
 id uuid PRIMARY KEY, name text, hub_id uuid REFERENCES public.hubs(id),
 currency text DEFAULT 'SDG', cycle_status text, cycle_closed_at timestamptz,
 archivedat timestamptz, uploaded_at timestamptz, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.mmp_site_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mmp_file_id uuid REFERENCES public.mmp_files(id),
 state text, enumerator_fee numeric, verified_by uuid
);
CREATE TABLE public.incentive_configs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hub_id text, role text NOT NULL,
 is_active boolean NOT NULL DEFAULT true, bonus_pct numeric NOT NULL,
 split_method text NOT NULL, coverage_threshold_pct numeric NOT NULL,
 what_counts text NOT NULL, created_by uuid, created_at timestamptz DEFAULT now(),
 updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.mmp_incentive_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mmp_id uuid UNIQUE REFERENCES public.mmp_files(id),
 status text NOT NULL DEFAULT 'calculating', total_dc_fee_pool_cents bigint NOT NULL DEFAULT 0,
 total_bonus_cents bigint NOT NULL DEFAULT 0, config_snapshot jsonb DEFAULT '[]',
 pre_approved_by uuid, pre_approved_at timestamptz, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.mmp_incentive_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), snapshot_id uuid REFERENCES public.mmp_incentive_snapshots(id),
 mmp_id uuid REFERENCES public.mmp_files(id), user_id uuid REFERENCES public.profiles(id),
 role text, state_id text, hub_id text, hub_name text, dc_count integer,
 dc_fee_pool_cents bigint, bonus_pct numeric, bonus_amount_cents bigint,
 currency text DEFAULT 'SDG', excluded boolean DEFAULT false, exclusion_note text,
 status text DEFAULT 'pending', payment_method text, payroll_period text,
 paid_by uuid, paid_at timestamptz, idempotency_key uuid DEFAULT gen_random_uuid(),
 created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX idx_mmp_incentive_payments_unique_person
 ON public.mmp_incentive_payments(mmp_id,user_id,role);
CREATE TABLE public.wallets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE REFERENCES public.profiles(id),
 balances jsonb NOT NULL DEFAULT '{}'::jsonb, total_earned numeric DEFAULT 0,
 updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.wallet_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), wallet_id uuid REFERENCES public.wallets(id),
 user_id uuid, type text, status text, amount numeric, amount_cents bigint, currency text,
 description text, balance_before numeric, balance_after numeric, created_by uuid,
 metadata jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.payroll_run_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, type text,
 amount_cents bigint, currency text, period_label text, reference_id uuid UNIQUE,
 notes text, created_by uuid, created_at timestamptz DEFAULT now()
);
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT INSERT ON public.wallet_transactions,public.payroll_run_items TO authenticated;
SQL

"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260905_incentive_legacy_evidence_remediation.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/incentive_legacy_evidence_remediation_test.sql"

# Two Finance sessions racing for one legacy wallet source: exactly one may win.
"${PSQL[@]}" <<'SQL'
INSERT INTO mmp_incentive_payments(
 id,snapshot_id,mmp_id,user_id,role,bonus_amount_cents,currency,status,payment_method,paid_at,idempotency_key
) VALUES
 ('91000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000030',
  '90000000-0000-0000-0000-000000000020','90000000-0000-0000-0000-000000000002',
  'race-a',700,'SDG','paid','wallet',now(),'91000000-0000-0000-0000-000000000010'),
 ('91000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000030',
  '90000000-0000-0000-0000-000000000020','90000000-0000-0000-0000-000000000002',
  'race-b',700,'SDG','paid','wallet',now(),'91000000-0000-0000-0000-000000000010');
INSERT INTO wallet_transactions(
 id,wallet_id,user_id,type,status,amount,amount_cents,currency,metadata
) VALUES(
 '91000000-0000-0000-0000-000000000020','90000000-0000-0000-0000-000000000060',
 '90000000-0000-0000-0000-000000000002','adjustment','posted',7,700,'SDG',
 '{"idempotency_key":"91000000-0000-0000-0000-000000000010"}');
SQL

set +e
"${PSQL[@]}" -c "SELECT set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',false); SELECT backfill_legacy_incentive_evidence('91000000-0000-0000-0000-000000000001');" >/dev/null 2>&1 &
race_a=$!
"${PSQL[@]}" -c "SELECT set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',false); SELECT backfill_legacy_incentive_evidence('91000000-0000-0000-0000-000000000002');" >/dev/null 2>&1 &
race_b=$!
wait "$race_a"; status_a=$?
wait "$race_b"; status_b=$?
set -e
if [[ $(( (status_a == 0) + (status_b == 0) )) -ne 1 ]]; then
  echo "Expected exactly one concurrent legacy evidence claim to succeed" >&2
  exit 1
fi
"${PSQL[@]}" <<'SQL'
DO $$
BEGIN
 IF (SELECT count(*) FROM mmp_incentive_settlements
     WHERE payment_id IN ('91000000-0000-0000-0000-000000000001',
                          '91000000-0000-0000-0000-000000000002'))<>1
    OR (SELECT count(*) FROM mmp_incentive_evidence_backfill_audit
     WHERE payment_id IN ('91000000-0000-0000-0000-000000000001',
                          '91000000-0000-0000-0000-000000000002'))<>1 THEN
   RAISE EXCEPTION 'concurrent backfill reused one financial source';
 END IF;
END $$;
DELETE FROM mmp_incentive_evidence_backfill_audit
 WHERE payment_id IN ('91000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000002');
DELETE FROM mmp_incentive_settlements
 WHERE payment_id IN ('91000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000002');
DELETE FROM wallet_transactions WHERE id='91000000-0000-0000-0000-000000000020';
DELETE FROM mmp_incentive_payments
 WHERE id IN ('91000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000002');
SQL

"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260906_incentive_system_hardening.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260907_mmp_incentive_role_eligibility.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/incentive_system_hardening_test.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/incentive_system_settlement_fixture_test.sql"

echo "Incentive hardening migration, contract checks, and settlement fixtures passed."
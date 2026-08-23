#!/usr/bin/env bash
set -euo pipefail

# Disposable PostgreSQL regression harness for the atomic Operational Cost
# tier-revert workflow. It never touches Supabase data.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="$(dirname "$(command -v initdb)")"
TMP_DIR="$(mktemp -d)"
PORT="${OCS_TIER_REVERT_TEST_PORT:-55480}"
SOCKET_DIR="$TMP_DIR/socket"

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
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT '11111111-1111-4111-8111-111111111111'::uuid $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text);
INSERT INTO public.profiles VALUES ('11111111-1111-4111-8111-111111111111', 'Super Admin');
CREATE TABLE public.super_admins (user_id uuid PRIMARY KEY, is_active boolean NOT NULL);
CREATE TABLE public.user_roles (user_id uuid, role text);
CREATE TABLE public.user_permission_overrides (
  user_id uuid, resource text, action text, is_granted boolean, expires_at timestamptz
);
CREATE FUNCTION public.is_super_admin(uuid) RETURNS boolean LANGUAGE sql AS
  $$ SELECT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = $1 AND is_active) $$;

CREATE TABLE public.operational_cost_submissions (
  id uuid PRIMARY KEY,
  status text,
  submitter_role text,
  tier1_status text, tier2_status text, tier3_status text, tier4_status text,
  tier1_approved_by uuid, tier2_approved_by uuid, tier3_approved_by uuid, tier4_approved_by uuid,
  tier1_approved_at timestamptz, tier2_approved_at timestamptz, tier3_approved_at timestamptz, tier4_approved_at timestamptz,
  tier1_notes text, tier2_notes text, tier3_notes text, tier4_notes text,
  payment_proof_url text, payment_proof_notes text, payment_proof_uploaded_at timestamptz,
  amount_paid_cents numeric, paid_at timestamptz, paid_by uuid, updated_at timestamptz
);
CREATE TABLE public.pre_fund_transactions (
  id uuid PRIMARY KEY, source_table text, source_id uuid, transaction_type text,
  reconciled boolean, reversal_of_id uuid, occurred_at timestamptz
);
CREATE TABLE public.unlink_calls (source_id uuid);
CREATE FUNCTION public._unlink_pre_fund_payment_internal_rpc(text, uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.unlink_calls VALUES ($2);
  RETURN jsonb_build_object('success', true);
END;
$$;
SQL

"${PSQL[@]}" -f "$ROOT/supabase/migrations/20260823e_atomic_ocs_tier_revert.sql" >/dev/null

"${PSQL[@]}" <<'SQL'
INSERT INTO public.operational_cost_submissions (
  id, status, submitter_role, tier1_status, tier2_status, tier3_status, tier4_status, amount_paid_cents
) VALUES
  ('22222222-2222-4222-8222-222222222222', 'approved', 'Coordinator', 'approved', 'approved', 'approved', 'approved', 400000000),
  ('33333333-3333-4333-8333-333333333333', 'approved', 'Supervisor', 'approved', 'approved', 'approved', NULL, 0),
  ('44444444-4444-4444-8444-444444444444', 'approved', 'Supervisor', 'approved', 'approved', 'approved', NULL, 400000000),
  ('55555555-5555-4555-8555-555555555555', 'approved', 'Coordinator', 'approved', 'approved', 'approved', 'approved', 0),
  ('66666666-6666-4666-8666-666666666666', 'approved', 'Field Operation Manager', 'approved', 'approved', 'approved', 'approved', 0);

INSERT INTO public.pre_fund_transactions VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'operational_cost_submissions', '22222222-2222-4222-8222-222222222222', 'payment', false, NULL, now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'operational_cost_submissions', '44444444-4444-4444-8444-444444444444', 'payment', true, NULL, now());

DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.revert_operational_cost_tier_atomically_rpc(
    ARRAY['22222222-2222-4222-8222-222222222222'::uuid], 'T4'
  );
  IF (v_result ->> 'success')::boolean IS NOT TRUE
     OR (v_result ->> 'reversed_payment_source_count')::int <> 1 THEN
    RAISE EXCEPTION 'active T4 payment was not reversed atomically: %', v_result;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.operational_cost_submissions
    WHERE id = '22222222-2222-4222-8222-222222222222'
      AND status = 'under_review' AND tier3_status = 'approved'
      AND tier4_status = 'pending' AND amount_paid_cents = 0
  ) OR NOT EXISTS (
    SELECT 1 FROM public.unlink_calls WHERE source_id = '22222222-2222-4222-8222-222222222222'
  ) THEN
    RAISE EXCEPTION 'T4 revert did not reset source only after payment reversal.';
  END IF;

  v_result := public.revert_operational_cost_tier_atomically_rpc(
    ARRAY['33333333-3333-4333-8333-333333333333'::uuid], 'T3'
  );
  IF (v_result ->> 'success')::boolean IS NOT TRUE
     OR (v_result ->> 'reversed_payment_source_count')::int <> 0 THEN
    RAISE EXCEPTION 'zero-payment T3 revert should succeed without an unlink: %', v_result;
  END IF;

  BEGIN
    PERFORM public.revert_operational_cost_tier_atomically_rpc(
      ARRAY['44444444-4444-4444-8444-444444444444'::uuid], 'T3'
    );
    RAISE EXCEPTION 'reconciled payment tier revert unexpectedly succeeded';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE 'Cannot revert T3: linked Pre-Fund payment%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.revert_operational_cost_tier_atomically_rpc(
      ARRAY['55555555-5555-4555-8555-555555555555'::uuid], 'T3'
    );
    RAISE EXCEPTION 'lower-tier rollback unexpectedly succeeded';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE 'Cannot revert T3: source % is not approved at that tier.' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.revert_operational_cost_tier_atomically_rpc(
      ARRAY['66666666-6666-4666-8666-666666666666'::uuid], 'T4'
    );
    RAISE EXCEPTION 'invalid four-tier workflow unexpectedly succeeded';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE 'Cannot revert T4: source % does not use a four-tier approval workflow.' THEN RAISE; END IF;
  END;
END;
$$;

INSERT INTO public.user_permission_overrides VALUES
  ('11111111-1111-4111-8111-111111111111', 'cost_submissions', 'revert_tier', true, NULL),
  ('11111111-1111-4111-8111-111111111111', 'cost_submissions', 'revert_tier', false, NULL);

DO $$
BEGIN
  BEGIN
    PERFORM public.revert_operational_cost_tier_atomically_rpc(
      ARRAY['33333333-3333-4333-8333-333333333333'::uuid], 'T3'
    );
    RAISE EXCEPTION 'explicit deny unexpectedly succeeded';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE 'Access denied: your tier-revert permission is explicitly blocked%' THEN RAISE; END IF;
  END;
END;
$$;
SQL

echo "Operational Cost tier-revert regression tests passed."
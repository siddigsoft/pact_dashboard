-- =============================================================================
-- Integration / regression test: execute_cycle_close_exception()
--                                + mmp_files hard-close gate
--
-- Migration under test: 20260819_cycle_close_inline_exception_execution.sql
--   (depends on 20260818_cycle_exception_actions.sql and
--    20260818b_field_payments_columns.sql)
--
-- Task #548 — Cycle Close: Inline Exception Execution
--
-- What this exercises
-- -------------------
--   1. All eight decisions end-to-end:
--        cancel, reduce, reassign, hold  (approved-only, no GL)
--        roll                            (paid-only, no GL)
--        return, writeoff, redirect      (paid-only, GL posting)
--   2. Successful-retry idempotency (same decision → same action_id, no 2nd GL).
--   3. Conflicting-retry rejection (different decision on an executed advance).
--   4. Role restrictions:
--        Finance    → may execute return / redirect, but NOT
--                     cancel/reduce/reassign/hold/roll/writeoff
--        Manager    → may execute all decisions (FOM)
--        Enumerator → unauthorized, every call rejected
--   5. Target scope guards:
--        reassign → target must be same enumerator (accepted_by)
--        roll/hold → target MMP must be same country
--   6. Direct cycle_exception_actions writes are blocked under authenticated RLS
--      (all mutation must flow through the SECURITY DEFINER RPC).
--   7. Hard close gate rejects a close while:
--        (a) an unexecuted action row exists, and
--        (b) an approved/paid advance sits on a not-covered site with no
--            executed action; and permits the close once all are executed.
--   8. GL semantics: Return / Write-Off / Redirect each produce EXACTLY ONE
--      balanced DR/CR journal call, with the expected account choices.
--
-- How to run
-- ----------
-- Paste this entire script into the Supabase SQL Editor and click Run.
-- The final line should read:
--   NOTICE: ✅  All cycle-close exception-execution tests passed.
-- Any failed assertion raises an EXCEPTION and halts, naming the scenario.
--
-- Safety
-- ------
-- • Runs inside a single transaction and ROLLBACKs at the end. No test data is
--   committed, and the transactional replacement of acct_bridge_post_journal
--   (the test double) is discarded on ROLLBACK — the REAL function is restored
--   automatically because CREATE OR REPLACE inside the transaction is undone.
-- • Runs as the Supabase service role (SQL Editor default), which can write to
--   auth.users / profiles and can CREATE OR REPLACE FUNCTION.
--
-- Why a test double for acct_bridge_post_journal
-- ----------------------------------------------
-- The real 9-arg overload requires a fully seeded accounting environment
-- (posting engine flag, funds, mapped accounts, balanced validations, etc.).
-- To keep this test self-contained and deterministic we transactionally
-- REPLACE only the 9-parameter overload
--   (text, uuid, text, date, text, text, jsonb, uuid, uuid)
-- with a double that:
--   • records source_table / source_id / event_type / lines into a temp table,
--   • inserts a minimal REAL acct_journal_entries row so the FK from
--     acct_gl_bridge_log.journal_entry_id (and the value stored in
--     cycle_exception_actions.gl_journal_entry_id) resolves, and
--   • returns that journal id.
-- The 8-arg overload and every other accounting function are left untouched.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Preflight: fail fast with a clear message if the schema this test
--    depends on is not present (migration not applied / drifted).
-- ---------------------------------------------------------------------------
DO $preflight$
DECLARE
  v_missing text := '';
  -- table.column pairs that MUST exist for the fixtures + RPC to work
  v_required_cols text[][] := ARRAY[
    ['cycle_exception_actions','executed'],
    ['cycle_exception_actions','execution_error'],
    ['cycle_exception_actions','return_method'],
    ['cycle_exception_actions','receipt_reference'],
    ['cycle_exception_actions','action_payload'],
    ['cycle_exception_actions','gl_posted'],
    ['cycle_exception_actions','gl_journal_entry_id'],
    ['cycle_exception_actions','recovery_date'],
    ['cycle_exception_actions','decision'],
    ['cycle_exception_actions','advance_id'],
    ['cycle_exception_actions','mmp_site_entry_id'],
    ['mmp_files','cycle_status'],
    ['mmp_files','status'],
    ['mmp_files','country_id'],
    ['mmp_site_entries','mmp_file_id'],
    ['mmp_site_entries','not_covered_flag'],
    ['mmp_site_entries','status'],
    ['mmp_site_entries','accepted_by'],
    ['mmp_site_entries','site_name'],
    ['mmp_site_entries','fee_paid_status'],
    ['mmp_site_entries','fee_paid_amount'],
    ['mmp_site_entries','fee_paid_at'],
    ['mmp_site_entries','fee_paid_by'],
    -- columns the real enumerator-fee trigger function references
    ['mmp_site_entries','enumerator_fee'],
    ['mmp_site_entries','transport_fee'],
    ['mmp_site_entries','fee_payment_method'],
    ['down_payment_requests','mmp_site_entry_id'],
    ['down_payment_requests','requested_amount'],
    ['down_payment_requests','total_paid_amount'],
    ['down_payment_requests','status'],
    ['down_payment_requests','metadata'],
    ['acct_accounts','code'],
    ['acct_accounts','is_postable'],
    ['acct_accounts','country_id'],
    ['acct_gl_bridge_log','source_table'],
    ['acct_gl_bridge_log','journal_entry_id'],
    ['acct_journal_entries','idempotency_key'],
    ['acct_journal_entries','period_id'],
    -- columns required by close_mmp_and_lock_incentives
    ['mmp_files','cycle_closed_at'],
    ['mmp_files','cycle_closed_by'],
    ['mmp_files','updated_at']
  ];
  r text[];
BEGIN
  FOREACH r SLICE 1 IN ARRAY v_required_cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name  = r[1]
        AND column_name = r[2]
    ) THEN
      v_missing := v_missing || format('  - column %I.%I is missing%s', r[1], r[2], E'\n');
    END IF;
  END LOOP;

  -- Required functions (by name; overloads validated separately below)
  IF to_regprocedure(
       'public.execute_cycle_close_exception('
       || 'uuid,uuid,uuid,text,numeric,text,uuid,uuid,text,text,date)'
     ) IS NULL THEN
    v_missing := v_missing
      || '  - function execute_cycle_close_exception(11 args) is missing' || E'\n';
  END IF;

  IF to_regprocedure(
       'public.acct_bridge_post_journal('
       || 'text,uuid,text,date,text,text,jsonb,uuid,uuid)'
     ) IS NULL THEN
    v_missing := v_missing
      || '  - function acct_bridge_post_journal(9 args) is missing' || E'\n';
  END IF;

  IF to_regprocedure('public.is_cycle_exception_executor(uuid)') IS NULL THEN
    v_missing := v_missing
      || '  - function is_cycle_exception_executor(uuid) is missing' || E'\n';
  END IF;
  IF to_regprocedure('public.is_cycle_exception_manager(uuid)') IS NULL THEN
    v_missing := v_missing
      || '  - function is_cycle_exception_manager(uuid) is missing' || E'\n';
  END IF;

  -- The real enumerator-fee trigger function the test attaches its trigger to.
  IF to_regprocedure('public.acct_trig_mmp_site_entries_fee_paid()') IS NULL THEN
    v_missing := v_missing
      || '  - function acct_trig_mmp_site_entries_fee_paid() is missing' || E'\n';
  END IF;

  -- The final-close RPC (Task #548 regression + 20260819b corrective migration).
  IF to_regprocedure('public.close_mmp_and_lock_incentives(uuid,text)') IS NULL THEN
    v_missing := v_missing
      || '  - function close_mmp_and_lock_incentives(uuid,text) is missing' || E'\n';
  END IF;

  IF to_regclass('public.trg_mmp_files_exception_close_gate') IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgname = 'trg_mmp_files_exception_close_gate'
     ) THEN
    v_missing := v_missing
      || '  - trigger trg_mmp_files_exception_close_gate on mmp_files is missing'
      || E'\n';
  END IF;

  IF v_missing <> '' THEN
    RAISE EXCEPTION
      'PREFLIGHT FAILED — required schema not present. Apply migrations '
      '20260818_close_mmp_and_lock_incentives, 20260819_cycle_close_inline_exception_execution '
      '(and their 20260818* deps), and 20260819b_cycle_close_finalizer_role_variants first.%s%s',
      E'\n', v_missing;
  END IF;

  RAISE NOTICE 'PREFLIGHT OK — required columns / functions / trigger present.';
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Assertion helpers (pg_temp — dropped automatically at session end)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.assert_eq(
  label TEXT, actual BIGINT, expected BIGINT
) RETURNS VOID AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL [%]: expected % but got %', label, expected, actual;
  END IF;
  RAISE NOTICE 'PASS [%]: % (expected %)', label, actual, expected;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.assert_txt(
  label TEXT, actual TEXT, expected TEXT
) RETURNS VOID AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL [%]: expected % but got %',
      label, coalesce(expected,'<null>'), coalesce(actual,'<null>');
  END IF;
  RAISE NOTICE 'PASS [%]: %', label, coalesce(actual,'<null>');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  label TEXT, cond BOOLEAN
) RETURNS VOID AS $$
BEGIN
  IF cond IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL [%]: expected TRUE but got %', label, coalesce(cond::text,'<null>');
  END IF;
  RAISE NOTICE 'PASS [%]', label;
END;
$$ LANGUAGE plpgsql;

-- Assert an execute_cycle_close_exception() result is ok=true
CREATE OR REPLACE FUNCTION pg_temp.assert_ok(
  label TEXT, res JSONB
) RETURNS VOID AS $$
BEGIN
  IF (res->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL [%]: expected ok=true but got error=%',
      label, coalesce(res->>'error','<none>');
  END IF;
  RAISE NOTICE 'PASS [%]: ok=true', label;
END;
$$ LANGUAGE plpgsql;

-- Assert an execute_cycle_close_exception() result is ok=false whose error
-- text contains the given fragment (case-insensitive).
CREATE OR REPLACE FUNCTION pg_temp.assert_err(
  label TEXT, res JSONB, needle TEXT
) RETURNS VOID AS $$
BEGIN
  IF (res->>'ok')::boolean IS TRUE THEN
    RAISE EXCEPTION 'FAIL [%]: expected ok=false but got ok=true (%)',
      label, res::text;
  END IF;
  IF position(lower(needle) IN lower(coalesce(res->>'error',''))) = 0 THEN
    RAISE EXCEPTION 'FAIL [%]: error did not contain "%". Actual: %',
      label, needle, coalesce(res->>'error','<none>');
  END IF;
  RAISE NOTICE 'PASS [%]: rejected with "%"', label, needle;
END;
$$ LANGUAGE plpgsql;

-- Given the source_id of a cycle_exception_actions row, assert its recorded GL
-- call is EXACTLY ONE balanced DR/CR pair, and return the two account codes as
-- 'DR:<acct>|CR:<acct>' for the caller to check the semantic choices.
CREATE OR REPLACE FUNCTION pg_temp.assert_single_balanced_gl(
  label TEXT, p_action_id UUID
) RETURNS TEXT AS $$
DECLARE
  v_calls      int;
  v_lines      jsonb;
  v_dr_count   int;
  v_cr_count   int;
  v_dr_amount  numeric;
  v_cr_amount  numeric;
  v_dr_acct    text;
  v_cr_acct    text;
BEGIN
  SELECT count(*) INTO v_calls
  FROM pg_temp.gl_double_calls
  WHERE source_table = 'cycle_exception_actions'
    AND source_id = p_action_id;

  IF v_calls <> 1 THEN
    RAISE EXCEPTION 'FAIL [%]: expected exactly 1 GL call but got %', label, v_calls;
  END IF;

  SELECT lines INTO v_lines
  FROM pg_temp.gl_double_calls
  WHERE source_table = 'cycle_exception_actions'
    AND source_id = p_action_id;

  IF jsonb_array_length(v_lines) <> 2 THEN
    RAISE EXCEPTION 'FAIL [%]: expected 2 GL lines but got %',
      label, jsonb_array_length(v_lines);
  END IF;

  SELECT
    count(*) FILTER (WHERE l->>'debit_credit' = 'DR'),
    count(*) FILTER (WHERE l->>'debit_credit' = 'CR'),
    coalesce(sum((l->>'amount')::numeric) FILTER (WHERE l->>'debit_credit' = 'DR'),0),
    coalesce(sum((l->>'amount')::numeric) FILTER (WHERE l->>'debit_credit' = 'CR'),0),
    max(l->>'account_code') FILTER (WHERE l->>'debit_credit' = 'DR'),
    max(l->>'account_code') FILTER (WHERE l->>'debit_credit' = 'CR')
  INTO v_dr_count, v_cr_count, v_dr_amount, v_cr_amount, v_dr_acct, v_cr_acct
  FROM jsonb_array_elements(v_lines) AS l;

  IF v_dr_count <> 1 OR v_cr_count <> 1 THEN
    RAISE EXCEPTION 'FAIL [%]: expected one DR and one CR line, got DR=% CR=%',
      label, v_dr_count, v_cr_count;
  END IF;

  IF v_dr_amount <> v_cr_amount OR v_dr_amount <= 0 THEN
    RAISE EXCEPTION 'FAIL [%]: unbalanced or non-positive journal (DR=% CR=%)',
      label, v_dr_amount, v_cr_amount;
  END IF;

  RAISE NOTICE 'PASS [%]: exactly 1 balanced journal, DR % / CR % amount %',
    label, v_dr_acct, v_cr_acct, v_dr_amount;

  RETURN 'DR:' || v_dr_acct || '|CR:' || v_cr_acct;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 2. Test-double: temp recording table + transactional replacement of the
--    9-parameter acct_bridge_post_journal overload.
--
--    The temp table lives in pg_temp; the CREATE OR REPLACE on the public
--    function is transactional and is rolled back at the end, restoring the
--    real function.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE gl_double_calls (
  id           bigserial PRIMARY KEY,
  source_table text        NOT NULL,
  source_id    uuid        NOT NULL,
  event_type   text        NOT NULL,
  posting_date date,
  lines        jsonb       NOT NULL,
  journal_id   uuid        NOT NULL,
  called_at    timestamptz NOT NULL DEFAULT now()
);

-- The double must produce a REAL acct_journal_entries row so that
-- acct_gl_bridge_log.journal_entry_id (FK) and cycle_exception_actions
-- resolve. It reuses the seeded fiscal period + a seeded profile.
CREATE OR REPLACE FUNCTION public.acct_bridge_post_journal(
  p_source_table   text,
  p_source_id      uuid,
  p_event_type     text,
  p_posting_date   date,
  p_description_en text,
  p_description_ar text,
  p_lines          jsonb,
  p_posted_by      uuid DEFAULT NULL,
  p_country_id     uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $double$
DECLARE
  v_entry_id uuid;
  v_idem     text;
BEGIN
  v_idem := p_source_table || '::' || p_source_id::text || '::' || p_event_type;

  -- Idempotency parity with the real function: one entry per idempotency key.
  SELECT id INTO v_entry_id
  FROM public.acct_journal_entries
  WHERE idempotency_key = v_idem;

  IF NOT FOUND THEN
    INSERT INTO public.acct_journal_entries (
      period_id, posting_date, description_en, description_ar,
      source_type, source_id, status, idempotency_key, created_by
    ) VALUES (
      'ce540000-feed-4000-8000-0000000000f1'::uuid,   -- seeded open period
      coalesce(p_posting_date, current_date),
      p_description_en, p_description_ar,
      p_source_table, p_source_id, 'posted', v_idem,
      'ce540000-0000-4000-8000-000000000001'::uuid     -- seeded manager profile
    )
    RETURNING id INTO v_entry_id;

    INSERT INTO pg_temp.gl_double_calls
      (source_table, source_id, event_type, posting_date, lines, journal_id)
    VALUES
      (p_source_table, p_source_id, p_event_type, p_posting_date, p_lines, v_entry_id);
  END IF;

  RETURN v_entry_id;
END;
$double$;

-- ---------------------------------------------------------------------------
-- 3. Deterministic fixtures
--    Prefix "ce54" (Task #548). All hex-valid.
--
--   Users / profiles
--     ce540000-0000-4000-8000-000000000001  Manager (FOM)     — authorized all
--     ce540000-0000-4000-8000-000000000002  Finance           — return/redirect
--     ce540000-0000-4000-8000-000000000003  Enumerator        — unauthorized
--
--   Accounting
--     ce540000-feed-4000-8000-0000000000f0  fiscal year
--     ce540000-feed-4000-8000-0000000000f1  fiscal period (open)
--     acct_accounts: 1510 advance, 5900 writeoff, 5200 enum-fee,
--                    1010 cash, 1020 bank   (all global country_id NULL)
--
--   MMP / sites / advances — one MMP per decision to keep advisory locks and
--   the close gate independent. Enumerator "accepted_by" text = manager id text
--   so the same-enumerator reassign check can pass on the happy path.
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (id, aud, email, encrypted_password, created_at, updated_at, role)
VALUES
  ('ce540000-0000-4000-8000-000000000001'::uuid, 'authenticated', 'ce_manager@test.internal',    '', now(), now(), 'authenticated'),
  ('ce540000-0000-4000-8000-000000000002'::uuid, 'authenticated', 'ce_finance@test.internal',    '', now(), now(), 'authenticated'),
  ('ce540000-0000-4000-8000-000000000003'::uuid, 'authenticated', 'ce_enumerator@test.internal', '', now(), now(), 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name, role)
VALUES
  ('ce540000-0000-4000-8000-000000000001'::uuid, 'ce_manager@test.internal',    'CE Manager (FOM)',  'fom'),
  ('ce540000-0000-4000-8000-000000000002'::uuid, 'ce_finance@test.internal',    'CE Finance',        'finance'),
  ('ce540000-0000-4000-8000-000000000003'::uuid, 'ce_enumerator@test.internal', 'CE Enumerator',     'enumerator')
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;

-- Deterministic country fixture. Required so mmp_files.country_id and the
-- country-scoped acct_accounts rows below satisfy the countries(id) FK on the
-- live schema (see supabase/coa_countries_migration.sql).
INSERT INTO public.countries (id, code, name_en, name_ar, currency_code, currency_symbol)
VALUES ('ce540000-c001-4000-8000-000000000c01'::uuid, 'CE54', 'CE Test Country', 'دولة اختبار', 'SDG', 'SDG')
ON CONFLICT (code) DO NOTHING;

-- Fiscal year + open period for the journal-entry FK produced by the double
INSERT INTO public.acct_fiscal_years (id, code, start_date, end_date, is_closed)
VALUES ('ce540000-feed-4000-8000-0000000000f0'::uuid, 'CE54-FY', date '2026-01-01', date '2026-12-31', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.acct_fiscal_periods (id, fiscal_year_id, period_no, start_date, end_date, status)
VALUES ('ce540000-feed-4000-8000-0000000000f1'::uuid,
        'ce540000-feed-4000-8000-0000000000f0'::uuid, 1,
        date '2026-01-01', date '2026-12-31', 'open')
ON CONFLICT (id) DO NOTHING;

-- Global (country_id NULL) postable GL accounts the RPC resolves by code.
INSERT INTO public.acct_accounts (id, code, name_en, name_ar, account_type, subtype, is_postable, country_id)
VALUES
  ('ce540000-acc0-4000-8000-000000001510'::uuid, '1510', 'Transport Advance', 'سلفة نقل', 'asset',     'current_asset',  true, NULL),
  ('ce540000-acc0-4000-8000-000000005900'::uuid, '5900', 'Advance Write-Off', 'شطب سلفة', 'expense',   'other_expense',  true, NULL),
  ('ce540000-acc0-4000-8000-000000005200'::uuid, '5200', 'Enumerator Fees',   'أتعاب',   'expense',   'program_expense',true, NULL),
  ('ce540000-acc0-4000-8000-000000001010'::uuid, '1010', 'Cash on Hand',      'نقدية',   'asset',     'current_asset',  true, NULL),
  ('ce540000-acc0-4000-8000-000000001020'::uuid, '1020', 'Bank',              'بنك',     'asset',     'current_asset',  true, NULL)
ON CONFLICT DO NOTHING;

-- Country-specific STANDARDIZED six-digit accounts for the CE Test Country.
-- These MUST win over both the legacy global 4-digit rows (country_id NULL) and
-- any global 6-digit rows because the resolver orders country-specific first,
-- then by array_position of the canonical code list. Only 120000 (bank/cash) and
-- 151000 (advance) are seeded here so the DR/CR resolution is unambiguous:
--   return (bank_transfer)  →  DR 120000 (country cash) / CR 151000 (country advance)
INSERT INTO public.acct_accounts (id, code, name_en, name_ar, account_type, subtype, is_postable, country_id)
VALUES
  ('ce540000-acc6-4000-8000-000000151000'::uuid, '151000', 'Transport Advance (std)', 'سلفة نقل', 'asset', 'current_asset', true, 'ce540000-c001-4000-8000-000000000c01'::uuid),
  ('ce540000-acc6-4000-8000-000000120000'::uuid, '120000', 'Cash & Bank (std)',       'نقدية وبنك', 'asset', 'current_asset', true, 'ce540000-c001-4000-8000-000000000c01'::uuid)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3b. MMP + site + advance fixture builder (as a pg_temp helper so the many
--     scenarios stay readable). Creates one open MMP, one not-covered source
--     site (accepted_by = enumerator text), and one advance in the requested
--     status. Country is left NULL so no countries fixture is required and the
--     global GL accounts (country_id NULL) still resolve.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.mk_case(
  p_mmp        uuid,
  p_site       uuid,
  p_advance    uuid,
  p_status     text,               -- advance status
  p_amount     numeric,
  p_paid       numeric,            -- total_paid_amount
  p_accepted_by text DEFAULT 'ce540000-0000-4000-8000-000000000001'
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.mmp_files (id, cycle_status, status, country_id)
  VALUES (p_mmp, 'open', 'active', NULL)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.mmp_site_entries
    (id, mmp_file_id, site_name, not_covered_flag, status, accepted_by, fee_paid_status)
  VALUES
    (p_site, p_mmp, 'CE Not-Covered Site', true, 'not_covered', p_accepted_by, 'unpaid')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.down_payment_requests
    (id, mmp_site_entry_id, site_name, requested_by,
     total_transportation_budget, requested_amount, payment_type,
     justification, status, total_paid_amount, metadata)
  VALUES
    (p_advance, p_site, 'CE Not-Covered Site',
     'ce540000-0000-4000-8000-000000000001'::uuid,
     p_amount, p_amount, 'full_advance',
     'fixture', p_status, p_paid, '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Helper to add a covered site (target for reassign) to an existing MMP.
CREATE OR REPLACE FUNCTION pg_temp.mk_covered_site(
  p_site uuid, p_mmp uuid, p_accepted_by text
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.mmp_site_entries
    (id, mmp_file_id, site_name, not_covered_flag, status, accepted_by, fee_paid_status)
  VALUES
    (p_site, p_mmp, 'CE Covered Site', false, 'covered', p_accepted_by, 'unpaid')
  ON CONFLICT (id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Convenience wrapper to set the JWT actor for the transaction.
CREATE OR REPLACE FUNCTION pg_temp.as_user(p_uid uuid) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text)::text, true);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 3c. Install the REAL enumerator-fee AFTER UPDATE trigger.
--
--     The 20260819 migration redefines the trigger FUNCTION
--     (acct_trig_mmp_site_entries_fee_paid, now using the UUID sentinel
--     comparison source_id = NEW.id) but does NOT (re)create the trigger
--     itself — trg_mmp_site_fee_gl_post is owned by 20260818d. To exercise
--     the real Redirect interplay (sentinel row → trigger early-return → no
--     duplicate fee journal) the test attaches that trigger to the real
--     function idempotently. This is a harmless no-op on live Supabase where
--     the trigger already exists, and installs it on a fresh ephemeral DB.
--
--     Done inside the test transaction, so it is rolled back with everything
--     else and never persists.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_mmp_site_fee_gl_post ON public.mmp_site_entries;
CREATE TRIGGER trg_mmp_site_fee_gl_post
  AFTER UPDATE ON public.mmp_site_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.acct_trig_mmp_site_entries_fee_paid();

-- ---------------------------------------------------------------------------
-- 4. Main test body
-- ---------------------------------------------------------------------------
DO $test$
DECLARE
  MGR  uuid := 'ce540000-0000-4000-8000-000000000001';
  FIN  uuid := 'ce540000-0000-4000-8000-000000000002';
  ENU  uuid := 'ce540000-0000-4000-8000-000000000003';

  res       jsonb;
  res2      jsonb;
  v_action  uuid;
  v_count   bigint;
  v_status  text;
  v_gl      text;

  -- deterministic ids, one triple per scenario
  -- cancel
  m1 uuid := 'ce54c001-0000-4000-8000-000000000001';
  s1 uuid := 'ce54c001-0000-4000-8000-0000000000a1';
  a1 uuid := 'ce54c001-0000-4000-8000-0000000000b1';
  -- reduce
  m2 uuid := 'ce54c002-0000-4000-8000-000000000002';
  s2 uuid := 'ce54c002-0000-4000-8000-0000000000a2';
  a2 uuid := 'ce54c002-0000-4000-8000-0000000000b2';
  -- reassign
  m3 uuid := 'ce54c003-0000-4000-8000-000000000003';
  s3 uuid := 'ce54c003-0000-4000-8000-0000000000a3';
  a3 uuid := 'ce54c003-0000-4000-8000-0000000000b3';
  t3 uuid := 'ce54c003-0000-4000-8000-0000000000c3';  -- covered target (same enum)
  x3 uuid := 'ce54c003-0000-4000-8000-0000000000d3';  -- covered target (diff enum)
  -- hold  (needs a same-country target MMP)
  m4  uuid := 'ce54c004-0000-4000-8000-000000000004';
  s4  uuid := 'ce54c004-0000-4000-8000-0000000000a4';
  a4  uuid := 'ce54c004-0000-4000-8000-0000000000b4';
  m4t uuid := 'ce54c004-0000-4000-8000-0000000000e4'; -- target MMP (same country=NULL)
  s4t uuid := 'ce54c004-0000-4000-8000-0000000000f4'; -- covered target site (same enum)
  -- roll (paid) + cross-country target
  m5  uuid := 'ce54c005-0000-4000-8000-000000000005';
  s5  uuid := 'ce54c005-0000-4000-8000-0000000000a5';
  a5  uuid := 'ce54c005-0000-4000-8000-0000000000b5';
  m5t uuid := 'ce54c005-0000-4000-8000-0000000000e5'; -- target MMP same country
  s5t uuid := 'ce54c005-0000-4000-8000-0000000000f5';
  -- return (paid, GL)
  m6 uuid := 'ce54c006-0000-4000-8000-000000000006';
  s6 uuid := 'ce54c006-0000-4000-8000-0000000000a6';
  a6 uuid := 'ce54c006-0000-4000-8000-0000000000b6';
  -- writeoff (paid, GL)
  m7 uuid := 'ce54c007-0000-4000-8000-000000000007';
  s7 uuid := 'ce54c007-0000-4000-8000-0000000000a7';
  a7 uuid := 'ce54c007-0000-4000-8000-0000000000b7';
  -- redirect (paid, GL)
  m8 uuid := 'ce54c008-0000-4000-8000-000000000008';
  s8 uuid := 'ce54c008-0000-4000-8000-0000000000a8';
  a8 uuid := 'ce54c008-0000-4000-8000-0000000000b8';
  -- role restriction MMP (finance vs manager vs enumerator)
  m9 uuid := 'ce54c009-0000-4000-8000-000000000009';
  s9 uuid := 'ce54c009-0000-4000-8000-0000000000a9';
  a9 uuid := 'ce54c009-0000-4000-8000-0000000000b9';
  -- close-gate MMP
  mg  uuid := 'ce54c00a-0000-4000-8000-00000000000a';
  sg  uuid := 'ce54c00a-0000-4000-8000-0000000000aa';
  ag  uuid := 'ce54c00a-0000-4000-8000-0000000000ba';
  -- close-gate edge: ONE not-covered site with TWO active eligible advances
  mm  uuid := 'ce54c00e-0000-4000-8000-00000000000e';
  sm  uuid := 'ce54c00e-0000-4000-8000-0000000000ae';
  am1 uuid := 'ce54c00e-0000-4000-8000-0000000000e1'; -- advance #1
  am2 uuid := 'ce54c00e-0000-4000-8000-0000000000e2'; -- advance #2
  -- close-gate edge: UNASSIGNED not-covered site (accepted_by NULL) + advance
  mu  uuid := 'ce54c00f-0000-4000-8000-00000000000f';
  su  uuid := 'ce54c00f-0000-4000-8000-0000000000af';
  au  uuid := 'ce54c00f-0000-4000-8000-0000000000bf';
BEGIN
  -- =========================================================================
  -- SECTION A — the eight decisions, happy paths, as Manager
  -- =========================================================================
  PERFORM pg_temp.as_user(MGR);

  -- ── A1. cancel (approved) ────────────────────────────────────────────────
  PERFORM pg_temp.mk_case(m1, s1, a1, 'approved', 1000, 0);
  res := public.execute_cycle_close_exception(
    m1, s1, a1, 'cancel', NULL, 'not needed anymore');
  PERFORM pg_temp.assert_ok('cancel executes', res);
  SELECT status INTO v_status FROM public.down_payment_requests WHERE id = a1;
  PERFORM pg_temp.assert_txt('cancel → advance cancelled', v_status, 'cancelled');

  -- ── A2. reduce (approved) ────────────────────────────────────────────────
  PERFORM pg_temp.mk_case(m2, s2, a2, 'approved', 1000, 0);
  res := public.execute_cycle_close_exception(
    m2, s2, a2, 'reduce', 400, 'reduce scope');
  PERFORM pg_temp.assert_ok('reduce executes', res);
  SELECT requested_amount INTO v_count FROM public.down_payment_requests WHERE id = a2;
  PERFORM pg_temp.assert_eq('reduce → requested_amount lowered', v_count, 400);

  -- ── A3. reassign (approved, same enumerator, same MMP) ───────────────────
  PERFORM pg_temp.mk_case(m3, s3, a3, 'approved', 1000, 0);
  PERFORM pg_temp.mk_covered_site(t3, m3, MGR::text);        -- same enumerator
  PERFORM pg_temp.mk_covered_site(x3, m3, ENU::text);        -- different enumerator
  -- same-enumerator scope: reassigning to a different enumerator's site fails
  res := public.execute_cycle_close_exception(
    m3, s3, a3, 'reassign', NULL, NULL, NULL, x3);
  PERFORM pg_temp.assert_err('reassign to different enumerator rejected', res, 'same enumerator');
  -- happy path: same enumerator target
  res := public.execute_cycle_close_exception(
    m3, s3, a3, 'reassign', NULL, NULL, NULL, t3);
  PERFORM pg_temp.assert_ok('reassign executes', res);
  SELECT mmp_site_entry_id::text INTO v_status FROM public.down_payment_requests WHERE id = a3;
  PERFORM pg_temp.assert_txt('reassign → advance moved to target site', v_status, t3::text);

  -- ── A4. hold (approved, target MMP required, same country) ───────────────
  PERFORM pg_temp.mk_case(m4, s4, a4, 'approved', 1000, 0);
  INSERT INTO public.mmp_files (id, cycle_status, status, country_id)
  VALUES (m4t, 'open', 'active', NULL) ON CONFLICT (id) DO NOTHING;
  PERFORM pg_temp.mk_covered_site(s4t, m4t, MGR::text);
  res := public.execute_cycle_close_exception(
    m4, s4, a4, 'hold', NULL, 'defer to next cycle', m4t, s4t);
  PERFORM pg_temp.assert_ok('hold executes', res);
  SELECT rollover_mmp_id::text INTO v_status
  FROM public.cycle_exception_actions WHERE advance_id = a4;
  PERFORM pg_temp.assert_txt('hold → rollover MMP recorded', v_status, m4t::text);

  -- ── A5. roll (paid, no GL, target MMP) ───────────────────────────────────
  PERFORM pg_temp.mk_case(m5, s5, a5, 'paid', 1000, 1000);
  INSERT INTO public.mmp_files (id, cycle_status, status, country_id)
  VALUES (m5t, 'open', 'active', NULL) ON CONFLICT (id) DO NOTHING;
  PERFORM pg_temp.mk_covered_site(s5t, m5t, MGR::text);
  res := public.execute_cycle_close_exception(
    m5, s5, a5, 'roll', NULL, 'roll to next cycle', m5t, s5t);
  PERFORM pg_temp.assert_ok('roll executes', res);
  PERFORM pg_temp.assert_txt('roll → no GL journal',
    coalesce(res->>'journal_entry_id','<null>'), '<null>');

  -- ── A6. return (paid, GL) ────────────────────────────────────────────────
  PERFORM pg_temp.mk_case(m6, s6, a6, 'paid', 1000, 1000);
  res := public.execute_cycle_close_exception(
    m6, s6, a6, 'return', 1000, 'cash returned',
    NULL, NULL, 'RCPT-001', 'cash', current_date);
  PERFORM pg_temp.assert_ok('return executes', res);
  SELECT id INTO v_action FROM public.cycle_exception_actions WHERE advance_id = a6;
  v_gl := pg_temp.assert_single_balanced_gl('return GL', v_action);
  -- Return: DR cash (1010 for cash method), CR advance (1510)
  PERFORM pg_temp.assert_txt('return GL accounts (DR cash / CR advance)', v_gl, 'DR:1010|CR:1510');

  -- ── A7. writeoff (paid, GL) ──────────────────────────────────────────────
  PERFORM pg_temp.mk_case(m7, s7, a7, 'paid', 1000, 1000);
  res := public.execute_cycle_close_exception(
    m7, s7, a7, 'writeoff', 1000, 'unrecoverable');
  PERFORM pg_temp.assert_ok('writeoff executes', res);
  SELECT id INTO v_action FROM public.cycle_exception_actions WHERE advance_id = a7;
  v_gl := pg_temp.assert_single_balanced_gl('writeoff GL', v_action);
  -- Write-Off: DR write-off expense (5900), CR advance (1510)
  PERFORM pg_temp.assert_txt('writeoff GL accounts (DR write-off / CR advance)', v_gl, 'DR:5900|CR:1510');
  SELECT status INTO v_status FROM public.down_payment_requests WHERE id = a7;
  PERFORM pg_temp.assert_txt('writeoff → advance cancelled', v_status, 'cancelled');

  -- ── A8. redirect (paid, GL, reclassify to enumerator fee) ────────────────
  PERFORM pg_temp.mk_case(m8, s8, a8, 'paid', 1000, 1000);
  res := public.execute_cycle_close_exception(
    m8, s8, a8, 'redirect', 1000, 'redirect to fee');
  PERFORM pg_temp.assert_ok('redirect executes', res);
  SELECT id INTO v_action FROM public.cycle_exception_actions WHERE advance_id = a8;
  v_gl := pg_temp.assert_single_balanced_gl('redirect GL', v_action);
  -- Redirect: DR enumerator fee (5200), CR advance (1510)
  PERFORM pg_temp.assert_txt('redirect GL accounts (DR enum-fee / CR advance)', v_gl, 'DR:5200|CR:1510');
  -- (a) the fee-status update completed (the AFTER UPDATE trigger fired)
  SELECT fee_paid_status INTO v_status FROM public.mmp_site_entries WHERE id = s8;
  PERFORM pg_temp.assert_txt('redirect → site fee marked paid', v_status, 'paid');

  -- (b) the trigger saw the sentinel: the RPC pre-inserted a 'success' row for
  --     (mmp_site_entries, s8, enumerator_fee_paid) BEFORE flipping the status,
  --     so the trigger's "already posted" guard finds it and early-returns.
  SELECT count(*) INTO v_count
  FROM public.acct_gl_bridge_log
  WHERE source_table = 'mmp_site_entries'
    AND source_id = s8
    AND event_type = 'enumerator_fee_paid'
    AND status = 'success';
  PERFORM pg_temp.assert_eq('redirect → sentinel fee-paid bridge row present', v_count, 1);

  -- (c) the trigger posted NOTHING: zero acct_bridge_post_journal (test-double)
  --     calls for source_table=mmp_site_entries / event_type=enumerator_fee_paid.
  --     A duplicate fee journal here would mean the sentinel guard was skipped.
  SELECT count(*) INTO v_count
  FROM pg_temp.gl_double_calls
  WHERE source_table = 'mmp_site_entries'
    AND event_type = 'enumerator_fee_paid';
  PERFORM pg_temp.assert_eq('redirect → trigger posted NO duplicate fee journal', v_count, 0);

  -- (d) the ONLY bridge call for this action is the cycle_exception_actions
  --     reclassification journal (recorded by the double for source s8's action).
  SELECT count(*) INTO v_count
  FROM pg_temp.gl_double_calls
  WHERE source_table = 'cycle_exception_actions'
    AND source_id = v_action
    AND event_type = 'exception_redirect_to_fees';
  PERFORM pg_temp.assert_eq('redirect → exactly one reclassification bridge call', v_count, 1);

  -- =========================================================================
  -- SECTION B — idempotency (successful retry) and conflicting retry
  -- =========================================================================

  -- ── B1. successful retry: same decision returns same action, no 2nd GL ───
  SELECT count(*) INTO v_count
  FROM pg_temp.gl_double_calls
  WHERE source_id = (SELECT id FROM public.cycle_exception_actions WHERE advance_id = a7);
  PERFORM pg_temp.assert_eq('writeoff pre-retry GL call count', v_count, 1);

  res  := public.execute_cycle_close_exception(m7, s7, a7, 'writeoff', 1000, 'unrecoverable');
  PERFORM pg_temp.assert_ok('writeoff retry ok (idempotent)', res);
  PERFORM pg_temp.assert_txt('writeoff retry message',
    res->>'message', 'Already executed (idempotent)');

  SELECT count(*) INTO v_count
  FROM pg_temp.gl_double_calls
  WHERE source_id = (SELECT id FROM public.cycle_exception_actions WHERE advance_id = a7);
  PERFORM pg_temp.assert_eq('writeoff retry did NOT post a second GL', v_count, 1);

  -- ── B2. conflicting retry: different decision on executed advance rejected ─
  res := public.execute_cycle_close_exception(m7, s7, a7, 'return', 1000, 'x',
    NULL, NULL, 'RCPT-X', 'cash', current_date);
  PERFORM pg_temp.assert_err('conflicting retry rejected', res, 'Conflicting executed action');

  -- =========================================================================
  -- SECTION C — role restrictions (Finance vs Manager vs unauthorized)
  -- =========================================================================
  -- Fresh advance for each role probe (approved for the operational-decision
  -- probe, paid for the finance-allowed probe).

  -- ── C1. unauthorized (enumerator) is rejected on any decision ────────────
  PERFORM pg_temp.mk_case(m9, s9, a9, 'paid', 1000, 1000);
  PERFORM pg_temp.as_user(ENU);
  res := public.execute_cycle_close_exception(m9, s9, a9, 'return', 1000, 'x',
    NULL, NULL, 'RCPT-Y', 'cash', current_date);
  PERFORM pg_temp.assert_err('enumerator (unauthorized) rejected', res, 'Access denied');

  -- ── C2. Finance MAY execute return (paid, GL) ────────────────────────────
  PERFORM pg_temp.as_user(FIN);
  res := public.execute_cycle_close_exception(m9, s9, a9, 'return', 1000, 'finance returns',
    NULL, NULL, 'RCPT-F', 'bank_transfer', current_date);
  PERFORM pg_temp.assert_ok('finance may execute return', res);
  SELECT id INTO v_action FROM public.cycle_exception_actions WHERE advance_id = a9;
  v_gl := pg_temp.assert_single_balanced_gl('finance return GL', v_action);
  -- bank_transfer → DR bank (1020) / CR advance (1510)
  PERFORM pg_temp.assert_txt('finance return uses bank account for bank_transfer', v_gl, 'DR:1020|CR:1510');

  -- ── C3. Finance may NOT execute a manager-only decision (writeoff) ────────
  --        Use a fresh paid advance so classification passes but RBAC blocks.
  PERFORM pg_temp.mk_case(
    'ce54c00b-0000-4000-8000-00000000000b'::uuid,
    'ce54c00b-0000-4000-8000-0000000000ab'::uuid,
    'ce54c00b-0000-4000-8000-0000000000bb'::uuid,
    'paid', 1000, 1000);
  res := public.execute_cycle_close_exception(
    'ce54c00b-0000-4000-8000-00000000000b'::uuid,
    'ce54c00b-0000-4000-8000-0000000000ab'::uuid,
    'ce54c00b-0000-4000-8000-0000000000bb'::uuid,
    'writeoff', 1000, 'finance tries writeoff');
  PERFORM pg_temp.assert_err('finance cannot execute writeoff', res,
    'requires FOM / Admin / Super Admin');

  -- =========================================================================
  -- SECTION D — cross-country target scope (roll target must be same country)
  -- =========================================================================
  -- Build a paid source + a target MMP with a DIFFERENT country_id. The base
  -- fixture leaves the source MMP country_id NULL; the target MMP is assigned
  -- the deterministic CE54 country (a valid countries row, so the FK holds on
  -- the live schema). NULL IS DISTINCT FROM CE54 → the same-country guard fires.
  PERFORM pg_temp.as_user(MGR);
  PERFORM pg_temp.mk_case(
    'ce54c00c-0000-4000-8000-00000000000c'::uuid,
    'ce54c00c-0000-4000-8000-0000000000ac'::uuid,
    'ce54c00c-0000-4000-8000-0000000000bc'::uuid,
    'paid', 1000, 1000);
  INSERT INTO public.mmp_files (id, cycle_status, status, country_id)
  VALUES ('ce54c00c-0000-4000-8000-0000000000ec'::uuid, 'open', 'active',
          'ce540000-c001-4000-8000-000000000c01'::uuid)   -- CE54 country (valid FK)
  ON CONFLICT (id) DO NOTHING;
  PERFORM pg_temp.mk_covered_site(
    'ce54c00c-0000-4000-8000-0000000000fc'::uuid,
    'ce54c00c-0000-4000-8000-0000000000ec'::uuid, MGR::text);
  res := public.execute_cycle_close_exception(
    'ce54c00c-0000-4000-8000-00000000000c'::uuid,
    'ce54c00c-0000-4000-8000-0000000000ac'::uuid,
    'ce54c00c-0000-4000-8000-0000000000bc'::uuid,
    'roll', NULL, 'roll cross-country',
    'ce54c00c-0000-4000-8000-0000000000ec'::uuid,
    'ce54c00c-0000-4000-8000-0000000000fc'::uuid);
  PERFORM pg_temp.assert_err('roll to different country rejected', res, 'same country');

  -- =========================================================================
  -- SECTION E — country-aware account resolution (6-digit std COA)
  -- =========================================================================
  -- Regression for the resolver ordering:
  --   ORDER BY (country_id = source_country) first, then array_position of the
  --   canonical code list. With BOTH legacy global 4-digit accounts (1510/1200/
  --   1010/1020, country_id NULL) AND country-specific standardized 6-digit
  --   accounts (151000 advance, 120000 cash) present, a Return posted for a
  --   source MMP assigned to that country MUST resolve the COUNTRY-SPECIFIC
  --   six-digit rows, NOT the global 4-digit rows:
  --       DR 120000 (country cash/bank)  /  CR 151000 (country advance)
  -- This simultaneously covers the canonical six-digit fallback and the
  -- country-before-global ordering, and asserts exactly one balanced posting.
  PERFORM pg_temp.as_user(MGR);

  -- Pre-insert the source MMP with the CE54 country so mk_case (ON CONFLICT id
  -- DO NOTHING) keeps this country assignment.
  INSERT INTO public.mmp_files (id, cycle_status, status, country_id)
  VALUES ('ce54c00d-0000-4000-8000-00000000000d'::uuid, 'open', 'active',
          'ce540000-c001-4000-8000-000000000c01'::uuid)
  ON CONFLICT (id) DO NOTHING;

  PERFORM pg_temp.mk_case(
    'ce54c00d-0000-4000-8000-00000000000d'::uuid,   -- MMP (country CE54)
    'ce54c00d-0000-4000-8000-0000000000ad'::uuid,   -- site
    'ce54c00d-0000-4000-8000-0000000000bd'::uuid,   -- advance
    'paid', 1000, 1000);

  res := public.execute_cycle_close_exception(
    'ce54c00d-0000-4000-8000-00000000000d'::uuid,
    'ce54c00d-0000-4000-8000-0000000000ad'::uuid,
    'ce54c00d-0000-4000-8000-0000000000bd'::uuid,
    'return', 1000, 'country-scoped return',
    NULL, NULL, 'RCPT-CTRY', 'bank_transfer', current_date);
  PERFORM pg_temp.assert_ok('country-scoped return executes', res);
  SELECT id INTO v_action
  FROM public.cycle_exception_actions WHERE advance_id = 'ce54c00d-0000-4000-8000-0000000000bd'::uuid;
  v_gl := pg_temp.assert_single_balanced_gl('country-scoped return GL', v_action);
  PERFORM pg_temp.assert_txt(
    'resolver prioritizes country-specific 6-digit accounts (DR 120000 / CR 151000)',
    v_gl, 'DR:120000|CR:151000');

  -- =========================================================================
  -- SECTION F — hard close gate
  -- =========================================================================
  -- Build a fresh MMP with a paid advance on a not-covered site. Closing it
  -- should be blocked twice, then allowed after the exception is executed.
  PERFORM pg_temp.mk_case(mg, sg, ag, 'paid', 1000, 1000);

  -- Gate B first: no action row at all → unresolved-advances gate fires.
  BEGIN
    UPDATE public.mmp_files SET cycle_status = 'closed' WHERE id = mg;
    RAISE EXCEPTION 'GATE-B-NOT-RAISED';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM = 'GATE-B-NOT-RAISED' THEN
        RAISE EXCEPTION 'FAIL [close gate B]: close succeeded with an unresolved advance';
      END IF;
      IF position('CYCLE_CLOSE_GATE' IN SQLERRM) = 0 THEN
        RAISE EXCEPTION 'FAIL [close gate B]: unexpected error: %', SQLERRM;
      END IF;
      RAISE NOTICE 'PASS [close gate B]: blocked (no executed action for advance)';
  END;

  -- Now create an UNEXECUTED action row directly via the RPC failing partway is
  -- hard to force; instead insert one through a manager path that leaves it
  -- unexecuted by using an invalid-for-execution state is complex. Simpler:
  -- exercise Gate A by inserting an unexecuted row via the RPC-owned table using
  -- service role (allowed — RLS is not enforced for the service role), which is
  -- exactly the "pending action" state the gate must catch.
  INSERT INTO public.cycle_exception_actions
    (mmp_file_id, mmp_site_entry_id, advance_id, decision, advance_amount, executed)
  VALUES (mg, sg, ag, 'roll', 1000, false);

  BEGIN
    UPDATE public.mmp_files SET cycle_status = 'closed' WHERE id = mg;
    RAISE EXCEPTION 'GATE-A-NOT-RAISED';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM = 'GATE-A-NOT-RAISED' THEN
        RAISE EXCEPTION 'FAIL [close gate A]: close succeeded with an unexecuted action';
      END IF;
      IF position('CYCLE_CLOSE_GATE' IN SQLERRM) = 0 THEN
        RAISE EXCEPTION 'FAIL [close gate A]: unexpected error: %', SQLERRM;
      END IF;
      RAISE NOTICE 'PASS [close gate A]: blocked (unexecuted action present)';
  END;

  -- Resolve: remove the manual pending row and execute a real writeoff so the
  -- advance is both resolved (executed action) and the gate is satisfied.
  DELETE FROM public.cycle_exception_actions
  WHERE mmp_file_id = mg AND executed = false;

  PERFORM pg_temp.as_user(MGR);
  res := public.execute_cycle_close_exception(mg, sg, ag, 'writeoff', 1000, 'resolve for close');
  PERFORM pg_temp.assert_ok('close-gate advance resolved via writeoff', res);

  -- Now the close must succeed.
  UPDATE public.mmp_files SET cycle_status = 'closed' WHERE id = mg;
  SELECT count(*) INTO v_count
  FROM public.mmp_files WHERE id = mg AND cycle_status = 'closed';
  PERFORM pg_temp.assert_eq('close succeeds once all actions executed', v_count, 1);

  -- ── F-edge-1. ONE not-covered site with TWO active eligible advances ───────
  --   Gate B keys on the EXACT advance_id (dpr.id), so BOTH advances on the
  --   same not-covered site must each get their own executed exception action.
  --   Resolving only one leaves the second unresolved → close stays blocked;
  --   only after BOTH are executed may the cycle close.
  PERFORM pg_temp.as_user(MGR);
  -- mk_case builds the MMP + not-covered site + advance #1 (approved).
  PERFORM pg_temp.mk_case(mm, sm, am1, 'approved', 1000, 0);
  -- Add a SECOND active eligible advance on the SAME site.
  INSERT INTO public.down_payment_requests
    (id, mmp_site_entry_id, site_name, requested_by,
     total_transportation_budget, requested_amount, payment_type,
     justification, status, total_paid_amount, metadata)
  VALUES
    (am2, sm, 'CE Not-Covered Site',
     'ce540000-0000-4000-8000-000000000001'::uuid,
     500, 500, 'full_advance', 'fixture #2', 'approved', 0, '{}'::jsonb);

  -- Sanity: both advances are gate-eligible and currently unresolved.
  SELECT count(*) INTO v_count
  FROM public.down_payment_requests
  WHERE mmp_site_entry_id = sm AND status IN ('approved','paid','fully_paid','partially_paid');
  PERFORM pg_temp.assert_eq('two-advance edge: both advances eligible', v_count, 2);

  -- Execute exactly ONE action against advance #1.
  res := public.execute_cycle_close_exception(mm, sm, am1, 'cancel', NULL, 'resolve #1');
  PERFORM pg_temp.assert_ok('two-advance edge: first action executes (advance #1)', res);

  -- Close must STILL be blocked — advance #2 remains unresolved.
  BEGIN
    UPDATE public.mmp_files SET cycle_status = 'closed' WHERE id = mm;
    RAISE EXCEPTION 'TWOADV-GATE-NOT-RAISED';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM = 'TWOADV-GATE-NOT-RAISED' THEN
        RAISE EXCEPTION 'FAIL [two-advance edge: gate after one]: close succeeded with a second unresolved advance';
      END IF;
      IF position('CYCLE_CLOSE_GATE' IN SQLERRM) = 0 THEN
        RAISE EXCEPTION 'FAIL [two-advance edge: gate after one]: unexpected error: %', SQLERRM;
      END IF;
      RAISE NOTICE 'PASS [two-advance edge: still blocked after resolving only one advance]: %', 'CYCLE_CLOSE_GATE fired';
  END;

  -- Execute the action against advance #2 (the exact remaining advance_id).
  res := public.execute_cycle_close_exception(mm, sm, am2, 'reduce', 200, 'resolve #2');
  PERFORM pg_temp.assert_ok('two-advance edge: second action executes (advance #2)', res);

  -- Confirm each advance has its OWN executed action (one per exact advance).
  SELECT count(*) INTO v_count
  FROM public.cycle_exception_actions
  WHERE mmp_file_id = mm AND executed = true AND advance_id IN (am1, am2);
  PERFORM pg_temp.assert_eq('two-advance edge: one executed action per exact advance', v_count, 2);

  -- Now the close must succeed.
  UPDATE public.mmp_files SET cycle_status = 'closed' WHERE id = mm;
  SELECT count(*) INTO v_count FROM public.mmp_files WHERE id = mm AND cycle_status = 'closed';
  PERFORM pg_temp.assert_eq('two-advance edge: close succeeds after BOTH advances resolved', v_count, 1);

  -- ── F-edge-2. UNASSIGNED not-covered site (accepted_by NULL) + advance ─────
  --   A not-covered site with no enumerator (accepted_by NULL) still carries a
  --   gate-eligible approved advance. Transfer decisions (reassign/roll) are
  --   impossible without an enumerator, but a non-transfer decision (cancel /
  --   reduce) must still resolve it, and the close gate must then allow closure.
  PERFORM pg_temp.as_user(MGR);
  -- Build MMP + not-covered site with accepted_by NULL + approved advance.
  PERFORM pg_temp.mk_case(mu, su, au, 'approved', 1000, 0, NULL);

  -- Precondition: the site is genuinely unassigned.
  SELECT accepted_by INTO v_status FROM public.mmp_site_entries WHERE id = su;
  PERFORM pg_temp.assert_true('unassigned edge: site accepted_by is NULL', v_status IS NULL);

  -- Close is blocked while the advance is unresolved.
  BEGIN
    UPDATE public.mmp_files SET cycle_status = 'closed' WHERE id = mu;
    RAISE EXCEPTION 'UNASSIGNED-GATE-NOT-RAISED';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM = 'UNASSIGNED-GATE-NOT-RAISED' THEN
        RAISE EXCEPTION 'FAIL [unassigned edge: gate]: close succeeded with an unresolved advance';
      END IF;
      IF position('CYCLE_CLOSE_GATE' IN SQLERRM) = 0 THEN
        RAISE EXCEPTION 'FAIL [unassigned edge: gate]: unexpected error: %', SQLERRM;
      END IF;
      RAISE NOTICE 'PASS [unassigned edge: blocked before resolution]: %', 'CYCLE_CLOSE_GATE fired';
  END;

  -- Resolve via a valid non-transfer decision (cancel) — no enumerator needed.
  res := public.execute_cycle_close_exception(mu, su, au, 'cancel', NULL, 'unassigned not-covered — cancel');
  PERFORM pg_temp.assert_ok('unassigned edge: non-transfer decision (cancel) executes', res);
  SELECT status INTO v_status FROM public.down_payment_requests WHERE id = au;
  PERFORM pg_temp.assert_txt('unassigned edge: advance cancelled', v_status, 'cancelled');

  -- The close gate must now allow closure.
  UPDATE public.mmp_files SET cycle_status = 'closed' WHERE id = mu;
  SELECT count(*) INTO v_count FROM public.mmp_files WHERE id = mu AND cycle_status = 'closed';
  PERFORM pg_temp.assert_eq('unassigned edge: close succeeds after execution', v_count, 1);

  RAISE NOTICE '✅  All in-transaction RPC / gate / GL assertions passed.';
END
$test$;

-- ---------------------------------------------------------------------------
-- 5. Direct-write protection under authenticated RLS
--    The permissive ALL policy was dropped; only SELECT policies remain, so a
--    non-service (authenticated) caller must not be able to INSERT or UPDATE
--    cycle_exception_actions directly. This runs OUTSIDE the DO block because
--    it needs SET ROLE authenticated (the service role bypasses RLS).
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', 'ce540000-0000-4000-8000-000000000001')::text, true);
END $$;

-- Direct INSERT as authenticated manager must be denied (no INSERT policy).
DO $$
DECLARE v_ok boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.cycle_exception_actions
      (mmp_file_id, decision, advance_amount, executed)
    VALUES ('ce54c001-0000-4000-8000-000000000001'::uuid, 'cancel', 1, true);
    v_ok := true;   -- should not reach here
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_ok := false;
  END;
  RESET ROLE;
  IF v_ok THEN
    RAISE EXCEPTION 'FAIL [RLS direct INSERT]: authenticated caller inserted directly';
  END IF;
  RAISE NOTICE 'PASS [RLS direct INSERT]: authenticated direct insert blocked';
END $$;

-- Direct UPDATE (forging executed=true) as authenticated must affect 0 rows
-- (no UPDATE policy → USING evaluates to no visible rows for write).
DO $$
DECLARE v_rows int;
BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.cycle_exception_actions
      SET executed = true
    WHERE advance_id = 'ce54c001-0000-4000-8000-0000000000b1'::uuid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_rows := 0;
  END;
  RESET ROLE;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL [RLS direct UPDATE]: authenticated caller updated % row(s)', v_rows;
  END IF;
  RAISE NOTICE 'PASS [RLS direct UPDATE]: authenticated direct update blocked (0 rows)';
END $$;

-- ---------------------------------------------------------------------------
-- 6. Regression: close_mmp_and_lock_incentives role-variant authorization
--    (20260819b_cycle_close_finalizer_role_variants corrective migration)
--
--    The original 20260818_close_mmp_and_lock_incentives used a hard-coded IN
--    list that included 'Super Admin' (two words, mixed case) but omitted
--    'Super Administrator' — the full phrase shown in the UI and stored in
--    some profiles.role values.  20260819b replaces the IN list with a
--    regexp_replace normalization so every spacing/punctuation/case variant of
--    "super admin*" resolves to the canonical key.
--
--    20260819b was later broadened to authorize supported finalizer roles from
--    THREE sources — profiles.role, profiles.additional_roles[].role, and
--    user_roles.role — with normalized values that include the various
--    "Field Operation Manager" spellings (fieldoperationmanager, fom, …).
--
--    This section verifies:
--      (a) a profile with role='Super Administrator' can call
--          close_mmp_and_lock_incentives successfully on a clean, eligible
--          open cycle (regression: old code rejects this with "Only FOM /
--          Director / Admin / Super Admin can close a cycle");
--      (a2) a profile with role='Field Operation Manager' can close
--           (primary-role normalization → fieldoperationmanager);
--      (a3) a profile whose PRIMARY role is unprivileged but whose
--           additional_roles contains {role:'FOM'} can close
--           (additional_roles source);
--      (a4) a profile whose PRIMARY role is unprivileged but who has a
--           user_roles row 'field_operation_manager' can close
--           (user_roles source);
--      (b) a profile with an unpermitted role ('enumerator'), no privileged
--          additional_roles, and no privileged user_roles is still rejected
--          with the expected error message.
--
--    Each success case closes its OWN clean MMP so closures are independent
--    (the RPC's already-closed guard never cross-contaminates the cases).
--
--    Fixtures are inserted inside the current transaction (rolled back at end).
--    The close RPC reads auth.uid() from request.jwt.claims, so we use
--    set_config to set the JWT sub before each call, matching the pattern used
--    by the RLS section above.
-- ---------------------------------------------------------------------------

-- Seed a 'Super Administrator' actor.
DO $$
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES ('ce540000-0000-4000-8000-000000000099'::uuid, 'superadmin-full@test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email, role)
  VALUES ('ce540000-0000-4000-8000-000000000099'::uuid,
          'superadmin-full@test', 'Super Administrator')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
END $$;

-- Seed an unauthorized actor.
DO $$
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES ('ce540000-0000-4000-8000-0000000000ee'::uuid, 'unauth@test')
  ON CONFLICT (id) DO NOTHING;

  -- Unprivileged across ALL three sources: primary role + empty additional_roles,
  -- and (below) no user_roles rows.
  INSERT INTO public.profiles (id, email, role, additional_roles)
  VALUES ('ce540000-0000-4000-8000-0000000000ee'::uuid,
          'unauth@test', 'enumerator', '[]'::jsonb)
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role, additional_roles = EXCLUDED.additional_roles;
END $$;

-- Seed a clean eligible MMP for the Super Administrator close test.
-- No not-covered advances, cycle_closed_at NULL, cycle_status='open'.
DO $$
BEGIN
  INSERT INTO public.mmp_files
    (id, cycle_status, status, country_id, cycle_closed_at, cycle_closed_by, updated_at)
  VALUES
    ('ce540000-0000-4000-8000-000000009901'::uuid,
     'open', 'active', NULL, NULL, NULL, now())
  ON CONFLICT (id) DO NOTHING;
END $$;

-- (a) Super Administrator must be allowed to close.
DO $$
DECLARE
  v_res  jsonb;
  v_ok   boolean;
  v_err  text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', 'ce540000-0000-4000-8000-000000000099')::text, true);

  v_res := public.close_mmp_and_lock_incentives(
    'ce540000-0000-4000-8000-000000009901'::uuid, NULL);

  v_ok  := (v_res->>'ok')::boolean;
  v_err := v_res->>'error';

  IF NOT v_ok THEN
    RAISE EXCEPTION
      'FAIL [Super Administrator can close cycle]: RPC rejected with: %', v_err;
  END IF;
  RAISE NOTICE 'PASS [Super Administrator can close cycle]: ok=true, closed_at=%',
    v_res->>'closed_at';
END $$;

-- (a2) profiles.role='Field Operation Manager' must be allowed to close.
DO $$
DECLARE
  v_res jsonb; v_ok boolean; v_err text;
BEGIN
  -- Actor with the full FOM phrase as PRIMARY role.
  INSERT INTO auth.users (id, email)
  VALUES ('ce540000-0000-4000-8000-0000000000f1'::uuid, 'fom-primary@test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, email, role)
  VALUES ('ce540000-0000-4000-8000-0000000000f1'::uuid,
          'fom-primary@test', 'Field Operation Manager')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- Own clean MMP.
  INSERT INTO public.mmp_files
    (id, cycle_status, status, country_id, cycle_closed_at, cycle_closed_by, updated_at)
  VALUES
    ('ce540000-0000-4000-8000-000000009903'::uuid,
     'open', 'active', NULL, NULL, NULL, now())
  ON CONFLICT (id) DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', 'ce540000-0000-4000-8000-0000000000f1')::text, true);

  v_res := public.close_mmp_and_lock_incentives(
    'ce540000-0000-4000-8000-000000009903'::uuid, NULL);
  v_ok  := (v_res->>'ok')::boolean;
  v_err := v_res->>'error';

  IF NOT v_ok THEN
    RAISE EXCEPTION
      'FAIL [Field Operation Manager (primary role) can close cycle]: RPC rejected with: %', v_err;
  END IF;
  RAISE NOTICE 'PASS [Field Operation Manager (primary role) can close cycle]: ok=true, closed_at=%',
    v_res->>'closed_at';
END $$;

-- (a3) primary role unprivileged, additional_roles contains {role:'FOM'} → allowed.
DO $$
DECLARE
  v_res jsonb; v_ok boolean; v_err text;
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES ('ce540000-0000-4000-8000-0000000000f2'::uuid, 'fom-additional@test')
  ON CONFLICT (id) DO NOTHING;
  -- Unprivileged PRIMARY role, but a privileged entry in additional_roles.
  INSERT INTO public.profiles (id, email, role, additional_roles)
  VALUES ('ce540000-0000-4000-8000-0000000000f2'::uuid,
          'fom-additional@test', 'enumerator',
          '[{"role":"FOM"}]'::jsonb)
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role, additional_roles = EXCLUDED.additional_roles;

  INSERT INTO public.mmp_files
    (id, cycle_status, status, country_id, cycle_closed_at, cycle_closed_by, updated_at)
  VALUES
    ('ce540000-0000-4000-8000-000000009904'::uuid,
     'open', 'active', NULL, NULL, NULL, now())
  ON CONFLICT (id) DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', 'ce540000-0000-4000-8000-0000000000f2')::text, true);

  v_res := public.close_mmp_and_lock_incentives(
    'ce540000-0000-4000-8000-000000009904'::uuid, NULL);
  v_ok  := (v_res->>'ok')::boolean;
  v_err := v_res->>'error';

  IF NOT v_ok THEN
    RAISE EXCEPTION
      'FAIL [additional_roles FOM can close cycle]: RPC rejected with: %', v_err;
  END IF;
  RAISE NOTICE 'PASS [additional_roles {role:FOM} can close cycle]: ok=true, closed_at=%',
    v_res->>'closed_at';
END $$;

-- (a4) primary role unprivileged, user_roles has 'field_operation_manager' → allowed.
DO $$
DECLARE
  v_res jsonb; v_ok boolean; v_err text;
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES ('ce540000-0000-4000-8000-0000000000f3'::uuid, 'fom-userroles@test')
  ON CONFLICT (id) DO NOTHING;
  -- Unprivileged PRIMARY role and NO privileged additional_roles.
  INSERT INTO public.profiles (id, email, role, additional_roles)
  VALUES ('ce540000-0000-4000-8000-0000000000f3'::uuid,
          'fom-userroles@test', 'enumerator', '[]'::jsonb)
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role, additional_roles = EXCLUDED.additional_roles;
  -- Privilege granted only via the user_roles table.
  INSERT INTO public.user_roles (user_id, role)
  VALUES ('ce540000-0000-4000-8000-0000000000f3'::uuid, 'field_operation_manager');

  INSERT INTO public.mmp_files
    (id, cycle_status, status, country_id, cycle_closed_at, cycle_closed_by, updated_at)
  VALUES
    ('ce540000-0000-4000-8000-000000009905'::uuid,
     'open', 'active', NULL, NULL, NULL, now())
  ON CONFLICT (id) DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', 'ce540000-0000-4000-8000-0000000000f3')::text, true);

  v_res := public.close_mmp_and_lock_incentives(
    'ce540000-0000-4000-8000-000000009905'::uuid, NULL);
  v_ok  := (v_res->>'ok')::boolean;
  v_err := v_res->>'error';

  IF NOT v_ok THEN
    RAISE EXCEPTION
      'FAIL [user_roles field_operation_manager can close cycle]: RPC rejected with: %', v_err;
  END IF;
  RAISE NOTICE 'PASS [user_roles field_operation_manager can close cycle]: ok=true, closed_at=%',
    v_res->>'closed_at';
END $$;

-- (b) Unauthorized role must remain rejected.
DO $$
DECLARE
  v_res  jsonb;
  v_ok   boolean;
  v_err  text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', 'ce540000-0000-4000-8000-0000000000ee')::text, true);

  -- Use a different (still-open) MMP so the already-closed guard does not fire.
  INSERT INTO public.mmp_files
    (id, cycle_status, status, country_id, cycle_closed_at, cycle_closed_by, updated_at)
  VALUES
    ('ce540000-0000-4000-8000-000000009902'::uuid,
     'open', 'active', NULL, NULL, NULL, now())
  ON CONFLICT (id) DO NOTHING;

  v_res := public.close_mmp_and_lock_incentives(
    'ce540000-0000-4000-8000-000000009902'::uuid, NULL);

  v_ok  := (v_res->>'ok')::boolean;
  v_err := v_res->>'error';

  IF v_ok THEN
    RAISE EXCEPTION
      'FAIL [unauthorized role rejected from close]: RPC accepted an enumerator';
  END IF;
  IF v_err NOT ILIKE '%FOM%' AND v_err NOT ILIKE '%Admin%' AND v_err NOT ILIKE '%close%' THEN
    RAISE EXCEPTION
      'FAIL [unauthorized role rejected from close]: unexpected error message: %', v_err;
  END IF;
  RAISE NOTICE 'PASS [unauthorized role rejected from close]: correctly rejected — %', v_err;
END $$;

-- (a5) profiles.role='Field Operation Manager (FOM)' — the parenthesised
--      abbreviation form that normalizes (non-alphanumeric stripped) to
--      'fieldoperationmanagerfom'. Prove BOTH exception-role helpers accept
--      it, then execute one manager-only exception action (cancel of a fresh
--      approved advance) successfully as that role.
DO $$
DECLARE
  FOMP uuid := 'ce540000-0000-4000-8000-0000000000f4';   -- actor
  m5   uuid := 'ce540000-0000-4000-8000-000000009906';   -- fresh MMP
  s5   uuid := 'ce540000-0000-4000-8000-000000009916';   -- not-covered site
  a5   uuid := 'ce540000-0000-4000-8000-000000009926';   -- approved advance
  v_exec boolean;
  v_mgr  boolean;
  v_res  jsonb;
  v_ok   boolean;
BEGIN
  -- Seed actor whose PRIMARY role is the parenthesised FOM phrase.
  INSERT INTO auth.users (id, email)
  VALUES (FOMP, 'fom-paren@test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, email, full_name, role, additional_roles)
  VALUES (FOMP, 'fom-paren@test', 'FOM Paren',
          'Field Operation Manager (FOM)', '[]'::jsonb)
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role, additional_roles = EXCLUDED.additional_roles;

  -- Helper predicates must both accept the normalized 'fieldoperationmanagerfom'.
  v_exec := public.is_cycle_exception_executor(FOMP);
  v_mgr  := public.is_cycle_exception_manager(FOMP);

  IF NOT v_exec THEN
    RAISE EXCEPTION
      'FAIL [FOM (FOM) is exception executor]: is_cycle_exception_executor returned false';
  END IF;
  RAISE NOTICE 'PASS [FOM (FOM) is exception executor]: is_cycle_exception_executor=true';

  IF NOT v_mgr THEN
    RAISE EXCEPTION
      'FAIL [FOM (FOM) is exception manager]: is_cycle_exception_manager returned false';
  END IF;
  RAISE NOTICE 'PASS [FOM (FOM) is exception manager]: is_cycle_exception_manager=true';

  -- Execute a manager-only exception action as this role: cancel a fresh
  -- approved (unpaid) advance. mk_case builds MMP + not-covered site + advance.
  PERFORM pg_temp.mk_case(m5, s5, a5, 'approved', 1000, 0);
  PERFORM pg_temp.as_user(FOMP);

  v_res := public.execute_cycle_close_exception(
    m5, s5, a5, 'cancel', NULL, 'FOM (FOM) cancels approved advance');
  v_ok  := (v_res->>'ok')::boolean;

  IF NOT v_ok THEN
    RAISE EXCEPTION
      'FAIL [FOM (FOM) executes manager-only cancel]: RPC rejected with: %',
      v_res->>'error';
  END IF;
  RAISE NOTICE
    'PASS [FOM (FOM) executes manager-only cancel]: ok=true, decision=%',
    v_res->>'decision';
END $$;

DO $$ BEGIN
  RAISE NOTICE '✅  All cycle-close exception-execution tests passed.';
END $$;

-- ---------------------------------------------------------------------------
-- 7. Roll back everything: fixtures, seeded rows, and — crucially — the
--    transactional replacement of acct_bridge_post_journal (restores real fn).
-- ---------------------------------------------------------------------------
ROLLBACK;

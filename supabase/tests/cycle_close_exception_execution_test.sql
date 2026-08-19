-- =============================================================================
-- Integration / regression test: execute_cycle_close_exception()
--                                + mmp_files hard-close gate
--
-- Migration under test: 20260819_cycle_close_inline_exception_execution.sql
--   (depends on 20260818_cycle_exception_actions.sql,
--    20260818b_field_payments_columns.sql,
--    20260819b_cycle_close_finalizer_role_variants.sql, and
--    20260819c_cycle_close_mmp_country_scope.sql,
--    20260819h_cycle_exception_journal_line_ids.sql, and — for the
--    reprocessed-payment reversal regression (section 11) —
--    20260819o_cycle_redirect_reprocessed_payment_reversal.sql)
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
    ['cycle_exception_actions','correction_status'],
    ['cycle_exception_actions','correction_reversal_journal_id'],
    ['cycle_exception_actions','correction_replacement_action_id'],
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

  -- Country-scope trigger function (20260819c_cycle_close_mmp_country_scope).
  IF to_regprocedure('public.stamp_mmp_file_country_from_project()') IS NULL THEN
    v_missing := v_missing
      || '  - function stamp_mmp_file_country_from_project() is missing' || E'\n';
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

  -- Multi-site Redirect allocation ledger and atomic executor.
  IF to_regclass('public.cycle_exception_action_allocations') IS NULL THEN
    v_missing := v_missing
      || '  - table cycle_exception_action_allocations is missing' || E'\n';
  END IF;

  IF to_regprocedure(
    'public.execute_cycle_close_redirect_allocations(uuid,uuid,uuid,jsonb,text)'
  ) IS NULL THEN
    v_missing := v_missing
      || '  - function execute_cycle_close_redirect_allocations(uuid,uuid,uuid,jsonb,text) is missing'
      || E'\n';
  END IF;

  IF to_regprocedure('public.acct_append_cycle_exception_journal_id()') IS NULL THEN
    v_missing := v_missing
      || '  - function acct_append_cycle_exception_journal_id() is missing'
      || E'\n';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_acct_cycle_exception_journal_id'
      AND tgrelid = 'public.acct_journal_lines'::regclass
  ) THEN
    v_missing := v_missing
      || '  - trigger trg_acct_cycle_exception_journal_id on acct_journal_lines is missing'
      || E'\n';
  END IF;

  IF to_regclass('public.cycle_legacy_redirect_review') IS NULL THEN
    v_missing := v_missing
      || '  - view cycle_legacy_redirect_review is missing' || E'\n';
  END IF;

  IF to_regclass('public.acct_gl_bridge_reversal_links') IS NULL THEN
    v_missing := v_missing
      || '  - table acct_gl_bridge_reversal_links is missing' || E'\n';
  END IF;

  IF to_regprocedure(
    'public.reopen_cycle_redirect_for_correction(uuid,text,uuid,text)'
  ) IS NULL THEN
    v_missing := v_missing
      || '  - function reopen_cycle_redirect_for_correction(uuid,text,uuid,text) is missing'
      || E'\n';
  END IF;

  IF to_regprocedure(
    'public.reconcile_reprocessed_cycle_redirect(uuid,text,uuid,text)'
  ) IS NULL THEN
    v_missing := v_missing
      || '  - function reconcile_reprocessed_cycle_redirect(uuid,text,uuid,text) is missing'
      || E'\n';
  END IF;

  -- Task #562 — reprocessed-payment reversal RPC, status, and audit tables.
  IF to_regprocedure(
    'public.reverse_reprocessed_cycle_redirect_for_correction(uuid,text,uuid,text,boolean)'
  ) IS NULL THEN
    v_missing := v_missing
      || '  - function reverse_reprocessed_cycle_redirect_for_correction(uuid,text,uuid,text,boolean) is missing'
      || E'\n';
  END IF;

  IF to_regclass('public.cycle_redirect_reprocessed_reversals') IS NULL THEN
    v_missing := v_missing
      || '  - table cycle_redirect_reprocessed_reversals is missing' || E'\n';
  END IF;
  IF to_regclass('public.cycle_redirect_reprocessed_journal_reversals') IS NULL THEN
    v_missing := v_missing
      || '  - table cycle_redirect_reprocessed_journal_reversals is missing' || E'\n';
  END IF;
  IF to_regclass('public.cycle_redirect_reprocessed_wallet_reversals') IS NULL THEN
    v_missing := v_missing
      || '  - table cycle_redirect_reprocessed_wallet_reversals is missing' || E'\n';
  END IF;

  -- The third correction_status must be accepted by the check constraint.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cycle_exception_actions_correction_status_check'
      AND conrelid = 'public.cycle_exception_actions'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%reprocessed_payment_reversed%'
  ) THEN
    v_missing := v_missing
      || '  - correction_status check does not allow reprocessed_payment_reversed' || E'\n';
  END IF;

  -- Columns the reprocessed-payment reversal fixtures/RPC rely on.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'down_payment_requests'
      AND column_name = 'wallet_transaction_ids'
  ) THEN
    v_missing := v_missing
      || '  - column down_payment_requests.wallet_transaction_ids is missing' || E'\n';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'down_payment_requests'
      AND column_name = 'payment_proof_url'
  ) THEN
    v_missing := v_missing
      || '  - column down_payment_requests.payment_proof_url is missing' || E'\n';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'acct_gl_bridge_log'
      AND column_name = 'amount'
  ) THEN
    v_missing := v_missing
      || '  - column acct_gl_bridge_log.amount is missing' || E'\n';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'acct_journal_entries'
      AND column_name = 'country_id'
  ) THEN
    v_missing := v_missing
      || '  - column acct_journal_entries.country_id is missing' || E'\n';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'acct_journal_lines'
      AND column_name = 'company_id'
  ) THEN
    v_missing := v_missing
      || '  - column acct_journal_lines.company_id is missing' || E'\n';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions'
      AND column_name = 'balance_before'
  ) THEN
    v_missing := v_missing
      || '  - column wallet_transactions.balance_before is missing' || E'\n';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc procedure
    WHERE procedure.oid = to_regprocedure('public.acct_post_reversal(uuid,jsonb,text)')
      AND strpos(
        procedure.prosrc,
        'is_cycle_redirect_correction_authorizer(v_user_id)'
      ) > 0
  ) THEN
    v_missing := v_missing
      || '  - acct_post_reversal is not aligned with case-safe Cycle Close financial roles'
      || E'\n';
  END IF;

  IF v_missing <> '' THEN
    RAISE EXCEPTION
      'PREFLIGHT FAILED — required schema not present. Apply migrations '
      '20260818_close_mmp_and_lock_incentives, 20260819_cycle_close_inline_exception_execution '
      '(and their 20260818* deps), 20260819b_cycle_close_finalizer_role_variants, and '
      '20260819c_cycle_close_mmp_country_scope, 20260819e_cycle_redirect_fee_settlement_safety, '
      '20260819f_cycle_redirect_multi_site_allocations, and '
      '20260819g_cycle_redirect_correction through '
      '20260819m_cycle_redirect_historical_reconciliation, and '
      '20260819o_cycle_redirect_reprocessed_payment_reversal first.%s%s',
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
  t8 uuid := 'ce54c008-0000-4000-8000-0000000000c8';
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
  PERFORM pg_temp.mk_covered_site(t8, m8, MGR::text);
  UPDATE public.mmp_site_entries SET enumerator_fee = 1000 WHERE id = t8;
  res := public.execute_cycle_close_exception(
    m8, s8, a8, 'redirect', 1000, 'redirect to fee', NULL, t8);
  PERFORM pg_temp.assert_ok('redirect executes', res);
  SELECT id INTO v_action FROM public.cycle_exception_actions WHERE advance_id = a8;
  v_gl := pg_temp.assert_single_balanced_gl('redirect GL', v_action);
  -- Redirect: DR enumerator fee (5200), CR advance (1510)
  PERFORM pg_temp.assert_txt('redirect GL accounts (DR enum-fee / CR advance)', v_gl, 'DR:5200|CR:1510');
  -- (a) the fee-status update completed (the AFTER UPDATE trigger fired)
  SELECT fee_paid_status INTO v_status FROM public.mmp_site_entries WHERE id = t8;
  PERFORM pg_temp.assert_txt('redirect → site fee marked paid', v_status, 'paid');

  -- (b) the trigger saw the sentinel: the RPC pre-inserted a 'success' row for
  --     (mmp_site_entries, t8, enumerator_fee_paid) BEFORE flipping the status,
  --     so the trigger's "already posted" guard finds it and early-returns.
  SELECT count(*) INTO v_count
  FROM public.acct_gl_bridge_log
  WHERE source_table = 'mmp_site_entries'
    AND source_id = t8
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

-- ---------------------------------------------------------------------------
-- 7. Regression: mmp_files.country_id column existence + execute_cycle_close_exception
--    does not crash when v_mmp.country_id is read
--    (20260819c_cycle_close_mmp_country_scope corrective migration)
--
--    The live production failure was:
--      ERROR: record "v_mmp" has no field "country_id"
--    because older mmp_files rows were created before the column was added.
--    20260819c adds the column with ADD COLUMN IF NOT EXISTS and installs the
--    stamp_mmp_file_country_from_project() trigger function.
--
--    This section:
--      (7a) Asserts mmp_files.country_id exists in information_schema (structural).
--      (7b) Asserts stamp_mmp_file_country_from_project() trigger function exists.
--      (7c) Seeds an MMP with country_id explicitly set to the CE54 fixture
--           country and executes a manager-only cancel decision — the exact path
--           that crashed with "record v_mmp has no field country_id" on pre-20260819c
--           databases.  Must return ok=true.
--      (7d) Seeds an MMP with country_id NULL (simulating an older unfilled row)
--           and verifies the same decision returns ok=true — the column existing
--           but being NULL must not cause a crash.
-- ---------------------------------------------------------------------------

-- (7a) structural: mmp_files.country_id must be present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'mmp_files'
      AND column_name  = 'country_id'
  ) THEN
    RAISE EXCEPTION
      'FAIL [mmp_files.country_id exists]: column missing — 20260819c structural DDL not applied';
  END IF;
  RAISE NOTICE 'PASS [mmp_files.country_id exists]: column present on mmp_files';
END $$;

-- (7b) stamp trigger function must be present.
DO $$
BEGIN
  IF to_regprocedure('public.stamp_mmp_file_country_from_project()') IS NULL THEN
    RAISE EXCEPTION
      'FAIL [stamp_mmp_file_country_from_project exists]: migration 20260819c not fully applied';
  END IF;
  RAISE NOTICE 'PASS [stamp_mmp_file_country_from_project exists]: function present';
END $$;

-- (7c) Non-NULL country_id: the path that originally crashed.
DO $$
DECLARE
  v_actor uuid := 'ce540000-0000-4000-8000-0000000000f5';
  v_mmp   uuid := 'ce540000-0000-4000-8000-000000009907';
  v_site  uuid := 'ce540000-0000-4000-8000-000000009917';
  v_adv   uuid := 'ce540000-0000-4000-8000-000000009927';
  v_res   jsonb;
BEGIN
  -- Actor: use the already-seeded FOM manager fixture so no extra auth.users
  -- row is needed; just reuse the main MGR profile identity.
  -- We set the JWT sub to the main MGR (ce540000-…-001) who is already a FOM.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', 'ce540000-0000-4000-8000-000000000001')::text, true);

  -- MMP with country_id explicitly set to CE54 test country.
  INSERT INTO public.mmp_files
    (id, cycle_status, status, country_id, updated_at)
  VALUES
    (v_mmp, 'open', 'active',
     'ce540000-c001-4000-8000-000000000c01'::uuid,   -- CE54 fixture country
     now())
  ON CONFLICT (id) DO NOTHING;

  -- Approved advance on a not-covered site of that MMP.
  PERFORM pg_temp.mk_case(v_mmp, v_site, v_adv, 'approved', 500, 0);

  v_res := public.execute_cycle_close_exception(
    v_mmp, v_site, v_adv,
    'cancel', NULL, 'country_id regression: non-null country');

  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION
      'FAIL [country_id non-null: cancel succeeds]: RPC returned error: %',
      v_res->>'error';
  END IF;
  RAISE NOTICE
    'PASS [country_id non-null: cancel succeeds]: ok=true (v_mmp.country_id read without crash)';
END $$;

-- (7d) NULL country_id: older unfilled MMP rows must not crash either.
DO $$
DECLARE
  v_mmp  uuid := 'ce540000-0000-4000-8000-000000009908';
  v_site uuid := 'ce540000-0000-4000-8000-000000009918';
  v_adv  uuid := 'ce540000-0000-4000-8000-000000009928';
  v_res  jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', 'ce540000-0000-4000-8000-000000000001')::text, true);

  -- MMP with country_id NULL (legacy / unfilled row).
  INSERT INTO public.mmp_files
    (id, cycle_status, status, country_id, updated_at)
  VALUES
    (v_mmp, 'open', 'active', NULL, now())
  ON CONFLICT (id) DO NOTHING;

  PERFORM pg_temp.mk_case(v_mmp, v_site, v_adv, 'approved', 500, 0);

  v_res := public.execute_cycle_close_exception(
    v_mmp, v_site, v_adv,
    'cancel', NULL, 'country_id regression: null country');

  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION
      'FAIL [country_id null: cancel succeeds]: RPC returned error: %',
      v_res->>'error';
  END IF;
  RAISE NOTICE
    'PASS [country_id null: cancel succeeds]: ok=true (NULL country_id handled cleanly)';
END $$;

-- ---------------------------------------------------------------------------
-- 8. Multi-site Redirect allocation ledger + accounting regression
--    (20260819f_cycle_redirect_multi_site_allocations)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  MGR constant uuid := 'ce540000-0000-4000-8000-000000000001';
  FIN constant uuid := 'ce540000-0000-4000-8000-000000000002';
  ENU constant uuid := 'ce540000-0000-4000-8000-000000000003';
  mmp1 uuid := 'ce550000-0000-4000-8000-000000009901';
  src1 uuid := 'ce550000-0000-4000-8000-000000009911';
  adv1 uuid := 'ce550000-0000-4000-8000-000000009921';
  tgt1 uuid := 'ce550000-0000-4000-8000-000000009931';
  tgt2 uuid := 'ce550000-0000-4000-8000-000000009932';
  mmp2 uuid := 'ce550000-0000-4000-8000-000000009902';
  src2 uuid := 'ce550000-0000-4000-8000-000000009912';
  adv2 uuid := 'ce550000-0000-4000-8000-000000009922';
  tgt3 uuid := 'ce550000-0000-4000-8000-000000009933';
  mmp3 uuid := 'ce550000-0000-4000-8000-000000009903';
  src3 uuid := 'ce550000-0000-4000-8000-000000009913';
  adv3 uuid := 'ce550000-0000-4000-8000-000000009923';
  tgt4 uuid := 'ce550000-0000-4000-8000-000000009934';
  v_res jsonb;
  v_retry jsonb;
  v_action uuid;
  v_journal uuid;
  v_count bigint;
  v_lines jsonb;
  v_dr numeric;
  v_cr numeric;
  v_status text;
  v_amount numeric;
  v_line_journal uuid;
  v_fee_account uuid;
  v_line_description text;
BEGIN
  -- SDG 80,000 advance: Site A receives 70,000 (full), Site B receives
  -- 10,000 (partial). Site B uses a different enumerator and therefore also
  -- proves manager-authorized cross-enumerator execution.
  PERFORM pg_temp.mk_case(mmp1, src1, adv1, 'paid', 80000, 80000, MGR::text);
  UPDATE public.down_payment_requests
  SET wallet_transaction_ids = '["wallet-ce55-original"]'::jsonb
  WHERE id = adv1;
  PERFORM pg_temp.mk_covered_site(tgt1, mmp1, MGR::text);
  PERFORM pg_temp.mk_covered_site(tgt2, mmp1, ENU::text);
  UPDATE public.mmp_site_entries
  SET site_name = 'CE Covered Site A', enumerator_fee = 70000, transport_fee = 0,
      fee_paid_amount = 0, fee_cash_paid_amount = 0, fee_advance_offset_amount = 0
  WHERE id = tgt1;
  UPDATE public.mmp_site_entries
  SET site_name = 'CE Covered Site B', enumerator_fee = 50000, transport_fee = 0,
      fee_paid_amount = 0, fee_cash_paid_amount = 0, fee_advance_offset_amount = 0
  WHERE id = tgt2;

  PERFORM pg_temp.as_user(MGR);
  v_res := public.execute_cycle_close_redirect_allocations(
    mmp1, src1, adv1,
    jsonb_build_array(
      jsonb_build_object('target_site_id', tgt1, 'amount', 70000),
      jsonb_build_object('target_site_id', tgt2, 'amount', 10000)
    ),
    'Allocate the complete unused transport advance across covered-site fees'
  );
  PERFORM pg_temp.assert_ok('multi-site redirect executes atomically', v_res);
  v_action := (v_res->>'action_id')::uuid;
  v_journal := (v_res->>'journal_entry_id')::uuid;

  SELECT count(*) INTO v_count
  FROM public.cycle_exception_action_allocations
  WHERE action_id = v_action;
  PERFORM pg_temp.assert_eq('multi-site redirect persists two target rows', v_count, 2);

  SELECT fee_paid_status, fee_paid_amount INTO v_status, v_amount
  FROM public.mmp_site_entries WHERE id = tgt1;
  PERFORM pg_temp.assert_txt('multi-site target A fully paid', v_status, 'paid');
  PERFORM pg_temp.assert_true('multi-site target A settled exactly 70000', v_amount = 70000);

  SELECT fee_paid_status, fee_paid_amount INTO v_status, v_amount
  FROM public.mmp_site_entries WHERE id = tgt2;
  PERFORM pg_temp.assert_txt('multi-site target B partially paid', v_status, 'partially_paid');
  PERFORM pg_temp.assert_true('multi-site target B settled exactly 10000', v_amount = 10000);

  SELECT status INTO v_status FROM public.down_payment_requests WHERE id = adv1;
  PERFORM pg_temp.assert_txt('multi-site source advance resolved once', v_status, 'cancelled');

  SELECT count(*) INTO v_count
  FROM public.cycle_exception_action_allocations
  WHERE action_id = v_action
    AND source_payment_references @> '["wallet-ce55-original"]'::jsonb;
  PERFORM pg_temp.assert_eq('multi-site original wallet reference preserved on every target', v_count, 2);

  SELECT lines INTO v_lines
  FROM pg_temp.gl_double_calls
  WHERE source_table = 'cycle_exception_actions' AND source_id = v_action;
  PERFORM pg_temp.assert_true('multi-site journal has exact DR/CR pair per target',
    jsonb_array_length(v_lines) = 4);
  SELECT
    sum((line->>'amount')::numeric) FILTER (WHERE line->>'debit_credit' = 'DR'),
    sum((line->>'amount')::numeric) FILTER (WHERE line->>'debit_credit' = 'CR')
  INTO v_dr, v_cr
  FROM jsonb_array_elements(v_lines) line;
  PERFORM pg_temp.assert_true('multi-site journal balances at full advance',
    v_dr = 80000 AND v_cr = 80000);
  PERFORM pg_temp.assert_true('multi-site journal identifies target A and paid status',
    v_lines::text LIKE '%CE Covered Site A%' AND v_lines::text LIKE '%status fully paid%');
  PERFORM pg_temp.assert_true('multi-site journal identifies target B and partial status',
    v_lines::text LIKE '%CE Covered Site B%' AND v_lines::text LIKE '%status partially paid%');

  -- The UUID is unknown while the Redirect builds its line text.  The database
  -- trigger must append the final draft-header UUID before the immutable line is
  -- stored, rather than attempting an unsafe UPDATE after posting.
  SELECT id INTO v_fee_account
  FROM public.acct_accounts
  WHERE code = '5200'
  LIMIT 1;
  INSERT INTO public.acct_journal_entries (
    period_id, posting_date, description_en, source_type, source_id, status,
    idempotency_key, created_by
  ) VALUES (
    'ce540000-feed-4000-8000-0000000000f1'::uuid,
    current_date,
    'Cycle Close Redirect line-description trace test',
    'cycle_exception_actions',
    v_action,
    'draft',
    'cycle-line-id-test::' || v_action::text,
    MGR
  )
  RETURNING id INTO v_line_journal;
  INSERT INTO public.acct_journal_lines (
    entry_id, line_no, account_id, debit_credit,
    functional_amount, original_amount, original_currency,
    functional_currency, fx_rate, description
  ) VALUES (
    v_line_journal, 1, v_fee_account, 'DR',
    1, 1, 'SDG', 'SDG', 1,
    'Redirect allocation trace'
  );
  SELECT description INTO v_line_description
  FROM public.acct_journal_lines
  WHERE entry_id = v_line_journal AND line_no = 1;
  PERFORM pg_temp.assert_true(
    'Cycle Close GL line includes its final journal UUID',
    v_line_description = 'Redirect allocation trace; GL journal ID ' || v_line_journal::text
  );

  -- An exact retry returns the original action/journal and does not post again.
  v_retry := public.execute_cycle_close_redirect_allocations(
    mmp1, src1, adv1,
    jsonb_build_array(
      jsonb_build_object('target_site_id', tgt1, 'amount', 70000),
      jsonb_build_object('target_site_id', tgt2, 'amount', 10000)
    ),
    'Allocate the complete unused transport advance across covered-site fees'
  );
  PERFORM pg_temp.assert_ok('multi-site retry is idempotent', v_retry);
  PERFORM pg_temp.assert_true('multi-site retry returns same action and journal',
    (v_retry->>'action_id')::uuid = v_action
    AND (v_retry->>'journal_entry_id')::uuid = v_journal);
  SELECT count(*) INTO v_count
  FROM pg_temp.gl_double_calls
  WHERE source_table = 'cycle_exception_actions' AND source_id = v_action;
  PERFORM pg_temp.assert_eq('multi-site retry creates no second journal', v_count, 1);

  -- A residual blocks execution and leaves no parent/child audit rows.
  PERFORM pg_temp.mk_case(mmp2, src2, adv2, 'paid', 80000, 80000, MGR::text);
  PERFORM pg_temp.mk_covered_site(tgt3, mmp2, MGR::text);
  UPDATE public.mmp_site_entries
  SET site_name = 'CE Residual Target', enumerator_fee = 90000, transport_fee = 0,
      fee_paid_amount = 0, fee_cash_paid_amount = 0, fee_advance_offset_amount = 0
  WHERE id = tgt3;
  v_res := public.execute_cycle_close_redirect_allocations(
    mmp2, src2, adv2,
    jsonb_build_array(jsonb_build_object('target_site_id', tgt3, 'amount', 79999)),
    'This must fail because one SDG remains'
  );
  PERFORM pg_temp.assert_err('multi-site residual rejected', v_res, 'full paid advance');
  SELECT count(*) INTO v_count
  FROM public.cycle_exception_actions WHERE advance_id = adv2;
  PERFORM pg_temp.assert_eq('multi-site residual leaves no parent action', v_count, 0);

  -- Finance may execute same-enumerator Redirects, but may not authorize a
  -- cross-enumerator transfer.
  PERFORM pg_temp.mk_case(mmp3, src3, adv3, 'paid', 1000, 1000, MGR::text);
  PERFORM pg_temp.mk_covered_site(tgt4, mmp3, ENU::text);
  UPDATE public.mmp_site_entries
  SET site_name = 'CE Cross Enumerator Target', enumerator_fee = 1000, transport_fee = 0,
      fee_paid_amount = 0, fee_cash_paid_amount = 0, fee_advance_offset_amount = 0
  WHERE id = tgt4;
  PERFORM pg_temp.as_user(FIN);
  v_res := public.execute_cycle_close_redirect_allocations(
    mmp3, src3, adv3,
    jsonb_build_array(jsonb_build_object('target_site_id', tgt4, 'amount', 1000)),
    'Finance cannot authorize a cross-enumerator transfer'
  );
  PERFORM pg_temp.assert_err('Finance cross-enumerator allocation rejected', v_res, 'authorization');

  -- Completing Site B by bank transfer posts only the SDG 40,000 payment
  -- component to Bank (1020). The original SDG 10,000 advance offset must never
  -- appear in this second journal.
  PERFORM pg_temp.as_user(MGR);
  BEGIN
    UPDATE public.mmp_site_entries
    SET fee_paid_status = 'paid',
        fee_paid_amount = 50000,
        fee_cash_paid_amount = 1,
        fee_advance_offset_amount = 10000,
        fee_paid_at = now(),
        fee_paid_by = MGR,
        fee_payment_method = 'Bank Transfer'
    WHERE id = tgt2;
    RAISE EXCEPTION 'MULTI_REDIRECT_UNDERPAYMENT_NOT_REJECTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'MULTI_REDIRECT_UNDERPAYMENT_NOT_REJECTED' THEN
      RAISE EXCEPTION
        'FAIL [redirect cash underpayment rejected]: paid status accepted an SDG 1 completion';
    END IF;
    IF SQLERRM NOT ILIKE '%components must equal the gross fee%' THEN
      RAISE EXCEPTION
        'FAIL [redirect cash underpayment rejected]: unexpected error: %', SQLERRM;
    END IF;
  END;
  SELECT fee_paid_status INTO v_status FROM public.mmp_site_entries WHERE id = tgt2;
  PERFORM pg_temp.assert_txt('redirect cash underpayment leaves partial status', v_status, 'partially_paid');
  SELECT count(*) INTO v_count
  FROM pg_temp.gl_double_calls
  WHERE source_table = 'mmp_site_entries' AND source_id = tgt2;
  PERFORM pg_temp.assert_eq('redirect cash underpayment posts no journal', v_count, 0);

  UPDATE public.mmp_site_entries
  SET fee_paid_status = 'paid',
      fee_paid_amount = 50000,
      fee_cash_paid_amount = 40000,
      fee_advance_offset_amount = 10000,
      fee_paid_at = now(),
      fee_paid_by = MGR,
      fee_payment_method = 'Bank Transfer'
  WHERE id = tgt2;

  SELECT count(*) INTO v_count
  FROM pg_temp.gl_double_calls
  WHERE source_table = 'mmp_site_entries' AND source_id = tgt2;
  PERFORM pg_temp.assert_eq('bank completion posts one later journal', v_count, 1);
  SELECT lines INTO v_lines
  FROM pg_temp.gl_double_calls
  WHERE source_table = 'mmp_site_entries' AND source_id = tgt2
  LIMIT 1;
  PERFORM pg_temp.assert_true('bank completion has only DR fee and CR bank',
    jsonb_array_length(v_lines) = 2
    AND v_lines::text NOT LIKE '%"account_code": "1510"%'
    AND v_lines::text LIKE '%"account_code": "1020"%');
  SELECT
    sum((line->>'amount')::numeric) FILTER (WHERE line->>'debit_credit' = 'DR'),
    sum((line->>'amount')::numeric) FILTER (WHERE line->>'debit_credit' = 'CR')
  INTO v_dr, v_cr
  FROM jsonb_array_elements(v_lines) line;
  PERFORM pg_temp.assert_true('bank completion posts exactly remaining 40000',
    v_dr = 40000 AND v_cr = 40000);

  -- The old single-target Redirect fixture remains visible for review and is
  -- not silently converted into allocation children.
  SELECT count(*) INTO v_count
  FROM public.cycle_legacy_redirect_review review
  WHERE review.advance_id = 'ce54c008-0000-4000-8000-0000000000b8'::uuid;
  PERFORM pg_temp.assert_eq('legacy Redirect remains in Finance review queue', v_count, 1);

  RAISE NOTICE 'PASS [multi-site Redirect allocation ledger and accounting regression].';
END $$;

-- ---------------------------------------------------------------------------
-- 9. Focused correction regression. The replacement is transactional and is
--    rolled back with the rest of this file, so the real reversal RPC remains
--    untouched after the test.
-- ---------------------------------------------------------------------------
-- The double mirrors the two invariants the Task #562 migration adds to the
-- REAL acct_post_reversal: it copies the ORIGINAL journal's country_id onto the
-- reversal header and copies each ORIGINAL line's company_id onto the matching
-- reversal line (by line_no). This lets the reprocessed-payment reversal
-- regression assert country_id / company_id preservation without a fully seeded
-- posting engine. It also fails closed exactly like the shared reversal guard:
-- a second reversal of an already-reversed entry raises ORIGINAL_NOT_REVERSIBLE.
CREATE OR REPLACE FUNCTION public.acct_post_reversal(
  p_original_entry_id uuid,
  p_payload jsonb,
  p_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reversal_id uuid;
  v_original_status text;
  v_original_country uuid;
  v_line jsonb;
BEGIN
  SELECT id
  INTO v_reversal_id
  FROM public.acct_journal_entries
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN v_reversal_id;
  END IF;

  -- Fail closed like the real guard: the original must be a posted entry.
  SELECT status, country_id
  INTO v_original_status, v_original_country
  FROM public.acct_journal_entries
  WHERE id = p_original_entry_id;

  IF v_original_status IS NULL THEN
    RAISE EXCEPTION 'ORIGINAL_NOT_FOUND: journal entry % does not exist', p_original_entry_id;
  END IF;
  IF v_original_status <> 'posted' THEN
    RAISE EXCEPTION
      'ORIGINAL_NOT_REVERSIBLE: entry % has status %; only posted entries can be reversed',
      p_original_entry_id, v_original_status;
  END IF;

  INSERT INTO public.acct_journal_entries (
    period_id,
    posting_date,
    description_en,
    source_type,
    source_id,
    status,
    idempotency_key,
    country_id,
    created_by,
    posted_at,
    posted_by
  ) VALUES (
    (p_payload->>'period_id')::uuid,
    coalesce((p_payload->>'posting_date')::date, current_date),
    p_payload->>'description_en',
    'reversal',
    p_original_entry_id,
    'posted',
    p_idempotency_key,
    v_original_country,        -- preserve original journal country_id
    auth.uid(),
    now(),
    auth.uid()
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_reversal_id;

  IF v_reversal_id IS NULL THEN
    SELECT id INTO v_reversal_id
    FROM public.acct_journal_entries
    WHERE idempotency_key = p_idempotency_key;
    RETURN v_reversal_id;
  END IF;

  -- Copy the reversed lines (flipped DR/CR already applied by the caller) and
  -- carry each ORIGINAL line's company_id across by line_no. The USER trigger on
  -- acct_journal_lines is disabled by the callers that seed source lines, so this
  -- INSERT is safe inside the test transaction.
  ALTER TABLE public.acct_journal_lines DISABLE TRIGGER USER;
  FOR v_line IN
    SELECT * FROM jsonb_array_elements(coalesce(p_payload->'lines', '[]'::jsonb))
  LOOP
    INSERT INTO public.acct_journal_lines (
      entry_id, line_no, account_id, fund_id, function, company_id,
      project_id, grant_id, cost_center_id, partner_id,
      original_amount, original_currency,
      functional_amount, functional_currency, fx_rate,
      debit_credit, description
    )
    SELECT
      v_reversal_id,
      (v_line->>'line_no')::int,
      (v_line->>'account_id')::uuid,
      (v_line->>'fund_id')::uuid,
      coalesce(v_line->>'function', 'none'),
      original_line.company_id,
      nullif(v_line->>'project_id', '')::uuid,
      nullif(v_line->>'grant_id', '')::uuid,
      nullif(v_line->>'cost_center_id', '')::uuid,
      nullif(v_line->>'partner_id', '')::uuid,
      coalesce((v_line->>'original_amount')::numeric, (v_line->>'functional_amount')::numeric),
      coalesce(v_line->>'original_currency', 'SDG'),
      (v_line->>'functional_amount')::numeric,
      coalesce(v_line->>'functional_currency', 'SDG'),
      nullif(v_line->>'fx_rate', '')::numeric,
      v_line->>'debit_credit',
      v_line->>'description'
    FROM (
      SELECT company_id
      FROM public.acct_journal_lines
      WHERE entry_id = p_original_entry_id
        AND line_no = (v_line->>'line_no')::int
      LIMIT 1
    ) original_line
    ON CONFLICT (entry_id, line_no) DO NOTHING;
  END LOOP;
  ALTER TABLE public.acct_journal_lines ENABLE TRIGGER USER;

  UPDATE public.acct_journal_entries
  SET status = 'reversed',
      reversed_by_entry_id = v_reversal_id
  WHERE id = p_original_entry_id
    AND status = 'posted';

  RETURN v_reversal_id;
END;
$$;

DO $correction_test$
DECLARE
  FIN constant uuid := 'ce540000-0000-4000-8000-000000000002';
  ENU constant uuid := 'ce540000-0000-4000-8000-000000000003';
  MMP constant uuid := 'ce54c008-0000-4000-8000-000000000008';
  SITE constant uuid := 'ce54c008-0000-4000-8000-0000000000a8';
  ADVANCE constant uuid := 'ce54c008-0000-4000-8000-0000000000b8';
  PERIOD constant uuid := 'ce540000-feed-4000-8000-0000000000f1';
  v_action_id uuid;
  v_original_journal_id uuid;
  v_other_journal_id uuid;
  v_reversal_id uuid;
  v_replacement_id uuid;
  v_result jsonb;
  v_count bigint;
  v_status text;
BEGIN
  SELECT id, gl_journal_entry_id
  INTO v_action_id, v_original_journal_id
  FROM public.cycle_exception_actions
  WHERE advance_id = ADVANCE
    AND decision = 'redirect'
    AND executed = true
  ORDER BY created_at DESC
  LIMIT 1;

  PERFORM pg_temp.assert_true(
    'correction fixture has executed legacy Redirect',
    v_action_id IS NOT NULL AND v_original_journal_id IS NOT NULL
  );

  -- Simulate the exact post-20260819e normalization signature of a Redirect
  -- executed before component tracking was introduced.
  DELETE FROM public.cycle_exception_action_allocations
  WHERE action_id = v_action_id;
  UPDATE public.cycle_exception_actions
  SET target_site_id = SITE,
      redirect_fee_site_entry_id = SITE,
      redirect_allocation_count = 0,
      redirect_unallocated_amount = 0
  WHERE id = v_action_id;
  INSERT INTO public.acct_gl_bridge_log (
    source_table, source_id, event_type, status, journal_entry_id, created_at
  )
  SELECT
    'mmp_site_entries', SITE, 'enumerator_fee_paid', 'success',
    v_original_journal_id, now()
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.acct_gl_bridge_log
    WHERE source_table = 'mmp_site_entries'
      AND source_id = SITE
      AND event_type = 'enumerator_fee_paid'
      AND journal_entry_id = v_original_journal_id
  );
  UPDATE public.mmp_site_entries
  SET enumerator_fee = 1000,
      transport_fee = 0,
      fee_paid_status = 'paid',
      fee_paid_amount = 1000,
      fee_paid_at = (SELECT executed_at FROM public.cycle_exception_actions WHERE id = v_action_id),
      fee_paid_by = (SELECT executed_by FROM public.cycle_exception_actions WHERE id = v_action_id),
      fee_cash_paid_amount = 1000,
      fee_advance_offset_amount = 0,
      fee_unallocated_amount = 0,
      fee_payment_method = NULL,
      fee_payment_notes = NULL,
      fee_receipt_url = NULL
  WHERE id = SITE;

  INSERT INTO public.acct_funds (
    code, name_en, name_ar, restriction_type, is_active
  )
  VALUES (
    'CE54-CORRECTION', 'CE54 Correction Fund', 'CE54', 'without_restriction', true
  )
  ON CONFLICT (code) DO NOTHING;

  -- The bridge double deliberately creates header-only journals. Add the real
  -- balanced source lines required by the correction preflight.
  ALTER TABLE public.acct_journal_lines DISABLE TRIGGER USER;
  INSERT INTO public.acct_journal_lines (
    entry_id, line_no, account_id, fund_id, function,
    original_amount, original_currency,
    functional_amount, functional_currency, fx_rate,
    debit_credit, description
  )
  SELECT
    v_original_journal_id,
    line_no,
    account_id,
    (SELECT id FROM public.acct_funds WHERE code = 'CE54-CORRECTION'),
    function_name,
    1000,
    'SDG',
    1000,
    'SDG',
    1,
    debit_credit,
    description
  FROM (
    VALUES
      (1, 'ce540000-acc0-4000-8000-000000005200'::uuid, 'program', 'DR', 'Enumerator fee reclassification'),
      (2, 'ce540000-acc0-4000-8000-000000001510'::uuid, 'none', 'CR', 'Transport advance reclassification')
  ) AS lines(line_no, account_id, function_name, debit_credit, description)
  ON CONFLICT (entry_id, line_no) DO NOTHING;
  ALTER TABLE public.acct_journal_lines ENABLE TRIGGER USER;

  -- Unauthorized caller.
  PERFORM pg_temp.as_user(ENU);
  v_result := public.reopen_cycle_redirect_for_correction(
    v_action_id, 'Legacy Redirect selected the wrong source site', PERIOD, 'ce54-correction-unauthorized'
  );
  PERFORM pg_temp.assert_err('Redirect correction rejects unauthorized caller', v_result, 'Only Super Admin');

  PERFORM pg_temp.as_user(FIN);

  -- Missing original journal reference.
  UPDATE public.cycle_exception_actions
  SET gl_journal_entry_id = NULL
  WHERE id = v_action_id;
  v_result := public.reopen_cycle_redirect_for_correction(
    v_action_id, 'Legacy Redirect selected the wrong source site', PERIOD, 'ce54-correction-no-journal'
  );
  PERFORM pg_temp.assert_err('Redirect correction rejects missing journal', v_result, 'no GL journal');
  UPDATE public.cycle_exception_actions
  SET gl_journal_entry_id = v_original_journal_id
  WHERE id = v_action_id;

  -- Closed/invalid period.
  UPDATE public.acct_fiscal_periods SET status = 'hard_closed' WHERE id = PERIOD;
  v_result := public.reopen_cycle_redirect_for_correction(
    v_action_id, 'Legacy Redirect selected the wrong source site', PERIOD, 'ce54-correction-closed-period'
  );
  PERFORM pg_temp.assert_err('Redirect correction rejects closed period', v_result, 'open or soft-closed');
  UPDATE public.acct_fiscal_periods SET status = 'open' WHERE id = PERIOD;

  -- A separately posted reversal must block correction.
  v_reversal_id := public.acct_post_reversal(
    v_original_journal_id,
    jsonb_build_object('period_id', PERIOD, 'posting_date', current_date),
    'ce54-correction-pre-reversed'
  );
  v_result := public.reopen_cycle_redirect_for_correction(
    v_action_id, 'Legacy Redirect selected the wrong source site', PERIOD, 'ce54-correction-already-reversed'
  );
  PERFORM pg_temp.assert_err('Redirect correction rejects already-reversed journal', v_result, 'unreversed posted');
  UPDATE public.acct_journal_entries
  SET status = 'posted', reversed_by_entry_id = NULL
  WHERE id = v_original_journal_id;
  DELETE FROM public.acct_journal_entries WHERE id = v_reversal_id;

  -- Later fee settlement evidence must fail closed.
  SELECT gl_journal_entry_id
  INTO v_other_journal_id
  FROM public.cycle_exception_actions
  WHERE decision = 'return'
    AND gl_journal_entry_id IS NOT NULL
  LIMIT 1;
  INSERT INTO public.acct_gl_bridge_log (
    source_table, source_id, event_type, status, journal_entry_id, created_at
  )
  SELECT
    'mmp_site_entries', SITE, 'enumerator_fee_paid', 'success',
    v_other_journal_id, action.executed_at + interval '1 minute'
  FROM public.cycle_exception_actions action
  WHERE action.id = v_action_id;
  v_result := public.reopen_cycle_redirect_for_correction(
    v_action_id, 'Legacy Redirect selected the wrong source site', PERIOD, 'ce54-correction-later-fee'
  );
  PERFORM pg_temp.assert_err('Redirect correction rejects later fee activity', v_result, 'Later fee-settlement');
  DELETE FROM public.acct_gl_bridge_log
  WHERE source_table = 'mmp_site_entries'
    AND source_id = SITE
    AND journal_entry_id = v_other_journal_id;

  -- Successful correction.
  v_result := public.reopen_cycle_redirect_for_correction(
    v_action_id, 'Legacy Redirect selected the wrong source site', PERIOD, 'ce54-correction-success'
  );
  PERFORM pg_temp.assert_ok('legacy Redirect correction succeeds', v_result);
  v_reversal_id := (v_result->>'reversal_journal_entry_id')::uuid;
  v_replacement_id := (v_result->>'replacement_action_id')::uuid;

  SELECT status INTO v_status
  FROM public.down_payment_requests
  WHERE id = ADVANCE;
  PERFORM pg_temp.assert_txt('correction restores paid advance', v_status, 'paid');

  SELECT fee_paid_status INTO v_status
  FROM public.mmp_site_entries
  WHERE id = SITE;
  PERFORM pg_temp.assert_txt('correction restores source fee to unpaid', v_status, 'unpaid');

  SELECT count(*) INTO v_count
  FROM public.cycle_exception_actions
  WHERE id = v_action_id
    AND executed = true
    AND correction_status = 'reopened_for_correction'
    AND correction_reversal_journal_id = v_reversal_id
    AND correction_replacement_action_id = v_replacement_id;
  PERFORM pg_temp.assert_eq('original action retained with correction audit', v_count, 1);

  SELECT count(*) INTO v_count
  FROM public.cycle_exception_actions
  WHERE id = v_replacement_id
    AND advance_id = ADVANCE
    AND executed = false
    AND action_payload->>'reopened_from_action_id' = v_action_id::text;
  PERFORM pg_temp.assert_eq('pending replacement action created', v_count, 1);

  SELECT count(*) INTO v_count
  FROM public.acct_gl_bridge_log
  WHERE source_table = 'mmp_site_entries'
    AND source_id = SITE
    AND journal_entry_id = v_original_journal_id
    AND status = 'success';
  PERFORM pg_temp.assert_eq('original bridge success row remains intact', v_count, 1);

  SELECT count(*) INTO v_count
  FROM public.acct_gl_bridge_reversal_links
  WHERE correction_action_id = v_action_id
    AND original_journal_entry_id = v_original_journal_id
    AND reversal_journal_entry_id = v_reversal_id;
  PERFORM pg_temp.assert_eq('bridge reversal link is auditable', v_count, 1);

  -- Same request is idempotent and returns the original correction.
  v_result := public.reopen_cycle_redirect_for_correction(
    v_action_id, 'Legacy Redirect selected the wrong source site', PERIOD, 'ce54-correction-success'
  );
  PERFORM pg_temp.assert_ok('correction retry is idempotent', v_result);
  PERFORM pg_temp.assert_true(
    'correction retry returns same reversal and replacement',
    coalesce((v_result->>'already_corrected')::boolean, false)
    AND (v_result->>'reversal_journal_entry_id')::uuid = v_reversal_id
    AND (v_result->>'replacement_action_id')::uuid = v_replacement_id
  );

  -- The shared reversal guard rejects a second reversal with a different key.
  BEGIN
    INSERT INTO public.acct_journal_entries (
      period_id, posting_date, description_en, source_type, source_id,
      status, idempotency_key, created_by
    ) VALUES (
      PERIOD, current_date, 'Illegal second reversal', 'reversal',
      v_original_journal_id, 'posted', 'ce54-correction-second-reversal', FIN
    );
    RAISE EXCEPTION 'SECOND_REVERSAL_NOT_BLOCKED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'SECOND_REVERSAL_NOT_BLOCKED' THEN
      RAISE EXCEPTION 'FAIL [shared reversal guard]: duplicate reversal was inserted';
    END IF;
    IF SQLERRM NOT ILIKE '%ORIGINAL_NOT_REVERSIBLE%' THEN
      RAISE EXCEPTION 'FAIL [shared reversal guard]: unexpected error: %', SQLERRM;
    END IF;
  END;

  -- Restored paid advance plus pending action are visible to the close gate.
  BEGIN
    UPDATE public.mmp_files SET cycle_status = 'closed' WHERE id = MMP;
    RAISE EXCEPTION 'CORRECTION_CLOSE_GATE_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'CORRECTION_CLOSE_GATE_NOT_RAISED' THEN
      RAISE EXCEPTION 'FAIL [correction close gate]: reopened advance did not block close';
    END IF;
    IF SQLERRM NOT ILIKE '%CYCLE_CLOSE_GATE%' THEN
      RAISE EXCEPTION 'FAIL [correction close gate]: unexpected error: %', SQLERRM;
    END IF;
  END;

  RAISE NOTICE 'PASS [legacy Redirect correction and reversal audit regression].';
END;
$correction_test$;

-- ---------------------------------------------------------------------------
-- 10. Historical reconciliation regression. A separate legacy Redirect is
--     intentionally restored and paid again, then only the old accounting is
--     reversed. The current advance row must remain byte-for-byte unchanged.
-- ---------------------------------------------------------------------------
DO $historical_reconciliation_test$
DECLARE
  FIN constant uuid := 'ce540000-0000-4000-8000-000000000002';
  H_MMP constant uuid := 'ce54c00b-0000-4000-8000-00000000000b';
  H_SOURCE constant uuid := 'ce54c00b-0000-4000-8000-0000000000ab';
  H_CURRENT constant uuid := 'ce54c00b-0000-4000-8000-0000000000cb';
  H_ADVANCE constant uuid := 'ce54c00b-0000-4000-8000-0000000000bb';
  PERIOD constant uuid := 'ce540000-feed-4000-8000-0000000000f1';
  v_action_id uuid;
  v_original_journal_id uuid;
  v_other_journal_id uuid;
  v_temp_reversal_id uuid;
  v_reversal_id uuid;
  v_result jsonb;
  v_count bigint;
  v_before_status text;
  v_before_site_id uuid;
  v_before_metadata jsonb;
  v_after_status text;
  v_after_site_id uuid;
  v_after_metadata jsonb;
  v_lines jsonb;
  v_dr numeric;
  v_cr numeric;
BEGIN
  PERFORM pg_temp.as_user(FIN);
  UPDATE public.profiles SET role = 'superAdmin' WHERE id = FIN;
  PERFORM pg_temp.mk_case(H_MMP, H_SOURCE, H_ADVANCE, 'paid', 1000, 1000);
  PERFORM pg_temp.mk_covered_site(H_CURRENT, H_MMP, FIN::text);
  UPDATE public.mmp_site_entries SET enumerator_fee = 1000 WHERE id = H_CURRENT;

  v_result := public.execute_cycle_close_exception(
    H_MMP, H_SOURCE, H_ADVANCE, 'redirect', 1000, 'historical redirect fixture',
    NULL, H_CURRENT
  );
  PERFORM pg_temp.assert_ok('historical fixture Redirect executes', v_result);

  SELECT id, gl_journal_entry_id
  INTO v_action_id, v_original_journal_id
  FROM public.cycle_exception_actions
  WHERE advance_id = H_ADVANCE
    AND decision = 'redirect'
    AND executed = true
  ORDER BY created_at DESC
  LIMIT 1;

  PERFORM pg_temp.assert_true(
    'historical fixture has an executed Redirect journal',
    v_action_id IS NOT NULL AND v_original_journal_id IS NOT NULL
  );

  DELETE FROM public.cycle_exception_action_allocations
  WHERE action_id = v_action_id;
  UPDATE public.cycle_exception_actions
  SET target_site_id = H_SOURCE,
      redirect_fee_site_entry_id = H_SOURCE,
      redirect_allocation_count = 0,
      redirect_unallocated_amount = 0,
      redirect_fee_gross_amount = 1000,
      redirect_fee_prior_settled_amount = 0,
      redirect_fee_settled_amount = 1000,
      redirect_fee_remaining_amount = 0,
      redirect_fee_status = 'paid'
  WHERE id = v_action_id;
  INSERT INTO public.acct_gl_bridge_log (
    source_table, source_id, event_type, status, journal_entry_id, created_at
  )
  SELECT
    'mmp_site_entries', H_SOURCE, 'enumerator_fee_paid', 'success',
    v_original_journal_id, now()
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.acct_gl_bridge_log
    WHERE source_table = 'mmp_site_entries'
      AND source_id = H_SOURCE
      AND event_type = 'enumerator_fee_paid'
      AND journal_entry_id = v_original_journal_id
  );

  UPDATE public.mmp_site_entries
  SET enumerator_fee = 1000,
      transport_fee = 0,
      fee_paid_status = 'paid',
      fee_paid_amount = 1000,
      fee_paid_at = (SELECT executed_at FROM public.cycle_exception_actions WHERE id = v_action_id),
      fee_paid_by = (SELECT executed_by FROM public.cycle_exception_actions WHERE id = v_action_id),
      fee_cash_paid_amount = 1000,
      fee_advance_offset_amount = 0,
      fee_unallocated_amount = 0,
      fee_payment_method = NULL,
      fee_payment_notes = NULL,
      fee_receipt_url = NULL
  WHERE id = H_SOURCE;

  ALTER TABLE public.acct_journal_lines DISABLE TRIGGER USER;
  INSERT INTO public.acct_journal_lines (
    entry_id, line_no, account_id, fund_id, function,
    original_amount, original_currency,
    functional_amount, functional_currency, fx_rate,
    debit_credit, description
  )
  SELECT
    v_original_journal_id,
    line_no,
    account_id,
    (SELECT id FROM public.acct_funds WHERE code = 'CE54-CORRECTION'),
    function_name,
    1000,
    'SDG',
    1000,
    'SDG',
    1,
    debit_credit,
    description
  FROM (
    VALUES
      (1, 'ce540000-acc0-4000-8000-000000005200'::uuid, 'program', 'DR', 'Historical enumerator fee reclassification'),
      (2, 'ce540000-acc0-4000-8000-000000001510'::uuid, 'none', 'CR', 'Historical transport advance reclassification')
  ) AS lines(line_no, account_id, function_name, debit_credit, description)
  ON CONFLICT (entry_id, line_no) DO NOTHING;
  ALTER TABLE public.acct_journal_lines ENABLE TRIGGER USER;

  -- Simulate the later intentional reprocessing, first without the required
  -- restoration audit so the function must fail closed.
  UPDATE public.down_payment_requests
  SET status = 'fully_paid',
      mmp_site_entry_id = H_CURRENT,
      metadata = coalesce(metadata, '{}'::jsonb) - 'audit_log'
  WHERE id = H_ADVANCE;

  v_result := public.reconcile_reprocessed_cycle_redirect(
    v_action_id,
    'Reverse only the old Redirect after intentional repayment',
    PERIOD,
    'ce54-historical-no-restore-audit'
  );
  PERFORM pg_temp.assert_err(
    'historical reconciliation rejects missing restore snapshot',
    v_result,
    'no proven post-Redirect'
  );

  UPDATE public.down_payment_requests
  SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'audit_log',
    jsonb_build_array(
      jsonb_build_object(
        'action', 'restored',
        'previousValue', 'cancelled',
        'newValue', 'pending_admin',
        'timestamp', clock_timestamp() + interval '1 minute'
      )
    )
  )
  WHERE id = H_ADVANCE;

  -- Mutable fee configuration and components cannot replace the immutable
  -- snapshot stored with the Redirect action.
  UPDATE public.mmp_site_entries
  SET enumerator_fee = 1200,
      fee_paid_amount = 1200,
      fee_cash_paid_amount = 1200
  WHERE id = H_SOURCE;
  v_result := public.reconcile_reprocessed_cycle_redirect(
    v_action_id,
    'Reverse only the old Redirect after intentional repayment',
    PERIOD,
    'ce54-historical-mutated-fee'
  );
  PERFORM pg_temp.assert_err(
    'historical reconciliation rejects mutable fee drift',
    v_result,
    'exact Redirect snapshot'
  );
  UPDATE public.mmp_site_entries
  SET enumerator_fee = 1000,
      fee_paid_amount = 1000,
      fee_cash_paid_amount = 1000
  WHERE id = H_SOURCE;

  -- A separately posted reversal blocks the historical path too.
  v_temp_reversal_id := public.acct_post_reversal(
    v_original_journal_id,
    jsonb_build_object('period_id', PERIOD, 'posting_date', current_date),
    'ce54-historical-pre-reversed'
  );
  v_result := public.reconcile_reprocessed_cycle_redirect(
    v_action_id,
    'Reverse only the old Redirect after intentional repayment',
    PERIOD,
    'ce54-historical-already-reversed'
  );
  PERFORM pg_temp.assert_err(
    'historical reconciliation rejects already-reversed journal',
    v_result,
    'unreversed posted'
  );
  UPDATE public.acct_journal_entries
  SET status = 'posted', reversed_by_entry_id = NULL
  WHERE id = v_original_journal_id;
  DELETE FROM public.acct_journal_entries WHERE id = v_temp_reversal_id;

  -- Later fee activity on the legacy target must fail closed.
  SELECT gl_journal_entry_id
  INTO v_other_journal_id
  FROM public.cycle_exception_actions
  WHERE decision = 'return'
    AND gl_journal_entry_id IS NOT NULL
  LIMIT 1;
  INSERT INTO public.acct_gl_bridge_log (
    source_table, source_id, event_type, status, journal_entry_id, created_at
  )
  SELECT
    'mmp_site_entries', H_SOURCE, 'enumerator_fee_paid', 'success',
    v_other_journal_id, action.executed_at + interval '2 minutes'
  FROM public.cycle_exception_actions action
  WHERE action.id = v_action_id;

  v_result := public.reconcile_reprocessed_cycle_redirect(
    v_action_id,
    'Reverse only the old Redirect after intentional repayment',
    PERIOD,
    'ce54-historical-later-fee'
  );
  PERFORM pg_temp.assert_err(
    'historical reconciliation rejects later fee activity',
    v_result,
    'Later fee-settlement'
  );
  DELETE FROM public.acct_gl_bridge_log
  WHERE source_table = 'mmp_site_entries'
    AND source_id = H_SOURCE
    AND event_type = 'enumerator_fee_paid'
    AND journal_entry_id = v_other_journal_id;

  SELECT status, mmp_site_entry_id, metadata
  INTO v_before_status, v_before_site_id, v_before_metadata
  FROM public.down_payment_requests
  WHERE id = H_ADVANCE;

  v_result := public.reconcile_reprocessed_cycle_redirect(
    v_action_id,
    'Reverse only the old Redirect after intentional repayment',
    PERIOD,
    'ce54-historical-success'
  );
  PERFORM pg_temp.assert_ok('historical reconciliation succeeds', v_result);
  v_reversal_id := (v_result->>'reversal_journal_entry_id')::uuid;

  SELECT status, mmp_site_entry_id, metadata
  INTO v_after_status, v_after_site_id, v_after_metadata
  FROM public.down_payment_requests
  WHERE id = H_ADVANCE;

  PERFORM pg_temp.assert_true(
    'historical reconciliation preserves the current advance exactly',
    v_before_status IS NOT DISTINCT FROM v_after_status
    AND v_before_site_id IS NOT DISTINCT FROM v_after_site_id
    AND v_before_metadata IS NOT DISTINCT FROM v_after_metadata
  );
  PERFORM pg_temp.assert_true(
    'historical result reports the preserved reprocessed advance',
    coalesce((v_result->>'preserved_advance')::boolean, false)
    AND v_result->>'preserved_advance_status' = 'fully_paid'
    AND (v_result->>'preserved_advance_site_id')::uuid = H_CURRENT
    AND v_result->>'replacement_action_id' IS NULL
  );

  SELECT count(*) INTO v_count
  FROM public.cycle_exception_actions
  WHERE id = v_action_id
    AND executed = true
    AND correction_status = 'historically_reconciled'
    AND correction_reversal_journal_id = v_reversal_id
    AND correction_replacement_action_id IS NULL;
  PERFORM pg_temp.assert_eq('historical action has separate reconciliation audit', v_count, 1);

  SELECT count(*) INTO v_count
  FROM public.cycle_exception_actions
  WHERE advance_id = H_ADVANCE;
  PERFORM pg_temp.assert_eq('historical reconciliation creates no replacement action', v_count, 1);

  SELECT count(*) INTO v_count
  FROM public.mmp_site_entries
  WHERE id = H_SOURCE
    AND fee_paid_status = 'unpaid'
    AND fee_paid_amount = 0
    AND fee_cash_paid_amount = 0
    AND fee_advance_offset_amount = 0;
  PERFORM pg_temp.assert_eq('historical source fee is reset after reversal', v_count, 1);

  SELECT count(*) INTO v_count
  FROM public.acct_gl_bridge_log
  WHERE source_table = 'mmp_site_entries'
    AND source_id = H_SOURCE
    AND journal_entry_id = v_original_journal_id
    AND status = 'success';
  PERFORM pg_temp.assert_eq('historical bridge success row remains intact', v_count, 1);

  SELECT count(*) INTO v_count
  FROM public.acct_gl_bridge_reversal_links
  WHERE correction_action_id = v_action_id
    AND original_journal_entry_id = v_original_journal_id
    AND reversal_journal_entry_id = v_reversal_id;
  PERFORM pg_temp.assert_eq('historical reversal link is auditable', v_count, 1);

  -- Once the legacy Redirect is historically reconciled, a later ordinary fee
  -- payment must post the full cash amount rather than reusing the reversed
  -- advance offset.
  UPDATE public.mmp_site_entries
  SET fee_paid_status = 'paid',
      fee_paid_amount = 1000,
      fee_cash_paid_amount = 1000,
      fee_advance_offset_amount = 0,
      fee_unallocated_amount = 0,
      fee_paid_at = clock_timestamp(),
      fee_paid_by = FIN,
      fee_payment_method = 'cash'
  WHERE id = H_SOURCE;

  SELECT count(*), (array_agg(lines ORDER BY id DESC))[1]
  INTO v_count, v_lines
  FROM pg_temp.gl_double_calls
  WHERE source_table = 'mmp_site_entries'
    AND source_id = H_SOURCE
    AND event_type = 'enumerator_fee_paid';
  PERFORM pg_temp.assert_eq('post-reconciliation fee payment posts once', v_count, 1);

  SELECT
    coalesce(sum(CASE WHEN line->>'debit_credit' = 'DR' THEN (line->>'amount')::numeric ELSE 0 END), 0),
    coalesce(sum(CASE WHEN line->>'debit_credit' = 'CR' THEN (line->>'amount')::numeric ELSE 0 END), 0)
  INTO v_dr, v_cr
  FROM jsonb_array_elements(v_lines) line;
  PERFORM pg_temp.assert_true(
    'post-reconciliation fee payment posts full cash without old offset',
    v_dr = 1000 AND v_cr = 1000
  );

  v_result := public.reconcile_reprocessed_cycle_redirect(
    v_action_id,
    'Reverse only the old Redirect after intentional repayment',
    PERIOD,
    'ce54-historical-success'
  );
  PERFORM pg_temp.assert_ok('historical retry is idempotent', v_result);
  PERFORM pg_temp.assert_true(
    'historical retry returns the same reversal without a replacement',
    coalesce((v_result->>'already_corrected')::boolean, false)
    AND (v_result->>'reversal_journal_entry_id')::uuid = v_reversal_id
    AND v_result->>'replacement_action_id' IS NULL
  );

  RAISE NOTICE 'PASS [historical Redirect reconciliation preserves later payment].';
END;
$historical_reconciliation_test$;

-- ---------------------------------------------------------------------------
-- 11. Reprocessed-payment reversal regression (Task #562).
--
--   A legacy Redirect whose advance was RESTORED (cancelled -> pending) and then
--   PAID AGAIN (one full down-payment journal + one wallet debit) is reversed by
--   reverse_reprocessed_cycle_redirect_for_correction(). This exercises:
--     * mandatory high-risk confirmation flag,
--     * authorization (unauthorized caller rejected),
--     * missing later journal / mixed success+error bridge history,
--     * mismatched current paid delta,
--     * malformed and missing wallet provenance,
--     * insufficient/ambiguous wallet effect,
--     * the full happy path: reverses BOTH the original Redirect journal and the
--       later payment journal (preserving country_id + per-line company_id on the
--       reversals), marks the later wallet row reversed without deleting it,
--       restores the exact original paid amount/status/site/original refs, drops
--       the stale exception_action_id, resets the fee, records parent + child
--       audits, flips the old action to reprocessed_payment_reversed, and creates
--       exactly one unexecuted replacement action,
--     * same-key idempotency (no duplicate audit links), different-key rejection,
--     * restored advance + new unexecuted action block Final Close,
--     * atomicity: a deliberate wallet/GL total mismatch after the original
--       reversal would begin leaves the original journal/fee/later journal intact.
--
--   The test uses the same country_id/company_id-preserving acct_post_reversal
--   double installed above, and the seeded CE54 country + fund.
-- ---------------------------------------------------------------------------
DO $reprocessed_reversal_test$
DECLARE
  MGR  constant uuid := 'ce540000-0000-4000-8000-000000000001';
  FIN  constant uuid := 'ce540000-0000-4000-8000-000000000002';
  ENU  constant uuid := 'ce540000-0000-4000-8000-000000000003';
  CTRY constant uuid := 'ce540000-c001-4000-8000-000000000c01';
  PERIOD constant uuid := 'ce540000-feed-4000-8000-0000000000f1';

  R_MMP    constant uuid := 'ce54c010-0000-4000-8000-000000000010';
  R_SOURCE constant uuid := 'ce54c010-0000-4000-8000-0000000000a0';
  R_TARGET constant uuid := 'ce54c010-0000-4000-8000-0000000000a1';
  R_ADVANCE constant uuid := 'ce54c010-0000-4000-8000-0000000000b0';
  R_COMPANY constant uuid := 'ce54c010-0000-4000-8000-0000000000c0';
  R_WALLET constant uuid := 'ce54c010-0000-4000-8000-0000000000d0';
  ORIG_WT constant uuid := 'ce54c010-0000-4000-8000-0000000000e0';
  LATER_WT constant uuid := 'ce54c010-0000-4000-8000-0000000000e1';
  LATER_JE constant uuid := 'ce54c010-0000-4000-8000-0000000000f1';

  v_action_id uuid;
  v_original_journal_id uuid;
  v_fund_id uuid;
  v_result jsonb;
  v_count bigint;
  v_status text;
  v_num numeric;
  v_uuid uuid;
  v_reversal_id uuid;
  v_later_reversal_id uuid;
  v_replacement_id uuid;
  v_parent_id uuid;
  v_restore_ts timestamptz := clock_timestamp() + interval '5 minutes';
  v_later_ts timestamptz := clock_timestamp() + interval '10 minutes';
  v_before_journal_status text;
  v_before_fee_status text;
  v_before_later_status text;
  v_reason constant text := 'Reverse reprocessed Redirect payment after intentional repayment';
BEGIN
  PERFORM pg_temp.as_user(FIN);
  UPDATE public.profiles SET role = 'superAdmin' WHERE id = FIN;
  UPDATE public.profiles SET role = 'enumerator' WHERE id = ENU;

  -- A company so the original journal lines can carry a per-line company_id that
  -- the reversal must preserve.
  INSERT INTO public.companies (id, code, name_en, name_ar, is_active)
  VALUES (R_COMPANY, 'CE54RP', 'CE54 Reprocess Co', 'شركة اختبار', true)
  ON CONFLICT (id) DO NOTHING;

  SELECT id INTO v_fund_id FROM public.acct_funds WHERE code = 'CE54-CORRECTION';
  IF v_fund_id IS NULL THEN
    INSERT INTO public.acct_funds (code, name_en, name_ar, restriction_type, is_active)
    VALUES ('CE54-CORRECTION', 'CE54 Correction Fund', 'CE54', 'without_restriction', true)
    ON CONFLICT (code) DO NOTHING;
    SELECT id INTO v_fund_id FROM public.acct_funds WHERE code = 'CE54-CORRECTION';
  END IF;

  -- Source cycle assigned to CE54 so the reversal must preserve a non-null
  -- country_id.
  INSERT INTO public.mmp_files (id, cycle_status, status, country_id)
  VALUES (R_MMP, 'open', 'active', CTRY)
  ON CONFLICT (id) DO NOTHING;

  PERFORM pg_temp.mk_case(R_MMP, R_SOURCE, R_ADVANCE, 'paid', 1000, 1000, FIN::text);
  PERFORM pg_temp.mk_covered_site(R_TARGET, R_MMP, FIN::text);
  UPDATE public.mmp_site_entries SET enumerator_fee = 1000 WHERE id = R_TARGET;

  -- Execute one explicit single-target Redirect; the correction RPC deliberately
  -- rejects ambiguous multi-target allocation history.
  v_result := public.execute_cycle_close_exception(
    R_MMP, R_SOURCE, R_ADVANCE, 'redirect', 1000, 'reprocessed redirect fixture',
    NULL, R_TARGET
  );
  PERFORM pg_temp.assert_ok('reprocessed fixture Redirect executes', v_result);

  SELECT id, gl_journal_entry_id
  INTO v_action_id, v_original_journal_id
  FROM public.cycle_exception_actions
  WHERE advance_id = R_ADVANCE
    AND decision = 'redirect'
    AND executed = true
  ORDER BY created_at DESC
  LIMIT 1;

  PERFORM pg_temp.assert_true(
    'reprocessed fixture has an executed Redirect journal',
    v_action_id IS NOT NULL AND v_original_journal_id IS NOT NULL
  );

  -- Immutable full-settlement fee snapshot on the action.
  DELETE FROM public.cycle_exception_action_allocations
  WHERE action_id = v_action_id;
  UPDATE public.cycle_exception_actions
  SET target_site_id = R_SOURCE,
      redirect_fee_site_entry_id = R_SOURCE,
      redirect_allocation_count = 0,
      redirect_unallocated_amount = 0,
      redirect_fee_gross_amount = 1000,
      redirect_fee_prior_settled_amount = 0,
      redirect_fee_settled_amount = 1000,
      redirect_fee_remaining_amount = 0,
      redirect_fee_status = 'paid'
  WHERE id = v_action_id;
  INSERT INTO public.acct_gl_bridge_log (
    source_table, source_id, event_type, status, journal_entry_id, created_at
  )
  SELECT
    'mmp_site_entries', R_SOURCE, 'enumerator_fee_paid', 'success',
    v_original_journal_id, now()
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.acct_gl_bridge_log
    WHERE source_table = 'mmp_site_entries'
      AND source_id = R_SOURCE
      AND event_type = 'enumerator_fee_paid'
      AND journal_entry_id = v_original_journal_id
  );

  -- Exact legacy fee state on the source fee site.
  UPDATE public.mmp_site_entries
  SET enumerator_fee = 1000,
      transport_fee = 0,
      fee_paid_status = 'paid',
      fee_paid_amount = 1000,
      fee_paid_at = (SELECT executed_at FROM public.cycle_exception_actions WHERE id = v_action_id),
      fee_paid_by = (SELECT executed_by FROM public.cycle_exception_actions WHERE id = v_action_id),
      fee_cash_paid_amount = 1000,
      fee_advance_offset_amount = 0,
      fee_unallocated_amount = 0,
      fee_payment_method = NULL,
      fee_payment_notes = NULL,
      fee_receipt_url = NULL
  WHERE id = R_SOURCE;

  -- Give the original Redirect journal country_id + balanced source lines whose
  -- company_id the reversal must carry across.
  UPDATE public.acct_journal_entries SET country_id = CTRY WHERE id = v_original_journal_id;
  ALTER TABLE public.acct_journal_lines DISABLE TRIGGER USER;
  INSERT INTO public.acct_journal_lines (
    entry_id, line_no, account_id, fund_id, function, company_id,
    original_amount, original_currency,
    functional_amount, functional_currency, fx_rate,
    debit_credit, description
  )
  SELECT
    v_original_journal_id, line_no, account_id, v_fund_id, function_name, R_COMPANY,
    1000, 'SDG', 1000, 'SDG', 1, debit_credit, description
  FROM (
    VALUES
      (1, 'ce540000-acc0-4000-8000-000000005200'::uuid, 'program', 'DR', 'Reprocessed enumerator fee reclassification'),
      (2, 'ce540000-acc0-4000-8000-000000001510'::uuid, 'none', 'CR', 'Reprocessed transport advance reclassification')
  ) AS lines(line_no, account_id, function_name, debit_credit, description)
  ON CONFLICT (entry_id, line_no) DO NOTHING;

  -- Later full-payment journal for the reprocessed advance: posted, unreversed,
  -- balanced, with its own company_id and a matching success bridge log.
  INSERT INTO public.acct_journal_entries (
    id, period_id, posting_date, description_en, source_type, source_id, status,
    idempotency_key, country_id, created_by, posted_at, posted_by
  ) VALUES (
    LATER_JE, PERIOD, current_date, 'Reprocessed advance fully paid',
    'down_payment_requests', R_ADVANCE, 'posted',
    'ce54-reprocessed-later-payment', CTRY, FIN, now(), FIN
  )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.acct_journal_lines (
    entry_id, line_no, account_id, fund_id, function, company_id,
    original_amount, original_currency,
    functional_amount, functional_currency, fx_rate,
    debit_credit, description
  )
  SELECT
    LATER_JE, line_no, account_id, v_fund_id, function_name, R_COMPANY,
    1000, 'SDG', 1000, 'SDG', 1, debit_credit, description
  FROM (
    VALUES
      (1, 'ce540000-acc0-4000-8000-000000001510'::uuid, 'program', 'DR', 'Reprocessed advance debit'),
      (2, 'ce540000-acc0-4000-8000-000000001010'::uuid, 'none', 'CR', 'Reprocessed advance cash out')
  ) AS lines(line_no, account_id, function_name, debit_credit, description)
  ON CONFLICT (entry_id, line_no) DO NOTHING;
  ALTER TABLE public.acct_journal_lines ENABLE TRIGGER USER;

  INSERT INTO public.acct_gl_bridge_log (
    source_table, source_id, event_type, status, journal_entry_id, amount, created_at
  ) VALUES (
    'down_payment_requests', R_ADVANCE, 'down_payment_fully_paid', 'success',
    LATER_JE, 1000, v_later_ts
  );

  -- Wallet + wallet transactions: one original (pre-Redirect) debit that must be
  -- preserved, and one later (post-restore) debit that must be reversed.
  -- The advance's requested_by (from mk_case) is MGR; the wallet + both wallet
  -- transactions must belong to that same user for the RPC's provenance checks.
  -- Clear any pre-existing wallet for MGR (unique on user_id) and its rows first.
  DELETE FROM public.wallet_transactions
  WHERE wallet_id IN (
    SELECT id FROM public.wallets WHERE user_id = MGR AND id <> R_WALLET
  );
  DELETE FROM public.wallets WHERE user_id = MGR AND id <> R_WALLET;
  INSERT INTO public.wallets (
    id, user_id, currency, balance_cents, total_earned_cents,
    balances, total_earned
  ) VALUES (
    R_WALLET, MGR, 'SDG', 100000, 100000,
    jsonb_build_object('SDG', 1000), 1000
  )
  ON CONFLICT (id) DO UPDATE SET balance_cents = EXCLUDED.balance_cents,
    total_earned_cents = EXCLUDED.total_earned_cents,
    balances = EXCLUDED.balances, total_earned = EXCLUDED.total_earned;

  INSERT INTO public.wallet_transactions (
    id, wallet_id, user_id, amount_cents, amount, currency, type, status,
    balance_before, balance_after, metadata, created_at
  ) VALUES (
    ORIG_WT, R_WALLET, MGR, 100000, 1000, 'SDG', 'down_payment', 'posted',
    0, 0, jsonb_build_object('down_payment_request_id', R_ADVANCE::text),
    clock_timestamp()
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.wallet_transactions (
    id, wallet_id, user_id, amount_cents, amount, currency, type, status,
    balance_before, balance_after, metadata, created_at
  ) VALUES (
    LATER_WT, R_WALLET, MGR, 100000, 1000, 'SDG', 'down_payment', 'posted',
    0, 1000, jsonb_build_object('down_payment_request_id', R_ADVANCE::text),
    v_later_ts
  )
  ON CONFLICT (id) DO NOTHING;

  -- Reprocess the advance: record one later full-payment increment on top of the
  -- original paid total, carrying BOTH wallet refs and the restore audit. The
  -- immutable requested/approved amount remains the original 1000.
  UPDATE public.down_payment_requests
  SET status = 'fully_paid',
      total_paid_amount = 2000,
      payment_type = 'full_advance',
      wallet_transaction_ids = jsonb_build_array(ORIG_WT::text, LATER_WT::text),
      payment_proof_url = 'https://proof.example/ce54-reprocessed.pdf',
      payment_proof_uploaded_at = v_later_ts,
      metadata = jsonb_build_object(
        'exception_action_id', v_action_id::text,
        'audit_log', jsonb_build_array(
          jsonb_build_object(
            'action', 'restored',
            'previousValue', 'cancelled',
            'newValue', 'pending_admin',
            'timestamp', to_char(v_restore_ts, 'YYYY-MM-DD"T"HH24:MI:SS')
          )
        )
      )
  WHERE id = R_ADVANCE;

  -- The action recorded the ORIGINAL paid amount (1000) and the original wallet
  -- provenance (only the original wallet transaction).
  UPDATE public.cycle_exception_actions
  SET advance_amount = 1000,
      advance_status = 'paid',
      source_payment_references = jsonb_build_array(ORIG_WT::text)
  WHERE id = v_action_id;

  -- ── Rejection: confirmation flag false ────────────────────────────────────
  v_result := public.reverse_reprocessed_cycle_redirect_for_correction(
    v_action_id, v_reason, PERIOD, 'ce54-reprocessed-confirm', false
  );
  PERFORM pg_temp.assert_err('reprocessed reversal rejects unconfirmed high-risk call',
    v_result, 'confirm the high-risk reversal');

  -- ── Rejection: unauthorized caller (enumerator) ───────────────────────────
  PERFORM pg_temp.as_user(ENU);
  v_result := public.reverse_reprocessed_cycle_redirect_for_correction(
    v_action_id, v_reason, PERIOD, 'ce54-reprocessed-unauthorized', true
  );
  PERFORM pg_temp.assert_err('reprocessed reversal rejects unauthorized caller',
    v_result, 'Only Super Admin');
  PERFORM pg_temp.as_user(FIN);

  -- ── Rejection: mismatched current paid delta ──────────────────────────────
  -- Current delta is 2000-1000=1000 = later GL total, which is valid. Break it
  -- temporarily by inflating the current paid total so the delta no longer
  -- equals the proven later GL total.
  UPDATE public.down_payment_requests SET total_paid_amount = 2100 WHERE id = R_ADVANCE;
  v_result := public.reverse_reprocessed_cycle_redirect_for_correction(
    v_action_id, v_reason, PERIOD, 'ce54-reprocessed-delta', true
  );
  PERFORM pg_temp.assert_err('reprocessed reversal rejects mismatched paid delta',
    v_result, 'current paid delta');
  UPDATE public.down_payment_requests SET total_paid_amount = 2000 WHERE id = R_ADVANCE;

  -- ── Rejection: mixed success/error later-payment bridge history ────────────
  INSERT INTO public.acct_gl_bridge_log (
    source_table, source_id, event_type, status, error_message, amount, created_at
  ) VALUES (
    'down_payment_requests', R_ADVANCE, 'down_payment_fully_paid', 'error',
    'simulated later posting failure', 1000, v_later_ts + interval '1 minute'
  );
  v_result := public.reverse_reprocessed_cycle_redirect_for_correction(
    v_action_id, v_reason, PERIOD, 'ce54-reprocessed-mixed', true
  );
  PERFORM pg_temp.assert_err('reprocessed reversal rejects mixed later bridge history',
    v_result, 'payment bridge attempt failed');
  DELETE FROM public.acct_gl_bridge_log
  WHERE source_table = 'down_payment_requests'
    AND source_id = R_ADVANCE
    AND status = 'error';

  -- ── Rejection: missing later journal ──────────────────────────────────────
  UPDATE public.acct_gl_bridge_log
  SET created_at = v_restore_ts - interval '1 minute'
  WHERE source_table = 'down_payment_requests'
    AND source_id = R_ADVANCE
    AND status = 'success';
  v_result := public.reverse_reprocessed_cycle_redirect_for_correction(
    v_action_id, v_reason, PERIOD, 'ce54-reprocessed-nolater', true
  );
  PERFORM pg_temp.assert_err('reprocessed reversal rejects missing later journal',
    v_result, 'no post-restore payment journal');
  UPDATE public.acct_gl_bridge_log
  SET created_at = v_later_ts
  WHERE source_table = 'down_payment_requests'
    AND source_id = R_ADVANCE
    AND status = 'success';

  -- ── Rejection: malformed / missing wallet provenance ──────────────────────
  UPDATE public.cycle_exception_actions
  SET source_payment_references = jsonb_build_array('not-a-uuid')
  WHERE id = v_action_id;
  v_result := public.reverse_reprocessed_cycle_redirect_for_correction(
    v_action_id, v_reason, PERIOD, 'ce54-reprocessed-badref', true
  );
  PERFORM pg_temp.assert_err('reprocessed reversal rejects malformed wallet provenance',
    v_result, 'not a UUID');

  -- Unknown root shapes are not equivalent to an explicit empty provenance
  -- snapshot. Each must fail closed even if a payment proof exists.
  UPDATE public.cycle_exception_actions
  SET source_payment_references = 'null'::jsonb
  WHERE id = v_action_id;
  v_result := public.reverse_reprocessed_cycle_redirect_for_correction(
    v_action_id, v_reason, PERIOD, 'ce54-reprocessed-original-null', true
  );
  PERFORM pg_temp.assert_err('reprocessed reversal rejects JSON-null original wallet provenance',
    v_result, 'explicit JSON array');
  UPDATE public.cycle_exception_actions
  SET source_payment_references = jsonb_build_object('wallet_id', ORIG_WT::text)
  WHERE id = v_action_id;
  v_result := public.reverse_reprocessed_cycle_redirect_for_correction(
    v_action_id, v_reason, PERIOD, 'ce54-reprocessed-original-object', true
  );
  PERFORM pg_temp.assert_err('reprocessed reversal rejects object original wallet provenance',
    v_result, 'explicit JSON array');
  UPDATE public.cycle_exception_actions
  SET source_payment_references = to_jsonb(ORIG_WT::text)
  WHERE id = v_action_id;
  v_result := public.reverse_reprocessed_cycle_redirect_for_correction(
    v_action_id, v_reason, PERIOD, 'ce54-reprocessed-original-scalar', true
  );
  PERFORM pg_temp.assert_err('reprocessed reversal rejects scalar original wallet provenance',
    v_result, 'explicit JSON array');
  UPDATE public.cycle_exception_actions
  SET source_payment_references = jsonb_build_array(ORIG_WT::text)
  WHERE id = v_action_id;

  UPDATE public.down_payment_requests
  SET wallet_transaction_ids = 'null'::jsonb
  WHERE id = R_ADVANCE;
  v_result := public.reverse_reprocessed_cycle_redirect_for_correction(
    v_action_id, v_reason, PERIOD, 'ce54-reprocessed-current-null', true
  );
  PERFORM pg_temp.assert_err('reprocessed reversal rejects JSON-null current wallet provenance',
    v_result, 'explicit JSON array');
  UPDATE public.down_payment_requests
  SET wallet_transaction_ids = jsonb_build_object('wallet_id', LATER_WT::text)
  WHERE id = R_ADVANCE;
  v_result := public.reverse_reprocessed_cycle_redirect_for_correction(
    v_action_id, v_reason, PERIOD, 'ce54-reprocessed-current-object', true
  );
  PERFORM pg_temp.assert_err('reprocessed reversal rejects object current wallet provenance',
    v_result, 'explicit JSON array');
  UPDATE public.down_payment_requests
  SET wallet_transaction_ids = to_jsonb(LATER_WT::text)
  WHERE id = R_ADVANCE;
  v_result := public.reverse_reprocessed_cycle_redirect_for_correction(
    v_action_id, v_reason, PERIOD, 'ce54-reprocessed-current-scalar', true
  );
  PERFORM pg_temp.assert_err('reprocessed reversal rejects scalar current wallet provenance',
    v_result, 'explicit JSON array');
  UPDATE public.down_payment_requests
  SET wallet_transaction_ids = jsonb_build_array(ORIG_WT::text, LATER_WT::text)
  WHERE id = R_ADVANCE;
  SELECT status::text INTO v_status
  FROM public.wallet_transactions WHERE id = ORIG_WT;
  PERFORM pg_temp.assert_txt('malformed provenance never reverses the original wallet row',
    v_status, 'posted');

  -- Missing provenance: the original ref no longer present on the current advance.
  UPDATE public.cycle_exception_actions
  SET source_payment_references =
    jsonb_build_array('ce54c010-0000-4000-8000-0000000000ee')
  WHERE id = v_action_id;
  v_result := public.reverse_reprocessed_cycle_redirect_for_correction(
    v_action_id, v_reason, PERIOD, 'ce54-reprocessed-missingref', true
  );
  PERFORM pg_temp.assert_err('reprocessed reversal rejects missing original wallet reference',
    v_result, 'no longer contains all original references');
  UPDATE public.cycle_exception_actions
  SET source_payment_references = jsonb_build_array(ORIG_WT::text)
  WHERE id = v_action_id;

  -- ── Rejection: ambiguous wallet effect (posted row with no balance effect) ─
  UPDATE public.wallet_transactions
  SET balance_before = 500, balance_after = 500
  WHERE id = LATER_WT;
  v_result := public.reverse_reprocessed_cycle_redirect_for_correction(
    v_action_id, v_reason, PERIOD, 'ce54-reprocessed-ambeffect', true
  );
  PERFORM pg_temp.assert_err('reprocessed reversal rejects ambiguous wallet effect',
    v_result, 'no recorded balance effect');

  -- Insufficient wallet balance to prove an exact reversal.
  UPDATE public.wallet_transactions
  SET balance_before = 0, balance_after = 1000
  WHERE id = LATER_WT;
  UPDATE public.wallets
  SET balance_cents = 0, total_earned_cents = 0,
      balances = jsonb_build_object('SDG', 0), total_earned = 0
  WHERE id = R_WALLET;
  v_result := public.reverse_reprocessed_cycle_redirect_for_correction(
    v_action_id, v_reason, PERIOD, 'ce54-reprocessed-insufficient', true
  );
  PERFORM pg_temp.assert_err('reprocessed reversal rejects insufficient wallet balance',
    v_result, 'cannot prove an exact reversal');
  UPDATE public.wallets
  SET balance_cents = 100000, total_earned_cents = 100000,
      balances = jsonb_build_object('SDG', 1000), total_earned = 1000
  WHERE id = R_WALLET;

  -- ── Supported web shape: pending audit row with zero wallet balance effect ─
  -- Run the complete success path inside a deliberate subtransaction rollback so
  -- the credited mobile-style fixture remains available for the final happy path.
  BEGIN
    UPDATE public.wallet_transactions
    SET status = 'pending', balance_before = 0, balance_after = 0
    WHERE id = LATER_WT;
    SELECT (balances->>'SDG')::numeric INTO v_num
    FROM public.wallets WHERE id = R_WALLET;
    v_result := public.reverse_reprocessed_cycle_redirect_for_correction(
      v_action_id, v_reason, PERIOD, 'ce54-reprocessed-web-zero-effect', true
    );
    PERFORM pg_temp.assert_ok('web zero-effect wallet reversal succeeds', v_result);
    SELECT status::text INTO v_status
    FROM public.wallet_transactions WHERE id = LATER_WT;
    PERFORM pg_temp.assert_txt('web pending wallet row is marked reversed', v_status, 'reversed');
    PERFORM pg_temp.assert_true(
      'web zero-effect wallet reversal leaves wallet balance unchanged',
      (SELECT (balances->>'SDG')::numeric FROM public.wallets WHERE id = R_WALLET) = v_num
    );
    RAISE EXCEPTION USING
      ERRCODE = 'P562W',
      MESSAGE = 'ROLLBACK_WEB_ZERO_EFFECT_PROBE';
  EXCEPTION WHEN SQLSTATE 'P562W' THEN
    IF SQLERRM <> 'ROLLBACK_WEB_ZERO_EFFECT_PROBE' THEN
      RAISE;
    END IF;
  END;
  SELECT status::text INTO v_status
  FROM public.wallet_transactions WHERE id = LATER_WT;
  PERFORM pg_temp.assert_txt('web probe rollback restores mobile credited fixture',
    v_status, 'posted');
  SELECT count(*) INTO v_count
  FROM public.cycle_redirect_reprocessed_reversals
  WHERE correction_action_id = v_action_id;
  PERFORM pg_temp.assert_eq('web probe rollback leaves no audit row', v_count, 0);

  -- ── Atomicity: force a wallet/GL total mismatch AFTER the original reversal
  --    would begin, and prove nothing was left mutated ────────────────────────
  SELECT status::text INTO v_before_journal_status
  FROM public.acct_journal_entries WHERE id = v_original_journal_id;
  SELECT fee_paid_status INTO v_before_fee_status
  FROM public.mmp_site_entries WHERE id = R_SOURCE;
  SELECT status::text INTO v_before_later_status
  FROM public.acct_journal_entries WHERE id = LATER_JE;

  -- Inflate the later wallet amount so wallet total (2000) no longer equals the
  -- later GL total (1000): the RPC reverses the original journal + later journal,
  -- marks the wallet row and undoes its (provable) balance effect, then hits the
  -- wallet/GL reconciliation and rolls the ENTIRE transaction back. Give the
  -- wallet enough balance so the per-row effect is provable and only the final
  -- total reconciliation fails.
  UPDATE public.wallets
  SET balance_cents = 500000, total_earned_cents = 500000,
      balances = jsonb_build_object('SDG', 5000), total_earned = 5000
  WHERE id = R_WALLET;
  UPDATE public.wallet_transactions
  SET amount = 2000, amount_cents = 200000, balance_before = 0, balance_after = 2000
  WHERE id = LATER_WT;
  v_result := public.reverse_reprocessed_cycle_redirect_for_correction(
    v_action_id, v_reason, PERIOD, 'ce54-reprocessed-atomicfail', true
  );
  PERFORM pg_temp.assert_err('reprocessed reversal fails on wallet/GL total mismatch',
    v_result, 'does not equal GL total');

  SELECT status::text INTO v_status FROM public.acct_journal_entries WHERE id = v_original_journal_id;
  PERFORM pg_temp.assert_txt('atomicity: original Redirect journal unchanged',
    v_status, v_before_journal_status);
  SELECT fee_paid_status INTO v_status FROM public.mmp_site_entries WHERE id = R_SOURCE;
  PERFORM pg_temp.assert_txt('atomicity: source fee unchanged', v_status, v_before_fee_status);
  SELECT status::text INTO v_status FROM public.acct_journal_entries WHERE id = LATER_JE;
  PERFORM pg_temp.assert_txt('atomicity: later payment journal unchanged',
    v_status, v_before_later_status);
  SELECT count(*) INTO v_count
  FROM public.cycle_redirect_reprocessed_reversals WHERE correction_action_id = v_action_id;
  PERFORM pg_temp.assert_eq('atomicity: no parent audit row survived the rollback', v_count, 0);
  SELECT correction_status INTO v_status
  FROM public.cycle_exception_actions WHERE id = v_action_id;
  PERFORM pg_temp.assert_true('atomicity: action correction_status still null',
    v_status IS NULL);

  -- Restore the valid full-payment wallet row.
  UPDATE public.wallet_transactions
  SET amount = 1000, amount_cents = 100000, balance_before = 0, balance_after = 1000
  WHERE id = LATER_WT;

  -- ── Happy path: full reprocessed-payment reversal ─────────────────────────
  v_result := public.reverse_reprocessed_cycle_redirect_for_correction(
    v_action_id, v_reason, PERIOD, 'ce54-reprocessed-success', true
  );
  PERFORM pg_temp.assert_ok('reprocessed reversal succeeds', v_result);
  v_reversal_id := (v_result->>'reversal_journal_entry_id')::uuid;
  v_replacement_id := (v_result->>'replacement_action_id')::uuid;
  PERFORM pg_temp.assert_txt('reprocessed reversal reports mode',
    v_result->>'correction_mode', 'reprocessed_payment_reversed');
  PERFORM pg_temp.assert_true('reprocessed reversal reports one later journal + one wallet',
    (v_result->>'later_journal_reversal_count')::int = 1
    AND (v_result->>'later_wallet_reversal_count')::int = 1);

  -- Original Redirect journal reversed; reversal preserves country_id + company_id.
  SELECT status::text INTO v_status FROM public.acct_journal_entries WHERE id = v_original_journal_id;
  PERFORM pg_temp.assert_txt('original Redirect journal marked reversed', v_status, 'reversed');
  SELECT country_id INTO v_uuid FROM public.acct_journal_entries WHERE id = v_reversal_id;
  PERFORM pg_temp.assert_txt('original reversal preserves country_id', v_uuid::text, CTRY::text);
  SELECT count(*) INTO v_count
  FROM public.acct_journal_lines
  WHERE entry_id = v_reversal_id AND company_id = R_COMPANY;
  PERFORM pg_temp.assert_eq('original reversal preserves per-line company_id', v_count, 2);

  -- Later payment journal reversed; its reversal also preserves country + company.
  SELECT status::text INTO v_status FROM public.acct_journal_entries WHERE id = LATER_JE;
  PERFORM pg_temp.assert_txt('later payment journal marked reversed', v_status, 'reversed');
  SELECT reversal_journal_entry_id INTO v_later_reversal_id
  FROM public.cycle_redirect_reprocessed_journal_reversals
  WHERE original_journal_entry_id = LATER_JE;
  SELECT count(*) INTO v_count
  FROM public.acct_journal_lines
  WHERE entry_id = v_later_reversal_id AND company_id = R_COMPANY;
  PERFORM pg_temp.assert_eq('later reversal preserves per-line company_id', v_count, 2);

  -- Later wallet row marked reversed, not deleted; original wallet row untouched.
  SELECT status::text INTO v_status FROM public.wallet_transactions WHERE id = LATER_WT;
  PERFORM pg_temp.assert_txt('later wallet transaction marked reversed', v_status, 'reversed');
  SELECT count(*) INTO v_count FROM public.wallet_transactions WHERE id = LATER_WT;
  PERFORM pg_temp.assert_eq('later wallet transaction is not deleted', v_count, 1);
  SELECT status::text INTO v_status FROM public.wallet_transactions WHERE id = ORIG_WT;
  PERFORM pg_temp.assert_txt('original wallet transaction preserved', v_status, 'posted');

  -- Advance restored to exact original paid amount/status/site/original refs; the
  -- stale exception_action_id marker is removed.
  SELECT status INTO v_status FROM public.down_payment_requests WHERE id = R_ADVANCE;
  PERFORM pg_temp.assert_txt('advance restored to original paid status', v_status, 'paid');
  SELECT total_paid_amount INTO v_num FROM public.down_payment_requests WHERE id = R_ADVANCE;
  PERFORM pg_temp.assert_true('advance restored to original paid amount', v_num = 1000);
  SELECT mmp_site_entry_id INTO v_uuid FROM public.down_payment_requests WHERE id = R_ADVANCE;
  PERFORM pg_temp.assert_txt('advance restored to original source site', v_uuid::text, R_SOURCE::text);
  SELECT count(*) INTO v_count
  FROM public.down_payment_requests
  WHERE id = R_ADVANCE
    AND wallet_transaction_ids = jsonb_build_array(ORIG_WT::text)
    AND coalesce(metadata ? 'exception_action_id', false) = false;
  PERFORM pg_temp.assert_eq('advance restored refs + stale marker removed', v_count, 1);

  -- Fee reset on the legacy source site.
  SELECT count(*) INTO v_count
  FROM public.mmp_site_entries
  WHERE id = R_SOURCE
    AND fee_paid_status = 'unpaid'
    AND fee_paid_amount = 0
    AND fee_cash_paid_amount = 0
    AND fee_advance_offset_amount = 0;
  PERFORM pg_temp.assert_eq('source fee reset after reprocessed reversal', v_count, 1);

  -- Old action flipped; exactly one new unexecuted replacement action created.
  SELECT count(*) INTO v_count
  FROM public.cycle_exception_actions
  WHERE id = v_action_id
    AND executed = true
    AND correction_status = 'reprocessed_payment_reversed'
    AND correction_reversal_journal_id = v_reversal_id
    AND correction_replacement_action_id = v_replacement_id;
  PERFORM pg_temp.assert_eq('old action marked reprocessed_payment_reversed', v_count, 1);
  SELECT count(*) INTO v_count
  FROM public.cycle_exception_actions
  WHERE id = v_replacement_id
    AND advance_id = R_ADVANCE
    AND executed = false
    AND action_payload->>'reopened_from_action_id' = v_action_id::text;
  PERFORM pg_temp.assert_eq('one unexecuted replacement action created', v_count, 1);
  SELECT count(*) INTO v_count
  FROM public.cycle_exception_actions
  WHERE advance_id = R_ADVANCE AND executed = false;
  PERFORM pg_temp.assert_eq('exactly one replacement (no duplicates)', v_count, 1);

  -- Parent + child audit rows recorded.
  SELECT id INTO v_parent_id
  FROM public.cycle_redirect_reprocessed_reversals WHERE correction_action_id = v_action_id;
  PERFORM pg_temp.assert_true('parent reprocessed reversal audit recorded', v_parent_id IS NOT NULL);
  SELECT count(*) INTO v_count
  FROM public.cycle_redirect_reprocessed_journal_reversals WHERE parent_id = v_parent_id;
  PERFORM pg_temp.assert_eq('one later-journal child audit row', v_count, 1);
  SELECT count(*) INTO v_count
  FROM public.cycle_redirect_reprocessed_wallet_reversals
  WHERE parent_id = v_parent_id AND wallet_transaction_id = LATER_WT;
  PERFORM pg_temp.assert_eq('one later-wallet child audit row', v_count, 1);

  -- Original Redirect bridge success row remains intact + auditable via links.
  SELECT count(*) INTO v_count
  FROM public.acct_gl_bridge_reversal_links
  WHERE correction_action_id = v_action_id
    AND original_journal_entry_id = v_original_journal_id
    AND reversal_journal_entry_id = v_reversal_id;
  PERFORM pg_temp.assert_eq('original bridge reversal link is auditable', v_count, 1);

  -- ── Same-key idempotent retry: same result, NO duplicate audit links ──────
  v_result := public.reverse_reprocessed_cycle_redirect_for_correction(
    v_action_id, v_reason, PERIOD, 'ce54-reprocessed-success', true
  );
  PERFORM pg_temp.assert_ok('reprocessed reversal retry is idempotent', v_result);
  PERFORM pg_temp.assert_true('retry returns same reversal + replacement',
    coalesce((v_result->>'already_corrected')::boolean, false)
    AND (v_result->>'reversal_journal_entry_id')::uuid = v_reversal_id
    AND (v_result->>'replacement_action_id')::uuid = v_replacement_id);
  SELECT count(*) INTO v_count
  FROM public.cycle_redirect_reprocessed_reversals WHERE correction_action_id = v_action_id;
  PERFORM pg_temp.assert_eq('retry creates no duplicate parent audit', v_count, 1);
  SELECT count(*) INTO v_count
  FROM public.cycle_redirect_reprocessed_journal_reversals WHERE parent_id = v_parent_id;
  PERFORM pg_temp.assert_eq('retry creates no duplicate child journal audit', v_count, 1);

  -- ── Different-key retry on an already-corrected action is rejected ─────────
  v_result := public.reverse_reprocessed_cycle_redirect_for_correction(
    v_action_id, v_reason, PERIOD, 'ce54-reprocessed-different-key', true
  );
  PERFORM pg_temp.assert_err('different key rejected on corrected action',
    v_result, 'already has a different completed correction');

  -- ── Final Close remains blocked by the restored advance + new action ──────
  BEGIN
    UPDATE public.mmp_files SET cycle_status = 'closed' WHERE id = R_MMP;
    RAISE EXCEPTION 'REPROCESSED_CLOSE_GATE_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'REPROCESSED_CLOSE_GATE_NOT_RAISED' THEN
      RAISE EXCEPTION 'FAIL [reprocessed close gate]: restored advance did not block close';
    END IF;
    IF SQLERRM NOT ILIKE '%CYCLE_CLOSE_GATE%' THEN
      RAISE EXCEPTION 'FAIL [reprocessed close gate]: unexpected error: %', SQLERRM;
    END IF;
  END;

  RAISE NOTICE 'PASS [reprocessed-payment Redirect reversal regression].';
END;
$reprocessed_reversal_test$;

DO $$ BEGIN
  RAISE NOTICE '✅  All cycle-close exception-execution tests passed.';
END $$;

-- ---------------------------------------------------------------------------
-- 12. Roll back everything: fixtures, seeded rows, and — crucially — the
--    transactional replacement of acct_bridge_post_journal (restores real fn).
-- ---------------------------------------------------------------------------
ROLLBACK;

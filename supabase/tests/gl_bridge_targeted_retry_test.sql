-- =============================================================================
-- Integration / regression test: targeted GL bridge retry
--
-- Migrations under test:
--   20260819_gl_bridge_failed_postings.sql
--   20260820_installment_gl_posting.sql
--
-- What this exercises
-- -------------------
--   1. Retrying one selected down-payment failure posts only that failed
--      installment, not another source row or a source-wide total.
--   2. A later successful installment does not hide an earlier failed
--      installment from Finance's unresolved-error queue.
--   3. A second retry contender is serialized by the source-level advisory
--      lock and becomes a harmless "already handled" skip: exactly one retry
--      journal is created.
--   4. A stale/resolved log row cannot be posted again.
--   5. Retrying one selected operational-cost failure posts only that cost;
--      another unresolved operational-cost failure remains untouched.
--
-- How to run
-- ----------
-- Apply the two migrations above, then paste this entire script into the
-- Supabase SQL Editor and click Run. Every assertion emits a PASS notice. The
-- final line should be:
--   NOTICE: ✅  All targeted GL bridge retry tests passed.
--
-- Safety
-- ------
-- The script runs in one transaction and ends with ROLLBACK. It creates only
-- deterministic test fixtures and does not commit them to the live dataset.
--
-- Concurrency note
-- ----------------
-- SQL Editor executes one session at a time, so this regression uses the same
-- sequence a concurrent contender follows after waiting for the source lock:
-- first retry succeeds, then the second retry sees the resolved row and skips.
-- It also asserts that the RPC retains its transaction-scoped advisory lock.
-- Together these assertions prevent a future change from removing the lock or
-- creating duplicate journals when two Finance users click Retry together.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Assertion helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.assert_count(
  p_label text,
  p_actual bigint,
  p_expected bigint
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAIL [%]: expected %, got %', p_label, p_expected, p_actual;
  END IF;
  RAISE NOTICE 'PASS [%]: %', p_label, p_actual;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_amount(
  p_label text,
  p_actual numeric,
  p_expected numeric
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAIL [%]: expected %, got %', p_label, p_expected, p_actual;
  END IF;
  RAISE NOTICE 'PASS [%]: %', p_label, p_actual;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_status(
  p_label text,
  p_result jsonb,
  p_expected text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_result ->> 'status' IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAIL [%]: expected status %, got %',
      p_label, p_expected, coalesce(p_result ->> 'status', '<null>');
  END IF;
  RAISE NOTICE 'PASS [%]: status=%', p_label, p_expected;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_label text,
  p_condition boolean
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_condition IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL [%]: expected TRUE', p_label;
  END IF;
  RAISE NOTICE 'PASS [%]', p_label;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Preflight
--
-- Newer installations may have the company-scoping journal-line trigger.
-- When it exists, test source rows use a real PACT company country so the
-- retry's real journal-line path is exercised without bypassing that trigger.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE gl_retry_test_context (
  country_id uuid
);

DO $preflight$
DECLARE
  v_missing text := '';
  v_scope_trigger_installed boolean;
  v_scope_country_id uuid;
  v_ops_account_code text;
BEGIN
  IF to_regprocedure('public.retry_gl_bridge_posting(uuid)') IS NULL THEN
    v_missing := v_missing || E'\n  - retry_gl_bridge_posting(uuid) is missing';
  END IF;
  IF to_regprocedure('public.get_unresolved_gl_bridge_errors(integer)') IS NULL THEN
    v_missing := v_missing || E'\n  - get_unresolved_gl_bridge_errors(integer) is missing';
  END IF;
  IF to_regprocedure('public.acct_bridge_ops_cost_account(text)') IS NULL THEN
    v_missing := v_missing || E'\n  - acct_bridge_ops_cost_account(text) is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.acct_funds WHERE is_active = true
  ) THEN
    v_missing := v_missing || E'\n  - no active acct_funds row exists';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.acct_fiscal_periods
    WHERE status IN ('open', 'soft_closed')
  ) THEN
    v_missing := v_missing || E'\n  - no open or soft-closed fiscal period exists';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.acct_accounts
    WHERE code = '151000' AND is_postable = true
  ) THEN
    v_missing := v_missing || E'\n  - postable advance account 151000 is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.acct_accounts
    WHERE code = '120000' AND is_postable = true
  ) THEN
    v_missing := v_missing || E'\n  - postable cash account 120000 is missing';
  END IF;

  IF to_regprocedure('public.acct_bridge_ops_cost_account(text)') IS NOT NULL THEN
    SELECT public.acct_bridge_ops_cost_account('training') INTO v_ops_account_code;
    IF NOT EXISTS (
      SELECT 1
      FROM public.acct_accounts
      WHERE code IN (v_ops_account_code, '505000')
        AND is_postable = true
    ) THEN
      v_missing := v_missing || format(
        E'\n  - postable operational-cost account %s (or fallback 505000) is missing',
        coalesce(v_ops_account_code, '<null>')
      );
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger
    JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE trigger.tgname = 'trg_scope_gl_bridge_journal_line'
      AND relation.relname = 'acct_journal_lines'
      AND namespace.nspname = 'public'
      AND NOT trigger.tgisinternal
  ) INTO v_scope_trigger_installed;

  IF v_scope_trigger_installed THEN
    SELECT company.country_id
    INTO v_scope_country_id
    FROM public.companies AS company
    WHERE company.country_id IS NOT NULL
      AND company.name_en IN ('PACT Sudan', 'PACT S.SUDAN', 'PACT Rwanda', 'PACT Uganda')
    ORDER BY company.name_en
    LIMIT 1;

    IF v_scope_country_id IS NULL THEN
      v_missing := v_missing || E'\n  - company-scoping trigger is installed but no mapped PACT company country exists';
    END IF;
  END IF;

  IF v_missing <> '' THEN
    RAISE EXCEPTION
      'PREFLIGHT FAILED — apply the GL bridge migrations and configure accounting before running this test:%',
      v_missing;
  END IF;

  INSERT INTO pg_temp.gl_retry_test_context (country_id)
  VALUES (v_scope_country_id);

  RAISE NOTICE 'PREFLIGHT OK — bridge RPCs and accounting prerequisites are present.';
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 2. Deterministic Finance actor and source fixtures
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, aud, email, encrypted_password, created_at, updated_at, role)
VALUES (
  'b5460000-0000-4000-8000-000000000001'::uuid,
  'authenticated',
  'gl-retry-finance@test.internal',
  '',
  now(),
  now(),
  'authenticated'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, full_name, role)
VALUES (
  'b5460000-0000-4000-8000-000000000001'::uuid,
  'gl-retry-finance@test.internal',
  'GL Retry Test Finance',
  'finance'
)
ON CONFLICT (id) DO NOTHING;

-- The selected advance has a 100 SDG failed first installment and a later
-- 50 SDG successful installment. Retrying the selected error must post 100,
-- not the 150 source total and not the later 50 installment.
INSERT INTO public.down_payment_requests (
  id, site_name, requested_by, total_transportation_budget, requested_amount,
  payment_type, justification, status, total_paid_amount, country_id
)
SELECT
  'b546d001-0000-4000-8000-000000000001'::uuid,
  '__gl_retry_selected_advance__',
  'b5460000-0000-4000-8000-000000000001'::uuid,
  150,
  150,
  'installments',
  'Targeted retry regression fixture',
  'fully_paid',
  150,
  country_id
FROM pg_temp.gl_retry_test_context;

-- A separate advance has both a resolved (stale) error and an unresolved error.
-- Retrying its resolved row must do nothing and must not touch the unresolved row.
INSERT INTO public.down_payment_requests (
  id, site_name, requested_by, total_transportation_budget, requested_amount,
  payment_type, justification, status, total_paid_amount, country_id
)
SELECT
  'b546d002-0000-4000-8000-000000000002'::uuid,
  '__gl_retry_unrelated_advance__',
  'b5460000-0000-4000-8000-000000000001'::uuid,
  40,
  40,
  'full_advance',
  'Targeted retry regression fixture',
  'fully_paid',
  40,
  country_id
FROM pg_temp.gl_retry_test_context;

INSERT INTO public.operational_cost_submissions (
  id, expense_category, submitted_by, submitter_role, amount_cents,
  paid_amount_cents, currency, description, expense_date, status, paid_at,
  country_id, tier2_approved_by
)
SELECT
  'b546c001-0000-4000-8000-000000000001'::uuid,
  'training',
  'b5460000-0000-4000-8000-000000000001'::uuid,
  'finance',
  7500,
  7500,
  'SDG',
  'Targeted retry operational-cost fixture',
  current_date,
  'paid',
  now(),
  country_id,
  'b5460000-0000-4000-8000-000000000001'::uuid
FROM pg_temp.gl_retry_test_context;

INSERT INTO public.operational_cost_submissions (
  id, expense_category, submitted_by, submitter_role, amount_cents,
  paid_amount_cents, currency, description, expense_date, status, paid_at,
  country_id, tier2_approved_by
)
SELECT
  'b546c002-0000-4000-8000-000000000002'::uuid,
  'training',
  'b5460000-0000-4000-8000-000000000001'::uuid,
  'finance',
  3200,
  3200,
  'SDG',
  'Unrelated operational-cost fixture',
  current_date,
  'paid',
  now(),
  country_id,
  'b5460000-0000-4000-8000-000000000001'::uuid
FROM pg_temp.gl_retry_test_context;

-- Failed and successful installments deliberately share source and event type.
-- The queue must retain the earlier unresolved row despite the later success.
INSERT INTO public.acct_gl_bridge_log (
  id, source_table, source_id, event_type, status, error_message, amount, created_at
) VALUES
  (
    'b546f001-0000-4000-8000-000000000001'::uuid,
    'down_payment_requests',
    'b546d001-0000-4000-8000-000000000001'::uuid,
    'installment_payment',
    'error',
    'Fixture: first installment could not post',
    100,
    now() - interval '2 hours'
  ),
  (
    'b546f002-0000-4000-8000-000000000002'::uuid,
    'down_payment_requests',
    'b546d001-0000-4000-8000-000000000001'::uuid,
    'installment_payment',
    'success',
    NULL,
    50,
    now() - interval '1 hour'
  ),
  (
    'b546f003-0000-4000-8000-000000000003'::uuid,
    'down_payment_requests',
    'b546d002-0000-4000-8000-000000000002'::uuid,
    'installment_payment',
    'error',
    'Fixture: unrelated advance failure',
    40,
    now() - interval '30 minutes'
  ),
  (
    'b546f004-0000-4000-8000-000000000004'::uuid,
    'down_payment_requests',
    'b546d002-0000-4000-8000-000000000002'::uuid,
    'installment_payment',
    'error',
    'Fixture: already resolved stale failure',
    10,
    now() - interval '3 hours'
  ),
  (
    'b546f005-0000-4000-8000-000000000005'::uuid,
    'operational_cost_submissions',
    'b546c001-0000-4000-8000-000000000001'::uuid,
    'ops_cost_paid',
    'error',
    'Fixture: selected operational-cost failure',
    75,
    now() - interval '20 minutes'
  ),
  (
    'b546f006-0000-4000-8000-000000000006'::uuid,
    'operational_cost_submissions',
    'b546c002-0000-4000-8000-000000000002'::uuid,
    'ops_cost_paid',
    'error',
    'Fixture: unrelated operational-cost failure',
    32,
    now() - interval '10 minutes'
  );

UPDATE public.acct_gl_bridge_log
SET resolved_at = now(),
    resolved_by = 'b5460000-0000-4000-8000-000000000001'::uuid
WHERE id = 'b546f004-0000-4000-8000-000000000004'::uuid;

-- The SECURITY DEFINER RPC must see the test caller as Finance.
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b5460000-0000-4000-8000-000000000001')::text,
  true
);

-- ---------------------------------------------------------------------------
-- 3. Main regression assertions
-- ---------------------------------------------------------------------------
DO $test$
DECLARE
  v_selected_dp_error uuid := 'b546f001-0000-4000-8000-000000000001'::uuid;
  v_later_dp_success uuid := 'b546f002-0000-4000-8000-000000000002'::uuid;
  v_unrelated_dp_error uuid := 'b546f003-0000-4000-8000-000000000003'::uuid;
  v_stale_dp_error uuid := 'b546f004-0000-4000-8000-000000000004'::uuid;
  v_selected_ocs_error uuid := 'b546f005-0000-4000-8000-000000000005'::uuid;
  v_unrelated_ocs_error uuid := 'b546f006-0000-4000-8000-000000000006'::uuid;
  v_result jsonb;
  v_retry_definition text;
  v_count bigint;
  v_amount numeric;
BEGIN
  -- Later success must not suppress the earlier failed installment in the queue.
  SELECT count(*) INTO v_count
  FROM public.get_unresolved_gl_bridge_errors(100)
  WHERE id = v_selected_dp_error;
  PERFORM pg_temp.assert_count(
    'earlier failed installment remains visible after later success',
    v_count,
    1
  );

  SELECT count(*) INTO v_count
  FROM public.get_unresolved_gl_bridge_errors(100)
  WHERE id = v_later_dp_success;
  PERFORM pg_temp.assert_count(
    'successful installment is not itself queued',
    v_count,
    0
  );

  -- Keep the source-level lock as an explicit regression contract. The second
  -- retry below exercises the result a simultaneous contender receives after
  -- the lock serializes work on this source.
  SELECT pg_get_functiondef('public.retry_gl_bridge_posting(uuid)'::regprocedure)
  INTO v_retry_definition;
  PERFORM pg_temp.assert_true(
    'retry RPC retains a transaction-scoped advisory lock',
    v_retry_definition ~ $lock$pg_advisory_xact_lock[[:space:]]*\([[:space:]]*hashtextextended[[:space:]]*\([[:space:]]*v_source_table[[:space:]]*\|\|[[:space:]]*':'[[:space:]]*\|\|[[:space:]]*v_source_id::text$lock$
  );

  -- Retry ONLY the failed 100 SDG installment.
  v_result := public.retry_gl_bridge_posting(v_selected_dp_error);
  PERFORM pg_temp.assert_status(
    'selected down-payment failure retries successfully',
    v_result,
    'success'
  );
  PERFORM pg_temp.assert_amount(
    'selected down-payment retry posts its failed installment amount',
    (v_result ->> 'amount')::numeric,
    100
  );

  -- A concurrent retry contender is serialized, then observes the resolved row.
  -- It must not create another journal entry.
  v_result := public.retry_gl_bridge_posting(v_selected_dp_error);
  PERFORM pg_temp.assert_status(
    'second retry contender skips handled down-payment failure',
    v_result,
    'skipped'
  );

  SELECT count(*) INTO v_count
  FROM public.acct_journal_entries
  WHERE idempotency_key =
    'down_payment_requests::b546d001-0000-4000-8000-000000000001::retry_log_'
    || v_selected_dp_error::text
    AND status = 'posted';
  PERFORM pg_temp.assert_count(
    'selected down-payment retry creates exactly one posted journal',
    v_count,
    1
  );

  SELECT coalesce(sum(line.functional_amount) FILTER (WHERE line.debit_credit = 'DR'), 0)
  INTO v_amount
  FROM public.acct_journal_lines AS line
  JOIN public.acct_journal_entries AS entry ON entry.id = line.entry_id
  WHERE entry.idempotency_key =
    'down_payment_requests::b546d001-0000-4000-8000-000000000001::retry_log_'
    || v_selected_dp_error::text;
  PERFORM pg_temp.assert_amount(
    'selected down-payment journal debit is 100 not source total 150',
    v_amount,
    100
  );

  SELECT count(*) INTO v_count
  FROM public.acct_gl_bridge_log
  WHERE id = v_selected_dp_error
    AND resolved_at IS NOT NULL;
  PERFORM pg_temp.assert_count(
    'selected down-payment error is resolved',
    v_count,
    1
  );

  SELECT count(*) INTO v_count
  FROM public.acct_gl_bridge_log
  WHERE id = v_unrelated_dp_error
    AND resolved_at IS NULL;
  PERFORM pg_temp.assert_count(
    'retrying one down-payment leaves unrelated failure unresolved',
    v_count,
    1
  );

  SELECT count(*) INTO v_count
  FROM public.acct_journal_entries
  WHERE source_type = 'down_payment_requests'
    AND source_id = 'b546d002-0000-4000-8000-000000000002'::uuid
    AND status = 'posted';
  PERFORM pg_temp.assert_count(
    'retrying one down-payment does not bulk-post another advance',
    v_count,
    0
  );

  -- A resolved row is stale and must never be posted again, even while its
  -- source still has a different unresolved failure.
  v_result := public.retry_gl_bridge_posting(v_stale_dp_error);
  PERFORM pg_temp.assert_status(
    'resolved down-payment error skips as stale',
    v_result,
    'skipped'
  );

  SELECT count(*) INTO v_count
  FROM public.acct_journal_entries
  WHERE idempotency_key =
    'down_payment_requests::b546d002-0000-4000-8000-000000000002::retry_log_'
    || v_stale_dp_error::text;
  PERFORM pg_temp.assert_count(
    'stale down-payment error creates no retry journal',
    v_count,
    0
  );

  -- Retry only the selected operational-cost failure.
  v_result := public.retry_gl_bridge_posting(v_selected_ocs_error);
  PERFORM pg_temp.assert_status(
    'selected operational-cost failure retries successfully',
    v_result,
    'success'
  );
  PERFORM pg_temp.assert_amount(
    'selected operational-cost retry posts its paid amount',
    (v_result ->> 'amount')::numeric,
    75
  );

  SELECT count(*) INTO v_count
  FROM public.acct_journal_entries
  WHERE idempotency_key =
    'ocs::b546c001-0000-4000-8000-000000000001::paid'
    AND status = 'posted';
  PERFORM pg_temp.assert_count(
    'selected operational-cost retry creates one posted journal',
    v_count,
    1
  );

  SELECT count(*) INTO v_count
  FROM public.acct_gl_bridge_log
  WHERE id = v_selected_ocs_error
    AND resolved_at IS NOT NULL;
  PERFORM pg_temp.assert_count(
    'selected operational-cost error is resolved',
    v_count,
    1
  );

  SELECT count(*) INTO v_count
  FROM public.acct_gl_bridge_log
  WHERE id = v_unrelated_ocs_error
    AND resolved_at IS NULL;
  PERFORM pg_temp.assert_count(
    'retrying one operational cost leaves unrelated failure unresolved',
    v_count,
    1
  );

  SELECT count(*) INTO v_count
  FROM public.acct_journal_entries
  WHERE source_type = 'operational_cost_submissions'
    AND source_id = 'b546c002-0000-4000-8000-000000000002'::uuid
    AND status = 'posted';
  PERFORM pg_temp.assert_count(
    'retrying one operational cost does not bulk-post another cost',
    v_count,
    0
  );

  RAISE NOTICE '✅  All targeted GL bridge retry tests passed.';
END
$test$;

ROLLBACK;
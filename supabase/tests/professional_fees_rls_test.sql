-- =============================================================================
-- RLS integration test: get_project_professional_fees()
--
-- Migration under test: 20260807_professional_fees_rls_filter.sql
--
-- Purpose
-- -------
-- Verify that the caller-visibility guard added to get_project_professional_fees()
-- correctly restricts fee rows for restricted-role callers and grants full access
-- to privileged-role callers.
--
-- How to run
-- ----------
-- Paste this entire script into the Supabase SQL Editor and click Run.
-- Every RAISE NOTICE line should appear; the final line should be:
--   NOTICE: ✅  All professional-fees RLS tests passed.
--
-- If any assertion fails the script raises an EXCEPTION and halts immediately,
-- showing which scenario failed.
--
-- Prerequisites
-- -------------
-- • The migration 20260807_professional_fees_rls_filter.sql must already be
--   applied (i.e. get_project_professional_fees() must contain the guard).
-- • The script runs inside a single transaction and ROLLBACKs at the end so
--   no test data is committed to the production dataset.
-- • Runs as the Supabase service role (SQL Editor default), which has
--   permission to write to auth.users and profiles.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Helper: fail fast with a clear message if row counts diverge
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(
  label    TEXT,
  actual   BIGINT,
  expected BIGINT
) RETURNS VOID AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL [%]: expected % rows but got %', label, expected, actual;
  END IF;
  RAISE NOTICE 'PASS [%]: % rows (expected %)', label, actual, expected;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 1. Test-user UUIDs
--    All characters are valid hex digits (0-9, a-f).
--    The leading "feee" prefix makes them easy to grep in logs.
-- ---------------------------------------------------------------------------
--
--   feee0001-0000-4000-8000-000000000001  → Admin        (privileged)
--   feee0002-0000-4000-8000-000000000002  → employee     (restricted, in teamComposition of α)
--   feee0003-0000-4000-8000-000000000003  → fom          (restricted, NOT a member of any project)
--   feee0004-0000-4000-8000-000000000004  → hr           (restricted, active project_team_members row on α)
--
-- Test-project UUIDs:
--   feeeaaaa-0000-4000-8000-000000000001  → Project α
--   feeebbbb-0000-4000-8000-000000000002  → Project β

-- ---------------------------------------------------------------------------
-- 2. Insert test auth + profile rows
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (id, aud, email, encrypted_password, created_at, updated_at, role)
VALUES
  ('feee0001-0000-4000-8000-000000000001'::uuid, 'authenticated', 'fee_admin@test.internal',       '', now(), now(), 'authenticated'),
  ('feee0002-0000-4000-8000-000000000002'::uuid, 'authenticated', 'fee_employee@test.internal',    '', now(), now(), 'authenticated'),
  ('feee0003-0000-4000-8000-000000000003'::uuid, 'authenticated', 'fee_fom@test.internal',         '', now(), now(), 'authenticated'),
  ('feee0004-0000-4000-8000-000000000004'::uuid, 'authenticated', 'fee_hr@test.internal',          '', now(), now(), 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name, role)
VALUES
  ('feee0001-0000-4000-8000-000000000001'::uuid, 'fee_admin@test.internal',    'Fee Test Admin',            'Admin'),
  ('feee0002-0000-4000-8000-000000000002'::uuid, 'fee_employee@test.internal', 'Fee Test Employee (member)','employee'),
  ('feee0003-0000-4000-8000-000000000003'::uuid, 'fee_fom@test.internal',      'Fee Test FOM (non-member)', 'fom'),
  ('feee0004-0000-4000-8000-000000000004'::uuid, 'fee_hr@test.internal',       'Fee Test HR (ptm member)',  'hr')
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role      = EXCLUDED.role;

-- ---------------------------------------------------------------------------
-- 3. Insert test projects
--
-- Project α: employee (feee0002) is in teamComposition; hr (feee0004) is
--            a member via project_team_members
-- Project β: neither restricted test user is a member
-- ---------------------------------------------------------------------------

INSERT INTO projects (id, name, status, team)
VALUES
  (
    'feeeaaaa-0000-4000-8000-000000000001'::uuid,
    '__fee_rls_test_alpha__',
    'active',
    jsonb_build_object(
      'projectManagerId', NULL,
      'teamComposition', jsonb_build_array(
        jsonb_build_object(
          'userId',        'feee0002-0000-4000-8000-000000000002',
          'name',          'Fee Test Employee (member)',
          'feeType',       'fixed_fee',
          'rate',          1500,
          'currency',      'SDG',
          'amountPaid',    0,
          'paymentStatus', 'unpaid'
        )
      )
    )
  ),
  (
    'feeebbbb-0000-4000-8000-000000000002'::uuid,
    '__fee_rls_test_beta__',
    'active',
    jsonb_build_object(
      'projectManagerId', NULL,
      'teamComposition', jsonb_build_array(
        jsonb_build_object(
          'userId',        'feee0099-0000-4000-8000-000000000099',
          'name',          'Unrelated User',
          'feeType',       'fixed_fee',
          'rate',          500,
          'currency',      'SDG',
          'amountPaid',    0,
          'paymentStatus', 'unpaid'
        )
      )
    )
  )
ON CONFLICT (id) DO NOTHING;

-- Give hr user (feee0004) an active explicit membership row on project α.
INSERT INTO project_team_members (project_id, user_id, project_role, is_active)
VALUES (
  'feeeaaaa-0000-4000-8000-000000000001'::uuid,
  'feee0004-0000-4000-8000-000000000004'::uuid,
  'project_viewer',
  TRUE
)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Run visibility assertions
--
-- auth.uid() in Supabase reads from request.jwt.claims->>'sub'.
-- set_config with is_local=true scopes the setting to this transaction.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_proj_alpha UUID := 'feeeaaaa-0000-4000-8000-000000000001';
  v_proj_beta  UUID := 'feeebbbb-0000-4000-8000-000000000002';
  v_count      BIGINT;
BEGIN

  -- ── 4a. Privileged caller (Admin) sees BOTH test projects ─────────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'feee0001-0000-4000-8000-000000000001')::text,
    true
  );

  SELECT COUNT(*) INTO v_count
  FROM get_project_professional_fees()
  WHERE project_name IN ('__fee_rls_test_alpha__', '__fee_rls_test_beta__');

  PERFORM pg_temp.assert_eq('Admin sees both test projects', v_count, 2);

  -- ── 4b. Restricted caller (employee) who IS in teamComposition of α ───────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'feee0002-0000-4000-8000-000000000002')::text,
    true
  );

  SELECT COUNT(*) INTO v_count
  FROM get_project_professional_fees()
  WHERE project_name IN ('__fee_rls_test_alpha__', '__fee_rls_test_beta__');

  PERFORM pg_temp.assert_eq('employee (member of α) sees only α — total rows', v_count, 1);

  SELECT COUNT(*) INTO v_count
  FROM get_project_professional_fees()
  WHERE project_name = '__fee_rls_test_alpha__';

  PERFORM pg_temp.assert_eq('employee (member of α) — row is from project α', v_count, 1);

  SELECT COUNT(*) INTO v_count
  FROM get_project_professional_fees()
  WHERE project_name = '__fee_rls_test_beta__';

  PERFORM pg_temp.assert_eq('employee (member of α) — ZERO rows for project β', v_count, 0);

  -- ── 4c. Restricted caller (fom) with NO membership in either project ───────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'feee0003-0000-4000-8000-000000000003')::text,
    true
  );

  SELECT COUNT(*) INTO v_count
  FROM get_project_professional_fees()
  WHERE project_name IN ('__fee_rls_test_alpha__', '__fee_rls_test_beta__');

  PERFORM pg_temp.assert_eq('fom (non-member) sees ZERO rows across all test projects', v_count, 0);

  -- ── 4d. Restricted caller (hr) with active project_team_members row on α ──
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'feee0004-0000-4000-8000-000000000004')::text,
    true
  );

  SELECT COUNT(*) INTO v_count
  FROM get_project_professional_fees()
  WHERE project_name = '__fee_rls_test_alpha__';

  PERFORM pg_temp.assert_eq('hr (active ptm row on α) sees α', v_count, 1);

  SELECT COUNT(*) INTO v_count
  FROM get_project_professional_fees()
  WHERE project_name = '__fee_rls_test_beta__';

  PERFORM pg_temp.assert_eq('hr (active ptm row on α) sees ZERO rows for β', v_count, 0);

  -- ── 4e. Scoped query: privileged caller queries project α by UUID ──────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'feee0001-0000-4000-8000-000000000001')::text,
    true
  );

  SELECT COUNT(*) INTO v_count
  FROM get_project_professional_fees(v_proj_alpha)
  WHERE project_name = '__fee_rls_test_alpha__';

  PERFORM pg_temp.assert_eq('Admin scoped to α — exactly 1 row', v_count, 1);

  -- ── 4f. Scoped query: restricted non-member queries project α by UUID ──────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'feee0003-0000-4000-8000-000000000003')::text,
    true
  );

  SELECT COUNT(*) INTO v_count
  FROM get_project_professional_fees(v_proj_alpha);

  PERFORM pg_temp.assert_eq('fom (non-member) scoped query on α — ZERO rows', v_count, 0);

  RAISE NOTICE '✅  All professional-fees RLS tests passed.';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Anon-role privilege check
--
-- Verify that the anon role has been explicitly stripped of EXECUTE on this
-- function.  We use has_function_privilege() rather than SET ROLE anon (which
-- would silently succeed in a service-role session) so the assertion is
-- portable across Supabase environments.
--
-- Expected result: has_function_privilege returns FALSE for both anon and
-- PUBLIC, confirming that unauthenticated visitors cannot call the function
-- via the Supabase anon key.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_anon_can_execute   BOOLEAN;
  v_pub_can_execute    BOOLEAN;
BEGIN
  -- Check anon role directly.
  SELECT has_function_privilege('anon', 'get_project_professional_fees(uuid)', 'execute')
    INTO v_anon_can_execute;

  IF v_anon_can_execute THEN
    RAISE EXCEPTION
      'FAIL [anon privilege]: anon role has EXECUTE on get_project_professional_fees — REVOKE did not take effect';
  END IF;
  RAISE NOTICE 'PASS [anon privilege]: anon role does NOT have EXECUTE on get_project_professional_fees';

  -- Check PUBLIC pseudo-role (inherited privilege path for the anon key).
  SELECT has_function_privilege('PUBLIC', 'get_project_professional_fees(uuid)', 'execute')
    INTO v_pub_can_execute;

  IF v_pub_can_execute THEN
    RAISE EXCEPTION
      'FAIL [PUBLIC privilege]: PUBLIC has EXECUTE on get_project_professional_fees — REVOKE FROM PUBLIC did not take effect';
  END IF;
  RAISE NOTICE 'PASS [PUBLIC privilege]: PUBLIC does NOT have EXECUTE on get_project_professional_fees';

  -- Also confirm the function is not executable by the unauthenticated path
  -- via SET ROLE anon + exception capture.
  BEGIN
    SET LOCAL ROLE anon;
    -- Attempting to call the function as the anon role should raise
    -- insufficient_privilege (42501).  Pass NULL::uuid to match the
    -- declared signature; a "function does not exist" error would be
    -- a resolution failure, not a privilege failure.
    PERFORM public.get_project_professional_fees(NULL::uuid);
    -- If we reach this line the REVOKE is missing.
    RAISE EXCEPTION
      'FAIL [anon execute]: anon role was able to execute get_project_professional_fees without error';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS [anon execute]: calling as anon role raised insufficient_privilege as expected';
    WHEN OTHERS THEN
      -- Any other error (e.g. relation not found) still proves the function
      -- did not return data; re-raise only if it is NOT a privilege error.
      IF SQLERRM NOT ILIKE '%permission denied%' THEN
        RAISE;
      END IF;
      RAISE NOTICE 'PASS [anon execute]: calling as anon role denied (%)' , SQLERRM;
  END;

  -- Restore the original role for the ROLLBACK to work cleanly.
  RESET ROLE;

  RAISE NOTICE '✅  Anon-privilege gate confirmed.';
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Roll back every test row — production data is never committed
-- ---------------------------------------------------------------------------
ROLLBACK;

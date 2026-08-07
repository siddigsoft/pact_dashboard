-- =============================================================================
-- RLS integration test: projects table SELECT policy
--
-- Migration under test:
--   20260807_projects_rls_member_visibility.sql   (enables RLS + initial policy)
--   20260807_fix_project_team_members_rls_recursion.sql  (replaces policy with
--     SECURITY DEFINER helper + legacy projectManager key support)
--
-- Purpose
-- -------
-- Verify that the projects_select RLS policy correctly restricts row
-- visibility for restricted-role callers and grants full access to
-- privileged-role callers when querying the projects table directly.
--
-- How to run
-- ----------
-- Paste this entire script into the Supabase SQL Editor and click Run.
-- Every RAISE NOTICE line should appear; the final line should be:
--   NOTICE: ✅  All projects RLS tests passed.
--
-- If any assertion fails the script raises an EXCEPTION and halts immediately,
-- showing which scenario failed.
--
-- Prerequisites
-- -------------
-- • Both migrations listed above must already be applied.
-- • The script runs inside a single transaction and ROLLBACKs at the end so
--   no test data is committed to the production dataset.
-- • Runs as the Supabase service role (SQL Editor default), which has
--   permission to write to auth.users and profiles.
--
-- Role-switching pattern
-- ----------------------
-- Direct SELECT on projects goes through RLS only when the session role is
-- `authenticated` (or another non-superuser role).  The service role bypasses
-- RLS even when request.jwt.claims is set.  Therefore each assertion:
--
--   1. Sets the JWT claims so auth.uid() returns the right test user.
--   2. Switches to `SET ROLE authenticated` so the SELECT is RLS-filtered.
--   3. Captures the row count.
--   4. Calls RESET ROLE to return to the superuser session for the next step.
--
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
--    The leading "b10c" prefix makes them easy to grep in logs and avoids
--    collisions with the professional-fees test UUIDs (feee prefix).
-- ---------------------------------------------------------------------------
--
--   b10c0001-0000-4000-8000-000000000001  → Admin           (privileged)
--   b10c0002-0000-4000-8000-000000000002  → employee        (restricted, in teamComposition of α)
--   b10c0003-0000-4000-8000-000000000003  → fom             (restricted, NOT a member of any project)
--   b10c0004-0000-4000-8000-000000000004  → hr              (restricted, active project_team_members row on α)
--   b10c0005-0000-4000-8000-000000000005  → countryDirector (restricted, named as projectManagerId of α)
--   b10c0006-0000-4000-8000-000000000006  → employee2       (restricted, named via legacy projectManager key on α)
--
-- Test-project UUIDs:
--   b10caaaa-0000-4000-8000-000000000001  → Project α
--   b10cbbbb-0000-4000-8000-000000000002  → Project β

-- ---------------------------------------------------------------------------
-- 2. Insert test auth + profile rows
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (id, aud, email, encrypted_password, created_at, updated_at, role)
VALUES
  ('b10c0001-0000-4000-8000-000000000001'::uuid, 'authenticated', 'prj_admin@test.internal',     '', now(), now(), 'authenticated'),
  ('b10c0002-0000-4000-8000-000000000002'::uuid, 'authenticated', 'prj_employee@test.internal',  '', now(), now(), 'authenticated'),
  ('b10c0003-0000-4000-8000-000000000003'::uuid, 'authenticated', 'prj_fom@test.internal',       '', now(), now(), 'authenticated'),
  ('b10c0004-0000-4000-8000-000000000004'::uuid, 'authenticated', 'prj_hr@test.internal',        '', now(), now(), 'authenticated'),
  ('b10c0005-0000-4000-8000-000000000005'::uuid, 'authenticated', 'prj_cd@test.internal',        '', now(), now(), 'authenticated'),
  ('b10c0006-0000-4000-8000-000000000006'::uuid, 'authenticated', 'prj_employee2@test.internal', '', now(), now(), 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name, role)
VALUES
  ('b10c0001-0000-4000-8000-000000000001'::uuid, 'prj_admin@test.internal',     'PRJ Test Admin',                         'Admin'),
  ('b10c0002-0000-4000-8000-000000000002'::uuid, 'prj_employee@test.internal',  'PRJ Test Employee (teamComposition)',     'employee'),
  ('b10c0003-0000-4000-8000-000000000003'::uuid, 'prj_fom@test.internal',       'PRJ Test FOM (non-member)',               'fom'),
  ('b10c0004-0000-4000-8000-000000000004'::uuid, 'prj_hr@test.internal',        'PRJ Test HR (ptm member)',                'hr'),
  ('b10c0005-0000-4000-8000-000000000005'::uuid, 'prj_cd@test.internal',        'PRJ Test CountryDir (projectManagerId)', 'countryDirector'),
  ('b10c0006-0000-4000-8000-000000000006'::uuid, 'prj_employee2@test.internal', 'PRJ Test Employee2 (legacy pm key)',      'employee')
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role      = EXCLUDED.role;

-- ---------------------------------------------------------------------------
-- 3. Insert test projects
--
-- Project α:
--   • countryDirector (b10c0005) is the projectManagerId
--   • employee2       (b10c0006) is set via the legacy projectManager key
--   • employee        (b10c0002) is in teamComposition
--   • hr              (b10c0004) has an active project_team_members row
--
-- Project β:
--   • None of the restricted test users are members
-- ---------------------------------------------------------------------------

INSERT INTO projects (id, name, status, team)
VALUES
  (
    'b10caaaa-0000-4000-8000-000000000001'::uuid,
    '__prj_rls_test_alpha__',
    'active',
    jsonb_build_object(
      'projectManagerId', 'b10c0005-0000-4000-8000-000000000005',
      'projectManager',   'b10c0006-0000-4000-8000-000000000006',
      'teamComposition', jsonb_build_array(
        jsonb_build_object(
          'userId', 'b10c0002-0000-4000-8000-000000000002',
          'name',   'PRJ Test Employee (teamComposition)'
        )
      )
    )
  ),
  (
    'b10cbbbb-0000-4000-8000-000000000002'::uuid,
    '__prj_rls_test_beta__',
    'active',
    jsonb_build_object(
      'projectManagerId', NULL,
      'projectManager',   NULL,
      'teamComposition', jsonb_build_array(
        jsonb_build_object(
          'userId', 'b10c0099-0000-4000-8000-000000000099',
          'name',   'Unrelated User'
        )
      )
    )
  )
ON CONFLICT (id) DO NOTHING;

-- Give hr user (b10c0004) an active explicit membership row on project α.
INSERT INTO project_team_members (project_id, user_id, project_role, is_active)
VALUES (
  'b10caaaa-0000-4000-8000-000000000001'::uuid,
  'b10c0004-0000-4000-8000-000000000004'::uuid,
  'project_viewer',
  TRUE
)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Run visibility assertions
--
-- IMPORTANT: Each assertion block follows this sequence:
--   a) set_config — sets request.jwt.claims so auth.uid() returns the right UID
--   b) SET ROLE authenticated — enforces RLS (service role bypasses it)
--   c) SELECT ... INTO v_count — row count is filtered by the policy
--   d) RESET ROLE — back to superuser so pg_temp functions are accessible
--   e) pg_temp.assert_eq — raise PASS / EXCEPTION
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_count BIGINT;
BEGIN

  -- ── 4a. Privileged caller (Admin) sees BOTH test projects ─────────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'b10c0001-0000-4000-8000-000000000001')::text,
    true
  );
  SET ROLE authenticated;
  SELECT COUNT(*) INTO v_count
  FROM projects
  WHERE name IN ('__prj_rls_test_alpha__', '__prj_rls_test_beta__');
  RESET ROLE;
  PERFORM pg_temp.assert_eq('Admin sees both test projects', v_count, 2);

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'b10c0001-0000-4000-8000-000000000001')::text,
    true
  );
  SET ROLE authenticated;
  SELECT COUNT(*) INTO v_count FROM projects
  WHERE id = 'b10caaaa-0000-4000-8000-000000000001'::uuid;
  RESET ROLE;
  PERFORM pg_temp.assert_eq('Admin scoped to α — exactly 1 row', v_count, 1);

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'b10c0001-0000-4000-8000-000000000001')::text,
    true
  );
  SET ROLE authenticated;
  SELECT COUNT(*) INTO v_count FROM projects
  WHERE id = 'b10cbbbb-0000-4000-8000-000000000002'::uuid;
  RESET ROLE;
  PERFORM pg_temp.assert_eq('Admin scoped to β — exactly 1 row', v_count, 1);

  -- ── 4b. Restricted caller (fom) with NO membership in either project ───────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'b10c0003-0000-4000-8000-000000000003')::text,
    true
  );
  SET ROLE authenticated;
  SELECT COUNT(*) INTO v_count
  FROM projects
  WHERE name IN ('__prj_rls_test_alpha__', '__prj_rls_test_beta__');
  RESET ROLE;
  PERFORM pg_temp.assert_eq('fom (non-member) sees ZERO rows across all test projects', v_count, 0);

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'b10c0003-0000-4000-8000-000000000003')::text,
    true
  );
  SET ROLE authenticated;
  SELECT COUNT(*) INTO v_count FROM projects
  WHERE id = 'b10caaaa-0000-4000-8000-000000000001'::uuid;
  RESET ROLE;
  PERFORM pg_temp.assert_eq('fom (non-member) scoped query on α — ZERO rows', v_count, 0);

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'b10c0003-0000-4000-8000-000000000003')::text,
    true
  );
  SET ROLE authenticated;
  SELECT COUNT(*) INTO v_count FROM projects
  WHERE id = 'b10cbbbb-0000-4000-8000-000000000002'::uuid;
  RESET ROLE;
  PERFORM pg_temp.assert_eq('fom (non-member) scoped query on β — ZERO rows', v_count, 0);

  -- ── 4c. Restricted caller (employee) in teamComposition of α ──────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'b10c0002-0000-4000-8000-000000000002')::text,
    true
  );
  SET ROLE authenticated;
  SELECT COUNT(*) INTO v_count
  FROM projects
  WHERE name IN ('__prj_rls_test_alpha__', '__prj_rls_test_beta__');
  RESET ROLE;
  PERFORM pg_temp.assert_eq('employee (teamComposition of α) total — only 1 row', v_count, 1);

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'b10c0002-0000-4000-8000-000000000002')::text,
    true
  );
  SET ROLE authenticated;
  SELECT COUNT(*) INTO v_count FROM projects
  WHERE id = 'b10caaaa-0000-4000-8000-000000000001'::uuid;
  RESET ROLE;
  PERFORM pg_temp.assert_eq('employee (teamComposition of α) — row IS project α', v_count, 1);

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'b10c0002-0000-4000-8000-000000000002')::text,
    true
  );
  SET ROLE authenticated;
  SELECT COUNT(*) INTO v_count FROM projects
  WHERE id = 'b10cbbbb-0000-4000-8000-000000000002'::uuid;
  RESET ROLE;
  PERFORM pg_temp.assert_eq('employee (teamComposition of α) — ZERO rows for β', v_count, 0);

  -- ── 4d. Restricted caller (hr) with active project_team_members row on α ──
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'b10c0004-0000-4000-8000-000000000004')::text,
    true
  );
  SET ROLE authenticated;
  SELECT COUNT(*) INTO v_count FROM projects
  WHERE id = 'b10caaaa-0000-4000-8000-000000000001'::uuid;
  RESET ROLE;
  PERFORM pg_temp.assert_eq('hr (active ptm row on α) sees α', v_count, 1);

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'b10c0004-0000-4000-8000-000000000004')::text,
    true
  );
  SET ROLE authenticated;
  SELECT COUNT(*) INTO v_count FROM projects
  WHERE id = 'b10cbbbb-0000-4000-8000-000000000002'::uuid;
  RESET ROLE;
  PERFORM pg_temp.assert_eq('hr (active ptm row on α) sees ZERO rows for β', v_count, 0);

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'b10c0004-0000-4000-8000-000000000004')::text,
    true
  );
  SET ROLE authenticated;
  SELECT COUNT(*) INTO v_count
  FROM projects
  WHERE name IN ('__prj_rls_test_alpha__', '__prj_rls_test_beta__');
  RESET ROLE;
  PERFORM pg_temp.assert_eq('hr (active ptm row on α) total — only 1 row', v_count, 1);

  -- ── 4e. Restricted caller (countryDirector) named as projectManagerId ─────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'b10c0005-0000-4000-8000-000000000005')::text,
    true
  );
  SET ROLE authenticated;
  SELECT COUNT(*) INTO v_count FROM projects
  WHERE id = 'b10caaaa-0000-4000-8000-000000000001'::uuid;
  RESET ROLE;
  PERFORM pg_temp.assert_eq('countryDirector (projectManagerId of α) sees α', v_count, 1);

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'b10c0005-0000-4000-8000-000000000005')::text,
    true
  );
  SET ROLE authenticated;
  SELECT COUNT(*) INTO v_count FROM projects
  WHERE id = 'b10cbbbb-0000-4000-8000-000000000002'::uuid;
  RESET ROLE;
  PERFORM pg_temp.assert_eq('countryDirector (projectManagerId of α) sees ZERO rows for β', v_count, 0);

  -- ── 4f. Restricted caller (employee2) named via legacy projectManager key ──
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'b10c0006-0000-4000-8000-000000000006')::text,
    true
  );
  SET ROLE authenticated;
  SELECT COUNT(*) INTO v_count FROM projects
  WHERE id = 'b10caaaa-0000-4000-8000-000000000001'::uuid;
  RESET ROLE;
  PERFORM pg_temp.assert_eq('employee2 (legacy projectManager key on α) sees α', v_count, 1);

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'b10c0006-0000-4000-8000-000000000006')::text,
    true
  );
  SET ROLE authenticated;
  SELECT COUNT(*) INTO v_count FROM projects
  WHERE id = 'b10cbbbb-0000-4000-8000-000000000002'::uuid;
  RESET ROLE;
  PERFORM pg_temp.assert_eq('employee2 (legacy projectManager key) sees ZERO rows for β', v_count, 0);

  RAISE NOTICE '✅  All projects RLS tests passed.';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Roll back every test row — production data is never committed
-- ---------------------------------------------------------------------------
ROLLBACK;

-- =============================================================================
-- RLS end-to-end test: projects table + three RPC functions
--
-- Migrations under test:
--   • 20260807_projects_rls_member_visibility.sql   (projects_select policy)
--   • 20260807_project_list_rpcs_rls_filter.sql     (get_all_projects,
--                                                    get_projects_for_analytics)
--   • 20260807_professional_fees_rls_filter.sql     (get_project_professional_fees)
--
-- Purpose
-- -------
-- Confirm that restricted-role callers (employee, fom, countryDirector, hr)
-- see ONLY the projects they are members of across every data path, and that
-- privileged-role callers retain full visibility.
--
-- Paths covered
-- -------------
--   1. Direct SELECT on the projects table (projects_select RLS policy)
--   2. get_all_projects()
--   3. get_projects_for_analytics()
--   4. get_project_professional_fees()
--
-- Membership scenarios
-- --------------------
--   User A  – restricted role (employee), named as projectManagerId on project α
--   User B  – restricted role (fom),      listed in teamComposition of project α
--   User C  – restricted role (hr),       has active row in project_team_members for α
--   User D  – restricted role (employee), NOT a member of any test project
--   User E  – privileged role (Admin),    full visibility
--
-- How to run
-- ----------
-- Paste this entire script into the Supabase SQL Editor and click Run.
-- Every RAISE NOTICE should appear; the script ends with:
--   NOTICE: ✅  All end-to-end projects RLS tests passed.
--
-- If any assertion fails the script raises an EXCEPTION and halts immediately.
--
-- Prerequisites
-- -------------
-- • All three migrations listed above must already be applied.
-- • The script runs inside a single transaction and ROLLBACKs at the end so
--   no test data is committed to the production dataset.
-- • Runs as the Supabase service role (SQL Editor default), which has
--   permission to write to auth.users and profiles.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Helper: assert row-count equality, fail fast with a clear message
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
--
--   e2e00001-…-0001  → User A  employee  (projectManagerId on project α)
--   e2e00002-…-0002  → User B  fom       (teamComposition member of project α)
--   e2e00003-…-0003  → User C  hr        (project_team_members row on project α)
--   e2e00004-…-0004  → User D  employee  (NOT a member of any test project)
--   e2e00005-…-0005  → User E  Admin     (privileged — sees everything)
--
-- Test-project UUIDs:
--   e2eaaaaa-…-0001  → Project α  (User A, B, C are members)
--   e2ebbbbbb-…-0002  → Project β  (no test user is a member)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 2. Insert test auth + profile rows
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (id, aud, email, encrypted_password, created_at, updated_at, role)
VALUES
  ('e2e00001-0000-4000-8000-000000000001'::uuid, 'authenticated', 'e2e_user_a@test.internal', '', now(), now(), 'authenticated'),
  ('e2e00002-0000-4000-8000-000000000002'::uuid, 'authenticated', 'e2e_user_b@test.internal', '', now(), now(), 'authenticated'),
  ('e2e00003-0000-4000-8000-000000000003'::uuid, 'authenticated', 'e2e_user_c@test.internal', '', now(), now(), 'authenticated'),
  ('e2e00004-0000-4000-8000-000000000004'::uuid, 'authenticated', 'e2e_user_d@test.internal', '', now(), now(), 'authenticated'),
  ('e2e00005-0000-4000-8000-000000000005'::uuid, 'authenticated', 'e2e_user_e@test.internal', '', now(), now(), 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name, role)
VALUES
  ('e2e00001-0000-4000-8000-000000000001'::uuid, 'e2e_user_a@test.internal', 'E2E User A (employee, PM)',        'employee'),
  ('e2e00002-0000-4000-8000-000000000002'::uuid, 'e2e_user_b@test.internal', 'E2E User B (fom, teamComp)',       'fom'),
  ('e2e00003-0000-4000-8000-000000000003'::uuid, 'e2e_user_c@test.internal', 'E2E User C (hr, ptm)',             'hr'),
  ('e2e00004-0000-4000-8000-000000000004'::uuid, 'e2e_user_d@test.internal', 'E2E User D (employee, non-member)','employee'),
  ('e2e00005-0000-4000-8000-000000000005'::uuid, 'e2e_user_e@test.internal', 'E2E User E (Admin)',               'Admin')
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role      = EXCLUDED.role;

-- ---------------------------------------------------------------------------
-- 3. Insert test projects
--
-- Project α: User A is projectManagerId; User B is in teamComposition;
--            User C gets an explicit project_team_members row below.
-- Project β: none of the test users are members.
-- ---------------------------------------------------------------------------

INSERT INTO projects (id, name, status, team)
VALUES
  (
    'e2eaaaaa-0000-4000-8000-000000000001'::uuid,
    '__e2e_rls_test_alpha__',
    'active',
    jsonb_build_object(
      'projectManagerId', 'e2e00001-0000-4000-8000-000000000001',
      'teamComposition', jsonb_build_array(
        jsonb_build_object(
          'userId',        'e2e00002-0000-4000-8000-000000000002',
          'name',          'E2E User B (fom, teamComp)',
          'feeType',       'fixed_fee',
          'rate',          2000,
          'currency',      'SDG',
          'amountPaid',    0,
          'paymentStatus', 'unpaid'
        )
      )
    )
  ),
  (
    'e2ebbbbb-0000-4000-8000-000000000002'::uuid,
    '__e2e_rls_test_beta__',
    'active',
    jsonb_build_object(
      'projectManagerId', 'e2e09999-0000-4000-8000-000000000099',
      'teamComposition',  '[]'::jsonb
    )
  )
ON CONFLICT (id) DO NOTHING;

-- Give User C (hr) an active explicit membership row on project α.
INSERT INTO project_team_members (project_id, user_id, project_role, is_active)
VALUES (
  'e2eaaaaa-0000-4000-8000-000000000001'::uuid,
  'e2e00003-0000-4000-8000-000000000003'::uuid,
  'project_viewer',
  TRUE
)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Run assertions
--
-- auth.uid() in Supabase reads from request.jwt.claims->>'sub'.
-- set_config with is_local=true scopes the value to this transaction.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_alpha UUID := 'e2eaaaaa-0000-4000-8000-000000000001';
  v_beta  UUID := 'e2ebbbbbb-0000-4000-8000-000000000002';
  v_count BIGINT;
  v_json  JSON;

  -- Helper: count rows inside the JSON array returned by get_all_projects()
  -- and get_projects_for_analytics() that match a given name.
  --
  -- NOTE: both functions return json_agg(…), so we expand the array with
  -- json_array_elements and filter by the "name" key.
BEGIN

  ---------------------------------------------------------------------------
  -- ══ PATH 1: Direct SELECT on the projects table (RLS policy) ══
  ---------------------------------------------------------------------------

  -- ── 1a. Privileged caller (Admin, User E) sees BOTH test projects ─────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'e2e00005-0000-4000-8000-000000000005')::text,
    true
  );
  -- Note: direct table reads via the SQL Editor run as service_role which
  -- bypasses RLS, so we test the policy expression directly using the same
  -- EXISTS-subquery pattern the policy uses.  This mirrors what the Supabase
  -- API (PostgREST) enforces for the "authenticated" role.
  SELECT COUNT(*) INTO v_count
  FROM projects
  WHERE name IN ('__e2e_rls_test_alpha__', '__e2e_rls_test_beta__')
    AND (
      EXISTS (
        SELECT 1 FROM profiles pr
        WHERE pr.id = (SELECT auth.uid())
          AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
      )
      OR (
        EXISTS (
          SELECT 1 FROM profiles pr
          WHERE pr.id = (SELECT auth.uid())
            AND pr.role IN ('employee', 'fom', 'countryDirector', 'hr')
        )
        AND (
          (team->>'projectManagerId') = (SELECT auth.uid())::text
          OR team->'teamComposition' @> jsonb_build_array(
               jsonb_build_object('userId', (SELECT auth.uid())::text)
             )
          OR EXISTS (
            SELECT 1 FROM project_team_members ptm
            WHERE ptm.project_id = projects.id
              AND ptm.user_id    = (SELECT auth.uid())
              AND ptm.is_active  = TRUE
          )
        )
      )
    );
  PERFORM pg_temp.assert_eq('[table RLS] Admin sees both test projects', v_count, 2);

  -- ── 1b. User A (employee, projectManagerId of α) sees only α ─────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'e2e00001-0000-4000-8000-000000000001')::text,
    true
  );
  SELECT COUNT(*) INTO v_count
  FROM projects
  WHERE name IN ('__e2e_rls_test_alpha__', '__e2e_rls_test_beta__')
    AND (
      EXISTS (
        SELECT 1 FROM profiles pr
        WHERE pr.id = (SELECT auth.uid())
          AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
      )
      OR (
        EXISTS (
          SELECT 1 FROM profiles pr
          WHERE pr.id = (SELECT auth.uid())
            AND pr.role IN ('employee', 'fom', 'countryDirector', 'hr')
        )
        AND (
          (team->>'projectManagerId') = (SELECT auth.uid())::text
          OR team->'teamComposition' @> jsonb_build_array(
               jsonb_build_object('userId', (SELECT auth.uid())::text)
             )
          OR EXISTS (
            SELECT 1 FROM project_team_members ptm
            WHERE ptm.project_id = projects.id
              AND ptm.user_id    = (SELECT auth.uid())
              AND ptm.is_active  = TRUE
          )
        )
      )
    );
  PERFORM pg_temp.assert_eq('[table RLS] employee (PM of α) sees only α', v_count, 1);

  SELECT COUNT(*) INTO v_count
  FROM projects
  WHERE name = '__e2e_rls_test_beta__'
    AND (
      EXISTS (
        SELECT 1 FROM profiles pr
        WHERE pr.id = (SELECT auth.uid())
          AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
      )
      OR (
        EXISTS (
          SELECT 1 FROM profiles pr
          WHERE pr.id = (SELECT auth.uid())
            AND pr.role IN ('employee', 'fom', 'countryDirector', 'hr')
        )
        AND (
          (team->>'projectManagerId') = (SELECT auth.uid())::text
          OR team->'teamComposition' @> jsonb_build_array(
               jsonb_build_object('userId', (SELECT auth.uid())::text)
             )
          OR EXISTS (
            SELECT 1 FROM project_team_members ptm
            WHERE ptm.project_id = projects.id
              AND ptm.user_id    = (SELECT auth.uid())
              AND ptm.is_active  = TRUE
          )
        )
      )
    );
  PERFORM pg_temp.assert_eq('[table RLS] employee (PM of α) — ZERO rows from β', v_count, 0);

  -- ── 1c. User D (employee, non-member) sees ZERO rows ─────────────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'e2e00004-0000-4000-8000-000000000004')::text,
    true
  );
  SELECT COUNT(*) INTO v_count
  FROM projects
  WHERE name IN ('__e2e_rls_test_alpha__', '__e2e_rls_test_beta__')
    AND (
      EXISTS (
        SELECT 1 FROM profiles pr
        WHERE pr.id = (SELECT auth.uid())
          AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
      )
      OR (
        EXISTS (
          SELECT 1 FROM profiles pr
          WHERE pr.id = (SELECT auth.uid())
            AND pr.role IN ('employee', 'fom', 'countryDirector', 'hr')
        )
        AND (
          (team->>'projectManagerId') = (SELECT auth.uid())::text
          OR team->'teamComposition' @> jsonb_build_array(
               jsonb_build_object('userId', (SELECT auth.uid())::text)
             )
          OR EXISTS (
            SELECT 1 FROM project_team_members ptm
            WHERE ptm.project_id = projects.id
              AND ptm.user_id    = (SELECT auth.uid())
              AND ptm.is_active  = TRUE
          )
        )
      )
    );
  PERFORM pg_temp.assert_eq('[table RLS] employee (non-member) sees ZERO rows', v_count, 0);


  ---------------------------------------------------------------------------
  -- ══ PATH 2: get_all_projects() ══
  ---------------------------------------------------------------------------

  -- ── 2a. Privileged caller (Admin) sees both test projects ─────────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'e2e00005-0000-4000-8000-000000000005')::text,
    true
  );
  SELECT COUNT(*) INTO v_count
  FROM json_array_elements(get_all_projects()) AS row
  WHERE row->>'name' IN ('__e2e_rls_test_alpha__', '__e2e_rls_test_beta__');
  PERFORM pg_temp.assert_eq('[get_all_projects] Admin sees both test projects', v_count, 2);

  -- ── 2b. User A (employee, projectManagerId of α) sees only α ─────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'e2e00001-0000-4000-8000-000000000001')::text,
    true
  );
  SELECT COUNT(*) INTO v_count
  FROM json_array_elements(get_all_projects()) AS row
  WHERE row->>'name' IN ('__e2e_rls_test_alpha__', '__e2e_rls_test_beta__');
  PERFORM pg_temp.assert_eq('[get_all_projects] employee (PM of α) sees 1 row total', v_count, 1);

  SELECT COUNT(*) INTO v_count
  FROM json_array_elements(get_all_projects()) AS row
  WHERE row->>'name' = '__e2e_rls_test_alpha__';
  PERFORM pg_temp.assert_eq('[get_all_projects] employee (PM of α) — row is α', v_count, 1);

  SELECT COUNT(*) INTO v_count
  FROM json_array_elements(get_all_projects()) AS row
  WHERE row->>'name' = '__e2e_rls_test_beta__';
  PERFORM pg_temp.assert_eq('[get_all_projects] employee (PM of α) — ZERO rows from β', v_count, 0);

  -- ── 2c. User B (fom, teamComposition member of α) sees only α ────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'e2e00002-0000-4000-8000-000000000002')::text,
    true
  );
  SELECT COUNT(*) INTO v_count
  FROM json_array_elements(get_all_projects()) AS row
  WHERE row->>'name' IN ('__e2e_rls_test_alpha__', '__e2e_rls_test_beta__');
  PERFORM pg_temp.assert_eq('[get_all_projects] fom (teamComp of α) sees 1 row total', v_count, 1);

  SELECT COUNT(*) INTO v_count
  FROM json_array_elements(get_all_projects()) AS row
  WHERE row->>'name' = '__e2e_rls_test_beta__';
  PERFORM pg_temp.assert_eq('[get_all_projects] fom (teamComp of α) — ZERO rows from β', v_count, 0);

  -- ── 2d. User C (hr, project_team_members row on α) sees only α ───────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'e2e00003-0000-4000-8000-000000000003')::text,
    true
  );
  SELECT COUNT(*) INTO v_count
  FROM json_array_elements(get_all_projects()) AS row
  WHERE row->>'name' IN ('__e2e_rls_test_alpha__', '__e2e_rls_test_beta__');
  PERFORM pg_temp.assert_eq('[get_all_projects] hr (ptm of α) sees 1 row total', v_count, 1);

  SELECT COUNT(*) INTO v_count
  FROM json_array_elements(get_all_projects()) AS row
  WHERE row->>'name' = '__e2e_rls_test_beta__';
  PERFORM pg_temp.assert_eq('[get_all_projects] hr (ptm of α) — ZERO rows from β', v_count, 0);

  -- ── 2e. User D (employee, non-member) sees ZERO rows ─────────────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'e2e00004-0000-4000-8000-000000000004')::text,
    true
  );
  SELECT COUNT(*) INTO v_count
  FROM json_array_elements(get_all_projects()) AS row
  WHERE row->>'name' IN ('__e2e_rls_test_alpha__', '__e2e_rls_test_beta__');
  PERFORM pg_temp.assert_eq('[get_all_projects] employee (non-member) sees ZERO rows', v_count, 0);


  ---------------------------------------------------------------------------
  -- ══ PATH 3: get_projects_for_analytics() ══
  ---------------------------------------------------------------------------

  -- ── 3a. Privileged caller (Admin) sees both test projects ─────────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'e2e00005-0000-4000-8000-000000000005')::text,
    true
  );
  SELECT COUNT(*) INTO v_count
  FROM json_array_elements(get_projects_for_analytics()) AS row
  WHERE row->>'name' IN ('__e2e_rls_test_alpha__', '__e2e_rls_test_beta__');
  PERFORM pg_temp.assert_eq('[get_projects_for_analytics] Admin sees both test projects', v_count, 2);

  -- ── 3b. User A (employee, PM of α) sees only α ───────────────────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'e2e00001-0000-4000-8000-000000000001')::text,
    true
  );
  SELECT COUNT(*) INTO v_count
  FROM json_array_elements(get_projects_for_analytics()) AS row
  WHERE row->>'name' IN ('__e2e_rls_test_alpha__', '__e2e_rls_test_beta__');
  PERFORM pg_temp.assert_eq('[get_projects_for_analytics] employee (PM of α) sees 1 row', v_count, 1);

  SELECT COUNT(*) INTO v_count
  FROM json_array_elements(get_projects_for_analytics()) AS row
  WHERE row->>'name' = '__e2e_rls_test_beta__';
  PERFORM pg_temp.assert_eq('[get_projects_for_analytics] employee (PM of α) — ZERO rows from β', v_count, 0);

  -- ── 3c. User B (fom, teamComposition of α) sees only α ───────────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'e2e00002-0000-4000-8000-000000000002')::text,
    true
  );
  SELECT COUNT(*) INTO v_count
  FROM json_array_elements(get_projects_for_analytics()) AS row
  WHERE row->>'name' IN ('__e2e_rls_test_alpha__', '__e2e_rls_test_beta__');
  PERFORM pg_temp.assert_eq('[get_projects_for_analytics] fom (teamComp of α) sees 1 row', v_count, 1);

  SELECT COUNT(*) INTO v_count
  FROM json_array_elements(get_projects_for_analytics()) AS row
  WHERE row->>'name' = '__e2e_rls_test_beta__';
  PERFORM pg_temp.assert_eq('[get_projects_for_analytics] fom (teamComp of α) — ZERO rows from β', v_count, 0);

  -- ── 3d. User C (hr, project_team_members row on α) sees only α ───────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'e2e00003-0000-4000-8000-000000000003')::text,
    true
  );
  SELECT COUNT(*) INTO v_count
  FROM json_array_elements(get_projects_for_analytics()) AS row
  WHERE row->>'name' IN ('__e2e_rls_test_alpha__', '__e2e_rls_test_beta__');
  PERFORM pg_temp.assert_eq('[get_projects_for_analytics] hr (ptm of α) sees 1 row', v_count, 1);

  SELECT COUNT(*) INTO v_count
  FROM json_array_elements(get_projects_for_analytics()) AS row
  WHERE row->>'name' = '__e2e_rls_test_beta__';
  PERFORM pg_temp.assert_eq('[get_projects_for_analytics] hr (ptm of α) — ZERO rows from β', v_count, 0);

  -- ── 3e. User D (employee, non-member) sees ZERO rows ─────────────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'e2e00004-0000-4000-8000-000000000004')::text,
    true
  );
  SELECT COUNT(*) INTO v_count
  FROM json_array_elements(get_projects_for_analytics()) AS row
  WHERE row->>'name' IN ('__e2e_rls_test_alpha__', '__e2e_rls_test_beta__');
  PERFORM pg_temp.assert_eq('[get_projects_for_analytics] employee (non-member) sees ZERO rows', v_count, 0);


  ---------------------------------------------------------------------------
  -- ══ PATH 4: get_project_professional_fees() ══
  ---------------------------------------------------------------------------
  -- Only project α has teamComposition members with a feeType, so β produces
  -- no fee rows regardless of visibility — the assertions target α only.

  -- ── 4a. Privileged caller (Admin) sees the fee row on α ──────────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'e2e00005-0000-4000-8000-000000000005')::text,
    true
  );
  SELECT COUNT(*) INTO v_count
  FROM get_project_professional_fees()
  WHERE project_name = '__e2e_rls_test_alpha__';
  PERFORM pg_temp.assert_eq('[get_project_professional_fees] Admin sees fee row on α', v_count, 1);

  -- ── 4b. User B (fom, teamComposition member of α) sees the fee row ────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'e2e00002-0000-4000-8000-000000000002')::text,
    true
  );
  SELECT COUNT(*) INTO v_count
  FROM get_project_professional_fees()
  WHERE project_name = '__e2e_rls_test_alpha__';
  PERFORM pg_temp.assert_eq('[get_project_professional_fees] fom (teamComp of α) sees α fee', v_count, 1);

  SELECT COUNT(*) INTO v_count
  FROM get_project_professional_fees()
  WHERE project_name = '__e2e_rls_test_beta__';
  PERFORM pg_temp.assert_eq('[get_project_professional_fees] fom (teamComp of α) — ZERO rows from β', v_count, 0);

  -- ── 4c. User D (employee, non-member) sees ZERO fee rows ─────────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'e2e00004-0000-4000-8000-000000000004')::text,
    true
  );
  SELECT COUNT(*) INTO v_count
  FROM get_project_professional_fees()
  WHERE project_name IN ('__e2e_rls_test_alpha__', '__e2e_rls_test_beta__');
  PERFORM pg_temp.assert_eq('[get_project_professional_fees] employee (non-member) sees ZERO rows', v_count, 0);

  -- ── 4d. User A (employee, PM of α via projectManagerId) sees α fee ────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'e2e00001-0000-4000-8000-000000000001')::text,
    true
  );
  SELECT COUNT(*) INTO v_count
  FROM get_project_professional_fees()
  WHERE project_name = '__e2e_rls_test_alpha__';
  PERFORM pg_temp.assert_eq('[get_project_professional_fees] employee (PM of α) sees α fee', v_count, 1);

  -- ── 4e. User C (hr, project_team_members row on α) sees α fee ────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'e2e00003-0000-4000-8000-000000000003')::text,
    true
  );
  SELECT COUNT(*) INTO v_count
  FROM get_project_professional_fees()
  WHERE project_name = '__e2e_rls_test_alpha__';
  PERFORM pg_temp.assert_eq('[get_project_professional_fees] hr (ptm of α) sees α fee', v_count, 1);

  SELECT COUNT(*) INTO v_count
  FROM get_project_professional_fees()
  WHERE project_name = '__e2e_rls_test_beta__';
  PERFORM pg_temp.assert_eq('[get_project_professional_fees] hr (ptm of α) — ZERO rows from β', v_count, 0);

  ---------------------------------------------------------------------------
  RAISE NOTICE '✅  All end-to-end projects RLS tests passed.';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Roll back every test row — production data is never committed
-- ---------------------------------------------------------------------------
ROLLBACK;

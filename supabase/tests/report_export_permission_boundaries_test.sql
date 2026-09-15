-- Canonical export-authorization integration checks.
-- Accounting, Finance, and HR do not currently have dedicated backend export
-- generators: these are representative assertion tests, not fake RPC tests.
-- Fixture writes happen before SET LOCAL ROLE; no RLS data result is asserted.
BEGIN;

DO $$
DECLARE
  v_granted uuid := 'a8100000-0000-4000-8000-000000000001';
  v_denied  uuid := 'a8100000-0000-4000-8000-000000000002';
  v_role    uuid := 'a8100000-0000-4000-8000-000000000003';
  v_super   uuid := 'a8100000-0000-4000-8000-000000000004';
BEGIN
  INSERT INTO auth.users (id, aud, email, encrypted_password, created_at, updated_at, role)
  VALUES
    (v_granted, 'authenticated', '__report_granted@test.invalid', '', now(), now(), 'authenticated'),
    (v_denied,  'authenticated', '__report_denied@test.invalid', '', now(), now(), 'authenticated'),
    (v_super,   'authenticated', '__report_super@test.invalid', '', now(), now(), 'authenticated')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, email, full_name, role, location)
  VALUES
    (v_granted, '__report_granted@test.invalid', 'Report grant fixture', 'admin', '{}'::jsonb),
    (v_denied,  '__report_denied@test.invalid', 'Report deny fixture', 'employee', '{}'::jsonb),
    (v_super,   '__report_super@test.invalid', 'Report Super Admin fixture', 'dataCollector', '{}'::jsonb)
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role, location = EXCLUDED.location;

  INSERT INTO roles (id, name, display_name, is_system_role, is_active)
  VALUES (v_role, '__report_boundary_role__', 'Report boundary fixture role', false, true)
  ON CONFLICT (id) DO UPDATE SET is_active = true;

  INSERT INTO permissions (role_id, resource, action)
  VALUES
    (v_role, 'accounting', 'export'),
    (v_role, 'finances', 'export'),
    (v_role, 'hr_analytics', 'export'),
    (v_role, 'analytics', 'export'),
    (v_role, 'mmp', 'full_report')
  ON CONFLICT (role_id, resource, action) DO NOTHING;

  INSERT INTO user_roles (user_id, role_id)
  VALUES (v_granted, v_role)
  ON CONFLICT DO NOTHING;

  INSERT INTO super_admins (user_id, appointment_reason, is_active)
  VALUES (v_super, 'Report export permission fixture', true)
  ON CONFLICT (user_id) DO UPDATE SET is_active = true;

  -- UI semantics grant active Super Admins every permission before overrides.
  INSERT INTO user_permission_overrides (user_id, resource, action, is_granted)
  VALUES (v_super, 'analytics', 'export', false)
  ON CONFLICT (user_id, resource, action)
  DO UPDATE SET is_granted = false, expires_at = NULL;
END
$$;

SET LOCAL ROLE authenticated;

SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'a8100000-0000-4000-8000-000000000002',
    'role', 'authenticated'
  )::text,
  true
);

-- A caller without any role-derived export grant is denied for each
-- representative module mapping, including analytics used by both Edge
-- export functions.
DO $$
DECLARE
  v_resource text;
  v_code text;
BEGIN
  FOREACH v_resource IN ARRAY ARRAY['accounting', 'finances', 'hr_analytics', 'analytics']
  LOOP
    BEGIN
      PERFORM public.assert_report_export_permission(v_resource);
      RAISE EXCEPTION 'expected % helper denial', v_resource;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE;
      IF v_code <> '42501' THEN
        RAISE EXCEPTION 'expected 42501 for % denial, got %', v_resource, v_code;
      END IF;
    END;
  END LOOP;
END
$$;

-- MMP remains on its specialized RPC boundary. It must deny before attempting
-- the deliberately absent report row.
DO $$
DECLARE v_code text;
BEGIN
  BEGIN
    PERFORM public.get_mmp_report_payload(
      'a810ffff-ffff-4fff-8fff-ffffffffffff'::uuid, 'full_report'
    );
    RAISE EXCEPTION 'expected MMP report denial';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE;
    IF v_code <> '42501' THEN
      RAISE EXCEPTION 'expected 42501 before MMP lookup, got %', v_code;
    END IF;
  END;
END
$$;

SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'a8100000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

-- The same canonical helper grants all representative mappings for the role.
SELECT public.assert_report_export_permission('accounting');
SELECT public.assert_report_export_permission('finances');
SELECT public.assert_report_export_permission('hr_analytics');
SELECT public.assert_report_export_permission('analytics');

-- An active table-backed Super Admin receives the same unconditional bypass as
-- the UI, even with a non-admin profile role and an explicit analytics deny.
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'a8100000-0000-4000-8000-000000000004',
    'role', 'authenticated'
  )::text,
  true
);
SELECT public.assert_report_export_permission('analytics');

-- Authenticated callers cannot bypass the Edge Function by asking Storage to
-- sign an existing archive directly.
DO $$
DECLARE
  v_policy_permissive text;
  v_policy_roles name[];
  v_policy_qual text;
BEGIN
  SELECT permissive, roles, qual
    INTO v_policy_permissive, v_policy_roles, v_policy_qual
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'field_data_archives_export_ceiling';

  IF v_policy_permissive IS DISTINCT FROM 'RESTRICTIVE'
     OR NOT ('authenticated' = ANY(v_policy_roles))
     OR v_policy_qual NOT LIKE '%field-data-archives%'
  THEN
    RAISE EXCEPTION 'field-data-archives restrictive download ceiling is missing';
  END IF;
END
$$;

-- MMP permission remains specialized; a granted full-report call reaches the
-- missing-report result rather than being converted to generic export.
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'a8100000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);
DO $$
DECLARE v_code text;
BEGIN
  BEGIN
    PERFORM public.get_mmp_report_payload(
      'a810ffff-ffff-4fff-8fff-ffffffffffff'::uuid, 'full_report'
    );
    RAISE EXCEPTION 'expected missing MMP report marker';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE;
    IF v_code <> 'P0002' THEN
      RAISE EXCEPTION 'expected P0002 after MMP authorization, got %', v_code;
    END IF;
  END;
END
$$;

RESET ROLE;
ROLLBACK;
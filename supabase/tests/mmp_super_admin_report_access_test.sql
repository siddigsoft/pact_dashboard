-- Regression coverage for 20260915b_super_admin_report_access.sql.
-- Every authoritative Super Admin source must bypass report permission rows and
-- scope narrowing, while an ordinary user remains denied.
BEGIN;

DO $$
DECLARE
  v_profile uuid := 'b15b0000-0000-4000-8000-000000000001';
  v_membership uuid := 'b15b0000-0000-4000-8000-000000000002';
  v_role_source uuid := 'b15b0000-0000-4000-8000-000000000003';
  v_legacy_role uuid := 'b15b0000-0000-4000-8000-000000000004';
  v_ordinary uuid := 'b15b0000-0000-4000-8000-000000000006';
  v_role uuid;
  v_mmp uuid := 'b15b0000-0000-4000-8000-000000000007';
BEGIN
  INSERT INTO auth.users (id, aud, email, encrypted_password, created_at, updated_at, role)
  VALUES
    (v_profile, 'authenticated', '__mmp_sa_profile@test.invalid', '', now(), now(), 'authenticated'),
    (v_membership, 'authenticated', '__mmp_sa_membership@test.invalid', '', now(), now(), 'authenticated'),
    (v_role_source, 'authenticated', '__mmp_sa_role_source@test.invalid', '', now(), now(), 'authenticated'),
    (v_legacy_role, 'authenticated', '__mmp_sa_legacy_role@test.invalid', '', now(), now(), 'authenticated'),
    (v_ordinary, 'authenticated', '__mmp_sa_ordinary@test.invalid', '', now(), now(), 'authenticated')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, email, full_name, role, state_id, hub_id, location)
  VALUES
    -- Deliberately hub-scoped-looking fields: the Super Admin branch must
    -- ignore them and return organization scope.
    (v_profile, '__mmp_sa_profile@test.invalid', 'MMP profile Super Admin', 'Super Admin',
      'Khartoum', 'country-office', '{}'::jsonb),
    (v_membership, '__mmp_sa_membership@test.invalid', 'MMP membership Super Admin', 'employee',
      'Red Sea', 'portsudan-hub', '{}'::jsonb),
    (v_role_source, '__mmp_sa_role_source@test.invalid', 'MMP role-source Super Admin', 'employee',
      'Northern', 'dongola-hub', '{}'::jsonb),
    (v_legacy_role, '__mmp_sa_legacy_role@test.invalid', 'MMP legacy-role Super Admin', 'employee',
      'Northern', 'dongola-hub', '{}'::jsonb),
    (v_ordinary, '__mmp_sa_ordinary@test.invalid', 'MMP ordinary user', 'employee',
      'Khartoum', 'country-office', '{}'::jsonb)
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role, state_id = EXCLUDED.state_id,
        hub_id = EXCLUDED.hub_id, location = EXCLUDED.location;

  INSERT INTO super_admins (user_id, appointment_reason, is_active)
  VALUES (v_membership, 'MMP Super Admin authority fixture', true)
  ON CONFLICT (user_id) DO UPDATE SET is_active = true;

  SELECT r.id INTO v_role
  FROM roles r
  WHERE regexp_replace(lower(btrim(r.name)), '[^a-z0-9]+', '', 'g')
    IN ('superadmin', 'superadministrator')
  LIMIT 1;
  IF v_role IS NULL THEN
    INSERT INTO roles (id, name, display_name, is_system_role, is_active)
    VALUES ('b15b0000-0000-4000-8000-000000000005'::uuid,
      'Super_Admin', 'MMP Super Admin role-source fixture', false, true)
    ON CONFLICT (id) DO UPDATE SET is_active = true
    RETURNING id INTO v_role;
  ELSE
    UPDATE roles SET is_active = true WHERE id = v_role;
  END IF;

  INSERT INTO user_roles (user_id, role_id)
  VALUES (v_role_source, v_role)
  ON CONFLICT DO NOTHING;

  -- Legacy deployments carry the role text directly on user_roles.
  INSERT INTO user_roles (user_id, role)
  VALUES (v_legacy_role, 'superAdmin')
  ON CONFLICT DO NOTHING;

  INSERT INTO user_permission_overrides (user_id, resource, action, is_granted)
  SELECT u, 'mmp', k, false
  FROM unnest(ARRAY[v_profile, v_membership, v_role_source, v_legacy_role]) AS users(u)
  CROSS JOIN unnest(ARRAY['full_report', 'state_report', 'hub_report']) AS kinds(k)
  ON CONFLICT (user_id, resource, action)
  DO UPDATE SET is_granted = false, expires_at = NULL;

  INSERT INTO mmp_files (id, name)
  VALUES (v_mmp, 'MMP Super Admin report fixture')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO mmp_site_entries (mmp_file_id, state, hub_office, status)
  VALUES
    (v_mmp, 'Khartoum', 'Country Office', 'completed'),
    (v_mmp, 'Red Sea', 'Port Sudan Hub', 'pending');
END
$$;

SET LOCAL ROLE authenticated;

CREATE OR REPLACE FUNCTION pg_temp.assert_sa_report(
  p_user_id uuid,
  p_kind text,
  p_mmp_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_payload jsonb;
  v_code text;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );

  IF NOT public.current_user_is_super_admin() THEN
    RAISE EXCEPTION 'expected Super Admin source to resolve for %', p_user_id;
  END IF;
  IF NOT public.mmp_report_permission(p_kind) THEN
    RAISE EXCEPTION 'Super Admin permission denied for %', p_kind;
  END IF;
  BEGIN
    PERFORM public.assert_report_export_permission('analytics');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE;
    RAISE EXCEPTION 'Super Admin export assertion failed with %', v_code;
  END;

  BEGIN
    v_payload := public.get_mmp_report_payload(p_mmp_id, p_kind);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE;
    RAISE EXCEPTION 'Super Admin % report failed with %', p_kind, v_code;
  END;

  IF coalesce((v_payload->'scope'->>'super_admin')::boolean, false) IS NOT TRUE
     OR coalesce((v_payload->'scope'->>'hub_scoped')::boolean, true) IS NOT FALSE
     OR jsonb_array_length(v_payload->'entries') <> 2
  THEN
    RAISE EXCEPTION 'Super Admin % report was not complete and organization-wide', p_kind;
  END IF;
END
$$;

-- Profile role, active membership, and normalized user_roles.role_id/roles.name
-- each bypass absent grants and explicit false overrides for every report kind.
SELECT pg_temp.assert_sa_report(u, k, 'b15b0000-0000-4000-8000-000000000007'::uuid)
FROM (VALUES
  ('b15b0000-0000-4000-8000-000000000001'::uuid, 'full_report'),
  ('b15b0000-0000-4000-8000-000000000001'::uuid, 'state_report'),
  ('b15b0000-0000-4000-8000-000000000001'::uuid, 'hub_report'),
  ('b15b0000-0000-4000-8000-000000000002'::uuid, 'full_report'),
  ('b15b0000-0000-4000-8000-000000000002'::uuid, 'state_report'),
  ('b15b0000-0000-4000-8000-000000000002'::uuid, 'hub_report'),
  ('b15b0000-0000-4000-8000-000000000003'::uuid, 'full_report'),
  ('b15b0000-0000-4000-8000-000000000003'::uuid, 'state_report'),
  ('b15b0000-0000-4000-8000-000000000003'::uuid, 'hub_report'),
  ('b15b0000-0000-4000-8000-000000000004'::uuid, 'full_report'),
  ('b15b0000-0000-4000-8000-000000000004'::uuid, 'state_report'),
  ('b15b0000-0000-4000-8000-000000000004'::uuid, 'hub_report')
) AS cases(u, k);

-- Ordinary users do not inherit the Super Admin bypass from a false override,
-- a hub-scoped profile, or another user's authority source.
DO $$
DECLARE
  v_kind text;
  v_code text;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', 'b15b0000-0000-4000-8000-000000000006',
      'role', 'authenticated'
    )::text,
    true
  );
  FOREACH v_kind IN ARRAY ARRAY['full_report', 'state_report', 'hub_report']
  LOOP
    BEGIN
      PERFORM public.get_mmp_report_payload(
        'b15b0000-0000-4000-8000-000000000007'::uuid, v_kind
      );
      RAISE EXCEPTION 'ordinary user unexpectedly opened %', v_kind;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE;
      IF v_code <> '42501' THEN
        RAISE EXCEPTION 'ordinary user % denial returned %', v_kind, v_code;
      END IF;
    END;
  END LOOP;
  BEGIN
    PERFORM public.assert_report_export_permission('analytics');
    RAISE EXCEPTION 'ordinary user unexpectedly passed export assertion';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE;
    IF v_code <> '42501' THEN
      RAISE EXCEPTION 'ordinary export denial returned %', v_code;
    END IF;
  END;
END
$$;

RESET ROLE;
ROLLBACK;
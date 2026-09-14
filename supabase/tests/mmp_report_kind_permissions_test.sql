-- Regression test for 20260914b_mmp_report_kind_permissions.sql.
--
-- The fixture is transactional.  It exercises the RPC authorization boundary
-- before a report row is read, including role grants and both kinds of active
-- user override.  The final assertions exercise the canonical hub/entry
-- scoping predicate directly because report rows vary between deployments.
BEGIN;

DO $$
DECLARE
  v_role_id uuid := 'b14b0000-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO auth.users (
    id, aud, email, encrypted_password, created_at, updated_at, role
  )
  VALUES
    ('b14b0000-0000-4000-8000-000000000011'::uuid, 'authenticated', '__mmp_full@test.invalid', '', now(), now(), 'authenticated'),
    ('b14b0000-0000-4000-8000-000000000012'::uuid, 'authenticated', '__mmp_state@test.invalid', '', now(), now(), 'authenticated'),
    ('b14b0000-0000-4000-8000-000000000013'::uuid, 'authenticated', '__mmp_hub@test.invalid', '', now(), now(), 'authenticated'),
    ('b14b0000-0000-4000-8000-000000000019'::uuid, 'authenticated', '__mmp_denied@test.invalid', '', now(), now(), 'authenticated'),
    ('b14b0000-0000-4000-8000-000000000021'::uuid, 'authenticated', '__mmp_true_full@test.invalid', '', now(), now(), 'authenticated'),
    ('b14b0000-0000-4000-8000-000000000022'::uuid, 'authenticated', '__mmp_true_state@test.invalid', '', now(), now(), 'authenticated'),
    ('b14b0000-0000-4000-8000-000000000023'::uuid, 'authenticated', '__mmp_true_hub@test.invalid', '', now(), now(), 'authenticated')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, email, full_name, role, state_id, hub_id, location)
  VALUES
    ('b14b0000-0000-4000-8000-000000000011', '__mmp_full@test.invalid',  'MMP full fixture',  'admin', NULL, NULL, '{}'::jsonb),
    ('b14b0000-0000-4000-8000-000000000012', '__mmp_state@test.invalid', 'MMP state fixture', 'employee', 'Khartoum', NULL, '{}'::jsonb),
    ('b14b0000-0000-4000-8000-000000000013', '__mmp_hub@test.invalid',   'MMP hub fixture',   'supervisor', NULL, 'country-office', '{}'::jsonb),
    ('b14b0000-0000-4000-8000-000000000019', '__mmp_denied@test.invalid', 'MMP denied fixture', 'admin', NULL, NULL, '{}'::jsonb),
    ('b14b0000-0000-4000-8000-000000000021', '__mmp_true_full@test.invalid', 'MMP true full fixture', 'employee', NULL, NULL, '{}'::jsonb),
    ('b14b0000-0000-4000-8000-000000000022', '__mmp_true_state@test.invalid', 'MMP true state fixture', 'employee', 'Khartoum', NULL, '{}'::jsonb),
    ('b14b0000-0000-4000-8000-000000000023', '__mmp_true_hub@test.invalid', 'MMP true hub fixture', 'supervisor', NULL, 'country-office', '{}'::jsonb)
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role, state_id = EXCLUDED.state_id,
        hub_id = EXCLUDED.hub_id, location = EXCLUDED.location;

  INSERT INTO roles (id, name, display_name, is_system_role, is_active)
  VALUES (v_role_id, '__mmp_report_kind_test_role__', 'MMP report fixture role', false, true)
  ON CONFLICT (id) DO UPDATE SET is_active = true;

  INSERT INTO permissions (role_id, resource, action)
  VALUES
    (v_role_id, 'mmp', 'full_report'),
    (v_role_id, 'mmp', 'state_report'),
    (v_role_id, 'mmp', 'hub_report')
  ON CONFLICT (role_id, resource, action) DO NOTHING;

  INSERT INTO user_roles (user_id, role_id)
  VALUES
    ('b14b0000-0000-4000-8000-000000000011', v_role_id),
    ('b14b0000-0000-4000-8000-000000000012', v_role_id),
    ('b14b0000-0000-4000-8000-000000000013', v_role_id)
  ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.assert_mmp_rpc(
  p_user_id uuid,
  p_kind text,
  p_denied boolean
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_code text;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
  BEGIN
    -- A successful authorization reaches the report lookup and returns the
    -- stable P0002 "MMP not found" error for this deliberately absent UUID.
    PERFORM public.get_mmp_report_payload(
      'b14bffff-ffff-4fff-8fff-ffffffffffff'::uuid, p_kind
    );
    IF p_denied THEN
      RAISE EXCEPTION 'expected permission denial for %', p_kind;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE;
    IF p_denied AND v_code <> '42501' THEN
      RAISE EXCEPTION 'expected 42501 denial for %, got %', p_kind, v_code;
    ELSIF NOT p_denied AND v_code <> 'P0002' THEN
      RAISE EXCEPTION 'expected P0002 after grant for %, got %', p_kind, v_code;
    END IF;
  END;
END;
$$;

-- Direct RPC deny/grant for each independently addressable report kind.
SELECT pg_temp.assert_mmp_rpc(
  'b14b0000-0000-4000-8000-000000000019', k, true
)
FROM unnest(ARRAY['full_report', 'state_report', 'hub_report']) AS k;
SELECT pg_temp.assert_mmp_rpc(
  u, k, false
)
FROM (VALUES
  ('b14b0000-0000-4000-8000-000000000011'::uuid, 'full_report'),
  ('b14b0000-0000-4000-8000-000000000012'::uuid, 'state_report'),
  ('b14b0000-0000-4000-8000-000000000013'::uuid, 'hub_report')
) AS granted(u, k);

-- Explicit active false overrides beat a role grant for every kind.
INSERT INTO user_permission_overrides (user_id, resource, action, is_granted)
VALUES
  ('b14b0000-0000-4000-8000-000000000011', 'mmp', 'full_report', false),
  ('b14b0000-0000-4000-8000-000000000012', 'mmp', 'state_report', false),
  ('b14b0000-0000-4000-8000-000000000013', 'mmp', 'hub_report', false);
SELECT pg_temp.assert_mmp_rpc(u, k, true)
FROM (VALUES
  ('b14b0000-0000-4000-8000-000000000011'::uuid, 'full_report'),
  ('b14b0000-0000-4000-8000-000000000012'::uuid, 'state_report'),
  ('b14b0000-0000-4000-8000-000000000013'::uuid, 'hub_report')
) AS blocked(u, k);

-- Explicit active true overrides beat the absence of a role grant.
INSERT INTO user_permission_overrides (user_id, resource, action, is_granted)
VALUES
  ('b14b0000-0000-4000-8000-000000000021', 'mmp', 'full_report', true),
  ('b14b0000-0000-4000-8000-000000000022', 'mmp', 'state_report', true),
  ('b14b0000-0000-4000-8000-000000000023', 'mmp', 'hub_report', true);
SELECT pg_temp.assert_mmp_rpc(
  u, k, false
)
FROM (VALUES
  ('b14b0000-0000-4000-8000-000000000021'::uuid, 'full_report'),
  ('b14b0000-0000-4000-8000-000000000022'::uuid, 'state_report'),
  ('b14b0000-0000-4000-8000-000000000023'::uuid, 'hub_report')
) AS granted_by_override(u, k);

-- Canonical hub and state scoping fails closed for mismatched or malformed
-- entries, and accepts a valid assigned canonical hub/state.
DO $$
BEGIN
  IF NOT public.mmp_entry_is_in_report_scope(
    'hub_report', 'Khartoum', 'Country Office',
    '{"hub_ids":["country-office"]}'::jsonb
  ) THEN
    RAISE EXCEPTION 'valid canonical hub entry was excluded';
  END IF;
  IF public.mmp_entry_is_in_report_scope(
    'hub_report', 'Khartoum', 'Port Sudan Hub',
    '{"hub_ids":["country-office"]}'::jsonb
  ) THEN
    RAISE EXCEPTION 'mismatched hub entry was included';
  END IF;
  IF NOT public.mmp_entry_is_in_report_scope(
    'state_report', 'Khartoum', 'Country Office',
    '{"state_ids":["khartoum"]}'::jsonb
  ) THEN
    RAISE EXCEPTION 'valid authorized state entry was excluded';
  END IF;
  IF public.mmp_entry_is_in_report_scope(
    'state_report', 'Red Sea', 'Country Office',
    '{"state_ids":["khartoum"]}'::jsonb
  ) THEN
    RAISE EXCEPTION 'unauthorized state entry was included';
  END IF;
  IF public.mmp_entry_is_in_report_scope(
    'hub_report', 'Red Sea', 'not-a-real-hub',
    '{"hub_ids":["country-office"]}'::jsonb
  ) THEN
    RAISE EXCEPTION 'malformed entry was included';
  END IF;
END $$;

ROLLBACK;
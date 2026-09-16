-- Role-specific tab defaults prevent one role edit from restricting other roles.
CREATE TABLE IF NOT EXISTS public.role_tab_configs (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  page_slug text NOT NULL CHECK (page_slug LIKE '%:%'),
  is_blocked boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, page_slug)
);
ALTER TABLE public.role_tab_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_tab_read ON public.role_tab_configs;
CREATE POLICY role_tab_read ON public.role_tab_configs FOR SELECT TO authenticated USING (true);
-- Changes go through the authorized and audited lifecycle RPC.
GRANT SELECT ON public.role_tab_configs TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.role_tab_configs FROM authenticated;

-- Extend the canonical lifecycle transaction with staged baseline access.
CREATE OR REPLACE FUNCTION public.upsert_role_access(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role_id uuid;
  v_name text;
  v_display text;
  v_description text;
  v_is_active boolean;
  v_perm jsonb;
  v_column jsonb;
  v_tab jsonb;
  v_slug text;
  v_user_id uuid;
  v_set_primary boolean;
  v_reason text;
  v_before jsonb;
  v_after jsonb;
  v_page_slugs text[];
  v_assign_ids uuid[];
  v_existing_roles text[];
  v_is_create boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.current_user_has_resource_permission('roles',
    CASE WHEN nullif(payload->>'role_id', '') IS NULL THEN 'create' ELSE 'update' END) THEN
    RAISE EXCEPTION 'Not authorized to manage roles' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(16103000);

  v_role_id := nullif(payload->>'role_id', '')::uuid;
  v_name := nullif(btrim(coalesce(payload->>'name', '')), '');
  v_display := nullif(btrim(coalesce(payload->>'display_name', '')), '');
  v_description := nullif(btrim(coalesce(payload->>'description', '')), '');
  v_is_active := coalesce((payload->>'is_active')::boolean, true);
  v_set_primary := coalesce((payload->>'set_as_primary')::boolean, false);
  v_reason := nullif(btrim(coalesce(payload->>'reason', '')), '');

  IF v_name IS NULL OR v_display IS NULL THEN
    RAISE EXCEPTION 'name and display_name are required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_super_admin(v_actor) AND (
    regexp_replace(lower(v_name), '[^a-z]', '', 'g') IN ('superadmin', 'superadministrator', 'admin', 'administrator', 'ict')
    OR EXISTS (SELECT 1 FROM public.roles r WHERE r.id = v_role_id AND r.is_system_role)
  ) THEN
    RAISE EXCEPTION 'Only a Super Admin can manage protected roles' USING ERRCODE = '42501';
  END IF;

  IF payload ? 'page_slugs' AND jsonb_typeof(payload->'page_slugs') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'page_slugs must be an array' USING ERRCODE = '22023';
  END IF;
  IF payload ? 'permissions' AND jsonb_typeof(payload->'permissions') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'permissions must be an array' USING ERRCODE = '22023';
  END IF;
  IF payload ? 'assign_user_ids' AND jsonb_typeof(payload->'assign_user_ids') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'assign_user_ids must be an array' USING ERRCODE = '22023';
  END IF;
  IF payload ? 'page_slugs' AND jsonb_typeof(payload->'page_slugs') = 'array' THEN
    SELECT coalesce(array_agg(x), ARRAY[]::text[]) INTO v_page_slugs
    FROM (
      SELECT DISTINCT nullif(btrim(value #>> '{}'), '') AS x
      FROM jsonb_array_elements(payload->'page_slugs')
    ) s WHERE x IS NOT NULL;
  ELSE
    v_page_slugs := ARRAY[]::text[];
  END IF;

  IF payload ? 'tab_rules' AND jsonb_typeof(payload->'tab_rules') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'tab_rules must be an array' USING ERRCODE = '22023';
  END IF;
  IF payload ? 'column_rules' AND jsonb_typeof(payload->'column_rules') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'column_rules must be an array' USING ERRCODE = '22023';
  END IF;
  IF payload ? 'cost_scope' AND NOT coalesce(public.workspace_check_super_admin(), false) THEN
    RAISE EXCEPTION 'Only a workspace Super Admin can configure cost scope' USING ERRCODE = '42501';
  END IF;

  IF payload ? 'assign_user_ids' AND jsonb_typeof(payload->'assign_user_ids') = 'array' THEN
    SELECT coalesce(array_agg(x), ARRAY[]::uuid[]) INTO v_assign_ids
    FROM (
      SELECT DISTINCT nullif(btrim(value #>> '{}'), '')::uuid AS x
      FROM jsonb_array_elements(payload->'assign_user_ids')
    ) s WHERE x IS NOT NULL;
  ELSE
    v_assign_ids := ARRAY[]::uuid[];
  END IF;

  IF cardinality(v_assign_ids) > 0 AND NOT public.current_user_has_resource_permission('roles', 'assign') THEN
    RAISE EXCEPTION 'Not authorized to assign roles' USING ERRCODE = '42501';
  END IF;
  -- Validate before replacing the actor's own role permissions, so a save
  -- cannot bootstrap itself into capabilities the actor did not already hold.
  IF NOT public.is_super_admin(v_actor) THEN
    FOR v_perm IN SELECT value FROM jsonb_array_elements(coalesce(payload->'permissions', '[]'::jsonb)) LOOP
      IF (v_perm->>'resource' = 'system' AND v_perm->>'action' = 'override')
        OR v_perm->>'resource' = 'super_admins'
        OR NOT public.current_user_has_resource_permission(v_perm->>'resource', v_perm->>'action') THEN
        RAISE EXCEPTION 'Cannot grant permissions beyond actor authority' USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END IF;

  IF v_role_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'role', to_jsonb(r),
      'permissions', coalesce((
        SELECT jsonb_agg(jsonb_build_object('resource', p.resource, 'action', p.action, 'conditions', p.conditions) ORDER BY p.resource, p.action)
        FROM public.permissions p WHERE p.role_id = r.id
      ), '[]'::jsonb),
      'page_slugs', coalesce((SELECT jsonb_agg(c.page_slug ORDER BY c.page_slug) FROM public.page_role_configs c WHERE r.name = ANY(c.roles)), '[]'::jsonb),
      'tab_rules', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.page_slug) FROM public.role_tab_configs c WHERE c.role_id = r.id), '[]'::jsonb),
      'column_rules', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.page_slug, c.column_key) FROM public.column_visibility_config c WHERE c.role = r.name AND c.user_id IS NULL), '[]'::jsonb),
      'data_scopes', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.data_scope_config c WHERE c.role = r.name AND c.user_id IS NULL), '[]'::jsonb),
      'assign_user_ids', coalesce((SELECT jsonb_agg(a.user_id ORDER BY a.user_id) FROM public.canonical_user_role_assignments a WHERE a.role_id = r.id), '[]'::jsonb)
    ) INTO v_before
    FROM public.roles r WHERE r.id = v_role_id FOR UPDATE;

    IF v_before IS NULL THEN
      RAISE EXCEPTION 'Role % not found', v_role_id USING ERRCODE = 'P0002';
    END IF;

    IF v_before->'role'->>'name' IS DISTINCT FROM v_name THEN
      RAISE EXCEPTION 'Role identifiers cannot be renamed; update the display name instead' USING ERRCODE = '22023';
    END IF;

    UPDATE public.roles
    SET name = v_name, display_name = v_display, description = v_description,
        is_active = v_is_active, updated_at = now()
    WHERE id = v_role_id;
  ELSE
    v_is_create := true;
    INSERT INTO public.roles (name, display_name, description, is_system_role, is_active, created_by)
    VALUES (v_name, v_display, v_description, false, v_is_active, v_actor)
    RETURNING id INTO v_role_id;
  END IF;

  DELETE FROM public.permissions WHERE role_id = v_role_id;
  IF payload ? 'permissions' AND jsonb_typeof(payload->'permissions') = 'array' THEN
    FOR v_perm IN SELECT value FROM jsonb_array_elements(payload->'permissions') LOOP
      IF nullif(btrim(coalesce(v_perm->>'resource', '')), '') IS NOT NULL
         AND nullif(btrim(coalesce(v_perm->>'action', '')), '') IS NOT NULL THEN
        INSERT INTO public.permissions (role_id, resource, action, conditions)
        VALUES (v_role_id, btrim(v_perm->>'resource'), btrim(v_perm->>'action'),
          CASE WHEN v_perm ? 'conditions' THEN v_perm->'conditions' ELSE NULL END)
        ON CONFLICT (role_id, resource, action) DO UPDATE
          SET conditions = EXCLUDED.conditions;
      END IF;
    END LOOP;
  END IF;

  IF payload ? 'page_slugs' THEN
    -- Replace only this role's page memberships; preserve other roles and tabs.
    UPDATE public.page_role_configs
      SET roles = array_remove(roles, v_name), updated_by = v_actor, updated_at = now()
      WHERE v_name = ANY(roles) AND page_slug NOT LIKE '%:%'
        AND NOT (page_slug = ANY(v_page_slugs));
  END IF;

  FOREACH v_slug IN ARRAY v_page_slugs LOOP
    SELECT roles INTO v_existing_roles
    FROM public.page_role_configs WHERE page_slug = v_slug FOR UPDATE;

    IF FOUND THEN
      IF NOT coalesce(v_name = ANY (v_existing_roles), false) THEN
        UPDATE public.page_role_configs
        SET roles = array_append(coalesce(v_existing_roles, ARRAY[]::text[]), v_name), updated_by = v_actor, updated_at = now()
        WHERE page_slug = v_slug;
      END IF;
    ELSE
      INSERT INTO public.page_role_configs (page_slug, roles, updated_by, updated_at)
      VALUES (v_slug, ARRAY[v_name], v_actor, now());
    END IF;
  END LOOP;

  IF payload ? 'tab_rules' THEN
    DELETE FROM public.role_tab_configs WHERE role_id = v_role_id;
    FOR v_tab IN SELECT value FROM jsonb_array_elements(payload->'tab_rules') LOOP
      IF jsonb_typeof(v_tab) <> 'object'
        OR nullif(btrim(v_tab->>'page_slug'), '') IS NULL
        OR btrim(v_tab->>'page_slug') NOT LIKE '%:%'
        OR jsonb_typeof(v_tab->'is_blocked') IS DISTINCT FROM 'boolean'
      THEN
        RAISE EXCEPTION 'Each tab rule requires a hub:tab page_slug and boolean is_blocked' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.role_tab_configs(role_id, page_slug, is_blocked, updated_by)
        VALUES(v_role_id, btrim(v_tab->>'page_slug'), (v_tab->>'is_blocked')::boolean, v_actor)
        ON CONFLICT(role_id, page_slug) DO UPDATE SET is_blocked = EXCLUDED.is_blocked, updated_by = EXCLUDED.updated_by, updated_at = now();
    END LOOP;
  END IF;

  -- Omitted baseline sections retain existing defaults. Supplied column rules
  -- replace only this role's defaults; user overrides remain independent.
  IF payload ? 'column_rules' THEN
    DELETE FROM public.column_visibility_config WHERE role = v_name AND user_id IS NULL;
    FOR v_column IN SELECT value FROM jsonb_array_elements(payload->'column_rules') LOOP
      IF jsonb_typeof(v_column) <> 'object'
        OR nullif(btrim(v_column->>'page_slug'), '') IS NULL
        OR nullif(btrim(v_column->>'column_key'), '') IS NULL
        OR jsonb_typeof(v_column->'is_hidden') IS DISTINCT FROM 'boolean'
      THEN
        RAISE EXCEPTION 'Each column rule requires page_slug, column_key and boolean is_hidden' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.column_visibility_config(role, page_slug, column_key, is_hidden, set_by)
        VALUES(v_name, btrim(v_column->>'page_slug'), btrim(v_column->>'column_key'), (v_column->>'is_hidden')::boolean, v_actor)
        ON CONFLICT (role, page_slug, column_key) WHERE role IS NOT NULL
        DO UPDATE SET is_hidden = EXCLUDED.is_hidden, set_by = EXCLUDED.set_by;
    END LOOP;
  END IF;
  -- Reuse the existing validated selector/mode contract inside this transaction.
  IF payload ? 'cost_scope' THEN
    IF jsonb_typeof(payload->'cost_scope') <> 'object' THEN
      RAISE EXCEPTION 'cost_scope must be an object' USING ERRCODE = '22023';
    END IF;
    PERFORM public.replace_operational_cost_data_scope(NULL, v_name,
      payload->'cost_scope'->>'mode',
      coalesce(payload->'cost_scope'->'include_values', '[]'::jsonb),
      coalesce(payload->'cost_scope'->'exclude_values', '[]'::jsonb));
  END IF;

  FOREACH v_user_id IN ARRAY v_assign_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
      RAISE EXCEPTION 'Target user % not found', v_user_id USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.canonical_user_role_assignments (user_id, role_id, assigned_by, reason)
    VALUES (v_user_id, v_role_id, v_actor, coalesce(v_reason, 'Assigned from role lifecycle'))
    ON CONFLICT (user_id, role_id) DO NOTHING;

    IF v_set_primary THEN
      UPDATE public.profiles SET role = v_name WHERE id = v_user_id;
    END IF;
  END LOOP;

  SELECT jsonb_build_object(
    'role', to_jsonb(r),
    'permissions', coalesce((
      SELECT jsonb_agg(jsonb_build_object('resource', p.resource, 'action', p.action, 'conditions', p.conditions) ORDER BY p.resource, p.action)
      FROM public.permissions p WHERE p.role_id = r.id
    ), '[]'::jsonb),
    'page_slugs', coalesce((SELECT jsonb_agg(c.page_slug ORDER BY c.page_slug) FROM public.page_role_configs c WHERE r.name = ANY(c.roles)), '[]'::jsonb),
    'tab_rules', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.page_slug) FROM public.role_tab_configs c WHERE c.role_id = r.id), '[]'::jsonb),
    'column_rules', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.page_slug, c.column_key) FROM public.column_visibility_config c WHERE c.role = r.name AND c.user_id IS NULL), '[]'::jsonb),
    'data_scopes', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.data_scope_config c WHERE c.role = r.name AND c.user_id IS NULL), '[]'::jsonb),
    'assign_user_ids', coalesce((SELECT jsonb_agg(a.user_id ORDER BY a.user_id) FROM public.canonical_user_role_assignments a WHERE a.role_id = r.id), '[]'::jsonb),
    'set_as_primary', v_set_primary
  ) INTO v_after
  FROM public.roles r WHERE r.id = v_role_id;

  INSERT INTO public.role_access_audit (role_id, actor_id, action, reason, before_state, after_state)
  VALUES (v_role_id, v_actor, CASE WHEN v_is_create THEN 'create' ELSE 'update' END,
    coalesce(v_reason, CASE WHEN v_is_create THEN 'Role created via role lifecycle' ELSE 'Role updated via role lifecycle' END),
    v_before, v_after);

  RETURN v_after;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_role_access(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_role_access(jsonb) TO authenticated;

COMMENT ON FUNCTION public.upsert_role_access(jsonb) IS
  'Atomically saves roles, permissions, page grants, role tab restrictions, role column defaults, validated cost scope and canonical assignments with complete baseline audit state.';

-- Assignment RPCs share the same canonical capability and delegation guard.
CREATE OR REPLACE FUNCTION public.assign_role_to_user(
  p_target_user_id uuid,
  p_target_role_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_role public.roles%ROWTYPE;
  v_inserted boolean := false;
  v_inserted_count integer := 0;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.current_user_has_resource_permission('roles', 'assign') THEN
    RAISE EXCEPTION 'Not authorized to assign roles' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(16103000);

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_role FROM public.roles WHERE id = p_target_role_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role not found or inactive' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_super_admin(v_actor_id) AND (
    regexp_replace(lower(v_role.name), '[^a-z]', '', 'g') IN ('superadmin', 'superadministrator', 'admin', 'administrator', 'ict')
    OR EXISTS (
      SELECT 1 FROM public.permissions p WHERE p.role_id = v_role.id
      AND ((p.resource = 'system' AND p.action = 'override') OR p.resource = 'super_admins'
        OR NOT public.current_user_has_resource_permission(p.resource, p.action))
    )
  ) THEN
    RAISE EXCEPTION 'Cannot assign roles beyond actor authority' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.canonical_user_role_assignments (user_id, role_id, assigned_by, reason)
  VALUES (p_target_user_id, v_role.id, v_actor_id, NULLIF(btrim(p_reason), ''))
  ON CONFLICT (user_id, role_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  v_inserted := v_inserted_count > 0;

  IF v_inserted THEN
    INSERT INTO public.role_access_audit (role_id, actor_id, action, reason, before_state, after_state)
    VALUES (
      v_role.id, v_actor_id, 'assign', NULLIF(btrim(p_reason), ''),
      jsonb_build_object('user_id', p_target_user_id, 'assigned', false),
      jsonb_build_object('user_id', p_target_user_id, 'assigned', true, 'role_id', v_role.id)
    );
  END IF;

  RETURN jsonb_build_object('user_id', p_target_user_id, 'role_id', v_role.id, 'role_name', v_role.name, 'created', v_inserted);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_role_from_user(
  p_target_user_id uuid,
  p_target_role_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_role public.roles%ROWTYPE;
  v_deleted boolean := false;
  v_deleted_count integer := 0;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.current_user_has_resource_permission('roles', 'assign') THEN
    RAISE EXCEPTION 'Not authorized to remove roles' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(16103000);

  SELECT * INTO v_role FROM public.roles WHERE id = p_target_role_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role not found' USING ERRCODE = 'P0002';
  END IF;

  IF regexp_replace(lower(v_role.name), '[^a-z]', '', 'g') IN ('superadmin', 'superadministrator') THEN
    IF NOT public.is_super_admin(v_actor_id) THEN
      RAISE EXCEPTION 'Only a Super Admin can remove protected owner assignments' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.canonical_user_role_assignments WHERE role_id = v_role.id AND user_id = p_target_user_id)
      AND (SELECT count(*) FROM public.canonical_user_role_assignments a JOIN public.roles r ON r.id = a.role_id
        WHERE r.is_active AND regexp_replace(lower(r.name), '[^a-z]', '', 'g') IN ('superadmin', 'superadministrator')) <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last active Super Admin role assignment' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.is_super_admin(v_actor_id) AND regexp_replace(lower(v_role.name), '[^a-z]', '', 'g') IN ('admin', 'administrator', 'ict') THEN
    RAISE EXCEPTION 'Only a Super Admin can remove protected role assignments' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.canonical_user_role_assignments
   WHERE user_id = p_target_user_id AND role_id = p_target_role_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted := v_deleted_count > 0;

  IF v_deleted THEN
    INSERT INTO public.role_access_audit (role_id, actor_id, action, reason, before_state, after_state)
    VALUES (
      v_role.id, v_actor_id, 'remove_assignment', NULLIF(btrim(p_reason), ''),
      jsonb_build_object('user_id', p_target_user_id, 'assigned', true, 'role_id', v_role.id),
      jsonb_build_object('user_id', p_target_user_id, 'assigned', false)
    );
  END IF;

  RETURN jsonb_build_object('user_id', p_target_user_id, 'role_id', v_role.id, 'role_name', v_role.name, 'removed', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_role_to_user(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_role_from_user(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_role_to_user(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_role_from_user(uuid, uuid, text) TO authenticated;

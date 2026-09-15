-- Phase 2 (items 1–3): transactional role access upsert + audit trail.
-- Authoritative model:
--   profiles.role     = primary / default role pointer
--   user_roles        = all assigned roles (system XOR custom via role_xor_check)
--   Effective access  = union of assigned roles
--   Explicit user block overrides role grants
--   Explicit user grant overrides role denial
--   Super Admin bypass remains explicit in client/server evaluators

CREATE TABLE IF NOT EXISTS public.role_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid REFERENCES public.roles(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  reason text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_role_access_audit_role_id ON public.role_access_audit(role_id);
CREATE INDEX IF NOT EXISTS idx_role_access_audit_created_at ON public.role_access_audit(created_at DESC);

ALTER TABLE public.role_access_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS role_access_audit_select_admin ON public.role_access_audit;
CREATE POLICY role_access_audit_select_admin ON public.role_access_audit
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND lower(coalesce(p.role, '')) IN ('superadmin', 'super_admin', 'super admin', 'admin')
    )
    OR EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid())
  );

COMMENT ON TABLE public.role_access_audit IS
  'Immutable history for transactional role create/update/assign via upsert_role_access.';

CREATE OR REPLACE FUNCTION public.upsert_role_access(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role_id uuid;
  v_name text;
  v_display text;
  v_description text;
  v_is_active boolean;
  v_perm jsonb;
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
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    public.is_super_admin(v_actor)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_actor
        AND lower(replace(coalesce(p.role, ''), ' ', '')) IN ('superadmin', 'super_admin', 'admin', 'ict')
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to manage roles';
  END IF;

  v_role_id := nullif(payload->>'role_id', '')::uuid;
  v_name := nullif(btrim(coalesce(payload->>'name', '')), '');
  v_display := nullif(btrim(coalesce(payload->>'display_name', '')), '');
  v_description := nullif(btrim(coalesce(payload->>'description', '')), '');
  v_is_active := coalesce((payload->>'is_active')::boolean, true);
  v_set_primary := coalesce((payload->>'set_as_primary')::boolean, true);
  v_reason := nullif(btrim(coalesce(payload->>'reason', '')), '');

  IF v_name IS NULL OR v_display IS NULL THEN
    RAISE EXCEPTION 'name and display_name are required';
  END IF;

  IF payload ? 'page_slugs' AND jsonb_typeof(payload->'page_slugs') = 'array' THEN
    SELECT coalesce(array_agg(x), ARRAY[]::text[])
    INTO v_page_slugs
    FROM (
      SELECT DISTINCT nullif(btrim(value #>> '{}'), '') AS x
      FROM jsonb_array_elements(payload->'page_slugs')
    ) s
    WHERE x IS NOT NULL;
  ELSE
    v_page_slugs := ARRAY[]::text[];
  END IF;

  IF payload ? 'assign_user_ids' AND jsonb_typeof(payload->'assign_user_ids') = 'array' THEN
    SELECT coalesce(array_agg(x), ARRAY[]::uuid[])
    INTO v_assign_ids
    FROM (
      SELECT DISTINCT nullif(btrim(value #>> '{}'), '')::uuid AS x
      FROM jsonb_array_elements(payload->'assign_user_ids')
    ) s
    WHERE x IS NOT NULL;
  ELSE
    v_assign_ids := ARRAY[]::uuid[];
  END IF;

  IF v_role_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'role', to_jsonb(r),
      'permissions', coalesce((
        SELECT jsonb_agg(jsonb_build_object('resource', p.resource, 'action', p.action) ORDER BY p.resource, p.action)
        FROM public.permissions p WHERE p.role_id = r.id
      ), '[]'::jsonb)
    )
    INTO v_before
    FROM public.roles r
    WHERE r.id = v_role_id;

    IF v_before IS NULL THEN
      RAISE EXCEPTION 'Role % not found', v_role_id;
    END IF;

    UPDATE public.roles
    SET
      name = v_name,
      display_name = v_display,
      description = v_description,
      is_active = v_is_active,
      updated_at = now()
    WHERE id = v_role_id;
  ELSE
    v_is_create := true;
    INSERT INTO public.roles (name, display_name, description, is_system_role, is_active, created_by)
    VALUES (v_name, v_display, v_description, false, v_is_active, v_actor)
    RETURNING id INTO v_role_id;
  END IF;

  -- Replace action permissions atomically within this transaction.
  DELETE FROM public.permissions WHERE role_id = v_role_id;

  IF payload ? 'permissions' AND jsonb_typeof(payload->'permissions') = 'array' THEN
    FOR v_perm IN SELECT value FROM jsonb_array_elements(payload->'permissions')
    LOOP
      IF nullif(btrim(coalesce(v_perm->>'resource', '')), '') IS NULL
         OR nullif(btrim(coalesce(v_perm->>'action', '')), '') IS NULL THEN
        CONTINUE;
      END IF;
      INSERT INTO public.permissions (role_id, resource, action, conditions)
      VALUES (
        v_role_id,
        btrim(v_perm->>'resource'),
        btrim(v_perm->>'action'),
        CASE WHEN v_perm ? 'conditions' THEN v_perm->'conditions' ELSE NULL END
      )
      ON CONFLICT (role_id, resource, action) DO NOTHING;
    END LOOP;
  END IF;

  -- Page defaults: ensure role name is listed on each selected page_slug.
  IF cardinality(v_page_slugs) > 0 THEN
    FOREACH v_slug IN ARRAY v_page_slugs
    LOOP
      SELECT roles INTO v_existing_roles
      FROM public.page_role_configs
      WHERE page_slug = v_slug;

      IF FOUND THEN
        IF NOT (v_name = ANY (v_existing_roles)) THEN
          UPDATE public.page_role_configs
          SET
            roles = array_append(v_existing_roles, v_name),
            updated_by = v_actor,
            updated_at = now()
          WHERE page_slug = v_slug;
        END IF;
      ELSE
        INSERT INTO public.page_role_configs (page_slug, roles, updated_by, updated_at)
        VALUES (v_slug, ARRAY[v_name], v_actor, now())
        ON CONFLICT (page_slug) DO UPDATE
          SET
            roles = (
              SELECT ARRAY(
                SELECT DISTINCT r
                FROM unnest(public.page_role_configs.roles || ARRAY[v_name]) AS r
              )
            ),
            updated_by = EXCLUDED.updated_by,
            updated_at = now();
      END IF;
    END LOOP;
  END IF;

  -- Assign users additively (custom roles use role_id only per XOR check).
  IF cardinality(v_assign_ids) > 0 THEN
    FOREACH v_user_id IN ARRAY v_assign_ids
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = v_user_id AND role_id = v_role_id
      ) THEN
        INSERT INTO public.user_roles (user_id, role, role_id, assigned_by, assigned_at)
        VALUES (v_user_id, NULL, v_role_id, v_actor, now());
      END IF;

      IF v_set_primary THEN
        UPDATE public.profiles
        SET role = v_name
        WHERE id = v_user_id;
      END IF;
    END LOOP;
  END IF;

  SELECT jsonb_build_object(
    'role', to_jsonb(r),
    'permissions', coalesce((
      SELECT jsonb_agg(jsonb_build_object('resource', p.resource, 'action', p.action) ORDER BY p.resource, p.action)
      FROM public.permissions p WHERE p.role_id = r.id
    ), '[]'::jsonb),
    'page_slugs', to_jsonb(v_page_slugs),
    'assign_user_ids', to_jsonb(v_assign_ids),
    'set_as_primary', v_set_primary
  )
  INTO v_after
  FROM public.roles r
  WHERE r.id = v_role_id;

  INSERT INTO public.role_access_audit (role_id, actor_id, action, reason, before_state, after_state)
  VALUES (
    v_role_id,
    v_actor,
    CASE WHEN v_is_create THEN 'create' ELSE 'update' END,
    coalesce(v_reason, CASE WHEN v_is_create THEN 'Role created via upsert_role_access' ELSE 'Role updated via upsert_role_access' END),
    v_before,
    v_after
  );

  RETURN v_after;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_role_access(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_role_access(jsonb) TO authenticated;

COMMENT ON FUNCTION public.upsert_role_access(jsonb) IS
  'Atomically create/update a role, replace action permissions, add page defaults, assign users, optionally set primary profiles.role, and write one audit row.';

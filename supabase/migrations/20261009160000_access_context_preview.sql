-- Super Admin "Preview as Role / User": returns the same access manifest shape as
-- get_current_user_access_context(), evaluated for a target role or user, so the
-- preview uses the real role/page/permission configuration instead of a client-side
-- approximation. Read-only; it never changes the caller's session or data access.
CREATE OR REPLACE FUNCTION public.get_access_context_preview(
  p_role_name text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role public.roles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only a Super Admin can preview access' USING errcode = '42501';
  END IF;

  IF (p_role_name IS NULL) = (p_user_id IS NULL) THEN
    RAISE EXCEPTION 'Provide exactly one of p_role_name or p_user_id' USING errcode = '22023';
  END IF;

  IF p_user_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
      RAISE EXCEPTION 'User % not found', p_user_id USING errcode = 'P0002';
    END IF;

    RETURN (
      WITH assigned_roles AS (
        SELECT DISTINCT r.name::text AS role_name, r.id AS role_id
        FROM public.canonical_user_role_assignments a
        JOIN public.roles r ON r.id = a.role_id AND r.is_active
        WHERE a.user_id = p_user_id
      ),
      role_names AS (
        SELECT role_name FROM assigned_roles
        UNION
        SELECT 'superAdmin' WHERE public.is_super_admin(p_user_id)
      ),
      tab_configs AS (
        SELECT coalesce(jsonb_object_agg(tab.page_slug, tab.is_blocked), '{}'::jsonb) AS value
        FROM (
          SELECT rtc.page_slug,
            count(DISTINCT rtc.role_id) FILTER (WHERE rtc.is_blocked) = (SELECT count(*) FROM assigned_roles) AS is_blocked
          FROM public.role_tab_configs rtc
          JOIN assigned_roles ar ON ar.role_id = rtc.role_id
          GROUP BY rtc.page_slug
        ) tab
      )
      SELECT jsonb_build_object(
        'user_id', p_user_id,
        'roles', coalesce((SELECT jsonb_agg(role_name ORDER BY role_name) FROM role_names), '[]'::jsonb),
        'page_role_configs', coalesce((SELECT jsonb_object_agg(page_slug, to_jsonb(roles)) FROM public.page_role_configs), '{}'::jsonb),
        'role_tab_blocks', (SELECT value FROM tab_configs),
        'page_overrides', coalesce((
          SELECT jsonb_object_agg(pao.page_slug, jsonb_build_object(
            'is_blocked', pao.is_blocked, 'notes', pao.notes, 'reason', pao.reason, 'expires_at', pao.expires_at))
          FROM public.page_access_overrides pao
          WHERE pao.user_id = p_user_id AND (pao.expires_at IS NULL OR pao.expires_at > now())
        ), '{}'::jsonb),
        'action_overrides', coalesce((
          SELECT jsonb_object_agg(upo.resource || ':' || upo.action, jsonb_build_object(
            'is_granted', upo.is_granted, 'expires_at', upo.expires_at, 'reason', upo.reason))
          FROM public.user_permission_overrides upo
          WHERE upo.user_id = p_user_id AND (upo.expires_at IS NULL OR upo.expires_at > now())
        ), '{}'::jsonb),
        'role_permissions', coalesce((
          SELECT jsonb_agg(jsonb_build_object('resource', p.resource, 'action', p.action) ORDER BY p.resource, p.action)
          FROM public.get_user_permissions(p_user_id) p
        ), '[]'::jsonb),
        'generated_at', now()
      )
    );
  END IF;

  SELECT * INTO v_role FROM public.roles WHERE name = p_role_name AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role % not found', p_role_name USING errcode = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'user_id', NULL,
    'roles', jsonb_build_array(v_role.name),
    'page_role_configs', coalesce((SELECT jsonb_object_agg(page_slug, to_jsonb(roles)) FROM public.page_role_configs), '{}'::jsonb),
    'role_tab_blocks', coalesce((
      SELECT jsonb_object_agg(rtc.page_slug, rtc.is_blocked)
      FROM public.role_tab_configs rtc WHERE rtc.role_id = v_role.id
    ), '{}'::jsonb),
    'page_overrides', '{}'::jsonb,
    'action_overrides', '{}'::jsonb,
    'role_permissions', coalesce((
      SELECT jsonb_agg(DISTINCT jsonb_build_object('resource', p.resource, 'action', p.action))
      FROM public.permissions p WHERE p.role_id = v_role.id
    ), '[]'::jsonb),
    'generated_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_access_context_preview(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_access_context_preview(text, uuid) TO authenticated;

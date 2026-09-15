-- Server-derived context for the navigation/access evaluator.
-- The caller cannot supply a user id, role, or override set: every value is
-- derived from auth.uid(). This is an incremental compatibility endpoint; page
-- baseline definitions remain in the typed application registry until they are
-- migrated into access_targets/role_grants.

CREATE OR REPLACE FUNCTION public.get_current_user_access_context()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH caller AS (
    SELECT auth.uid() AS user_id
  ),
  assigned_roles AS (
    SELECT DISTINCT role_name
    FROM (
      SELECT p.role::text AS role_name
      FROM public.profiles p
      JOIN caller c ON c.user_id = p.id
      WHERE nullif(btrim(coalesce(p.role, '')), '') IS NOT NULL

      UNION ALL

      SELECT coalesce(r.name, ur.role)::text AS role_name
      FROM public.user_roles ur
      JOIN caller c ON c.user_id = ur.user_id
      LEFT JOIN public.roles r ON r.id = ur.role_id
      WHERE nullif(btrim(coalesce(r.name, ur.role, '')), '') IS NOT NULL
    ) role_sources
  ),
  page_configs AS (
    SELECT coalesce(jsonb_object_agg(page_slug, to_jsonb(roles)), '{}'::jsonb) AS value
    FROM public.page_role_configs
  ),
  page_overrides AS (
    SELECT coalesce(jsonb_object_agg(
      pao.page_slug,
      jsonb_build_object(
        'is_blocked', pao.is_blocked,
        'notes', pao.notes
      )
    ), '{}'::jsonb) AS value
    FROM public.page_access_overrides pao
    JOIN caller c ON c.user_id = pao.user_id
  ),
  action_overrides AS (
    SELECT coalesce(jsonb_object_agg(
      upo.resource || ':' || upo.action,
      jsonb_build_object(
        'is_granted', upo.is_granted,
        'expires_at', upo.expires_at,
        'reason', upo.reason
      )
    ), '{}'::jsonb) AS value
    FROM public.user_permission_overrides upo
    JOIN caller c ON c.user_id = upo.user_id
    WHERE upo.expires_at IS NULL OR upo.expires_at > now()
  ),
  role_permissions AS (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object('resource', permission.resource, 'action', permission.action)
      ORDER BY permission.resource, permission.action
    ), '[]'::jsonb) AS value
    FROM public.get_user_permissions((SELECT user_id FROM caller)) permission
  )
  SELECT jsonb_build_object(
    'user_id', (SELECT user_id FROM caller),
    'roles', coalesce((SELECT jsonb_agg(role_name ORDER BY role_name) FROM assigned_roles), '[]'::jsonb),
    'page_role_configs', (SELECT value FROM page_configs),
    'page_overrides', (SELECT value FROM page_overrides),
    'action_overrides', (SELECT value FROM action_overrides),
    'role_permissions', (SELECT value FROM role_permissions),
    'generated_at', now()
  );
$function$;

REVOKE ALL ON FUNCTION public.get_current_user_access_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_access_context() TO authenticated;

COMMENT ON FUNCTION public.get_current_user_access_context() IS
  'Authenticated user access context for client navigation evaluation. Identity and overrides are derived from auth.uid(); it is not a data-authorization bypass.';

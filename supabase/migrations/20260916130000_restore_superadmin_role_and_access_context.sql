-- Super Admin must exist as a canonical role, and the access context must
-- include appointed Super Admins even when assignment rows lag behind.
BEGIN;

INSERT INTO public.roles (name, display_name, description, is_system_role, is_active)
SELECT 'superAdmin', 'Super Admin', 'Platform owner role with full access', true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles
  WHERE regexp_replace(lower(name), '[^a-z]', '', 'g') IN ('superadmin', 'superadministrator')
);

-- Backfill canonical assignments for every active super_admins appointment.
INSERT INTO public.canonical_user_role_assignments (user_id, role_id, assigned_by, reason)
SELECT sa.user_id, r.id, sa.user_id, 'Backfilled from super_admins appointment'
FROM public.super_admins sa
JOIN public.roles r
  ON regexp_replace(lower(r.name), '[^a-z]', '', 'g') IN ('superadmin', 'superadministrator')
 AND r.is_active
WHERE coalesce(sa.is_active, true)
ON CONFLICT (user_id, role_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_current_user_access_context()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  with caller as (
    select auth.uid() as user_id
  ),
  assigned_roles as (
    select distinct r.name::text as role_name
    from public.canonical_user_role_assignments assignment
    join caller c on c.user_id = assignment.user_id
    join public.roles r on r.id = assignment.role_id and r.is_active = true
    union
    select 'superAdmin'::text as role_name
    from caller c
    where c.user_id is not null and public.is_super_admin(c.user_id)
  ),
  tab_configs as (
    select coalesce(jsonb_object_agg(tab.page_slug, tab.is_blocked), '{}'::jsonb) as value
    from (
      select rtc.page_slug,
        count(distinct rtc.role_id) filter (where rtc.is_blocked) = (
          select count(*) from public.canonical_user_role_assignments a
          join caller c on c.user_id = a.user_id
          join public.roles r on r.id = a.role_id and r.is_active = true
        ) as is_blocked
      from public.role_tab_configs rtc
      join public.canonical_user_role_assignments a on a.role_id = rtc.role_id
      join caller c on c.user_id = a.user_id
      join public.roles r on r.id = a.role_id and r.is_active = true
      group by rtc.page_slug
    ) tab
  ),
  page_configs as (
    select coalesce(jsonb_object_agg(page_slug, to_jsonb(roles)), '{}'::jsonb) as value
    from public.page_role_configs
  ),
  page_overrides as (
    select coalesce(jsonb_object_agg(
      pao.page_slug,
      jsonb_build_object(
        'is_blocked', pao.is_blocked,
        'notes', pao.notes,
        'reason', pao.reason,
        'expires_at', pao.expires_at
      )
    ), '{}'::jsonb) as value
    from public.page_access_overrides pao
    join caller c on c.user_id = pao.user_id
    where pao.expires_at is null or pao.expires_at > now()
  ),
  action_overrides as (
    select coalesce(jsonb_object_agg(
      upo.resource || ':' || upo.action,
      jsonb_build_object(
        'is_granted', upo.is_granted,
        'expires_at', upo.expires_at,
        'reason', upo.reason
      )
    ), '{}'::jsonb) as value
    from public.user_permission_overrides upo
    join caller c on c.user_id = upo.user_id
    where upo.expires_at is null or upo.expires_at > now()
  ),
  role_permissions as (
    select coalesce(jsonb_agg(
      jsonb_build_object('resource', permission.resource, 'action', permission.action)
      order by permission.resource, permission.action
    ), '[]'::jsonb) as value
    from public.get_user_permissions((select user_id from caller)) permission
  )
  select jsonb_build_object(
    'user_id', (select user_id from caller),
    'roles', coalesce((select jsonb_agg(role_name order by role_name) from assigned_roles), '[]'::jsonb),
    'page_role_configs', (select value from page_configs),
    'role_tab_blocks', (select value from tab_configs),
    'page_overrides', (select value from page_overrides),
    'action_overrides', (select value from action_overrides),
    'role_permissions', (select value from role_permissions),
    'generated_at', now()
  );
$function$;

REVOKE ALL ON FUNCTION public.get_current_user_access_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_access_context() TO authenticated;

COMMIT;

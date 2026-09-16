-- The runtime manifest must apply the same expiry rule as the editor.  It also
-- reads the canonical multi-role assignment table; legacy user_roles remains a
-- compatibility source until it can be removed after a reference audit.

create or replace function public.get_current_user_access_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with caller as (
    select auth.uid() as user_id
  ),
  assigned_roles as (
    select distinct r.name::text as role_name
    from public.canonical_user_role_assignments assignment
    join caller c on c.user_id = assignment.user_id
    join public.roles r on r.id = assignment.role_id and r.is_active = true
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
    'page_overrides', (select value from page_overrides),
    'action_overrides', (select value from action_overrides),
    'role_permissions', (select value from role_permissions),
    'generated_at', now()
  );
$function$;

revoke all on function public.get_current_user_access_context() from public;
grant execute on function public.get_current_user_access_context() to authenticated;


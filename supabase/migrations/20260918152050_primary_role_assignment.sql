-- Let an administrator explicitly choose whether an additive role assignment
-- should also become the user's primary/display role. Existing assignments
-- remain additive; primary-role changes are deliberate and audited.
--
-- Replace the former three-argument signature rather than leaving two RPCs
-- with different authorization rules available through PostgREST.
drop function if exists public.assign_role_to_user(uuid, uuid, text);

create or replace function public.assign_role_to_user(
  p_target_user_id uuid,
  p_target_role_id uuid,
  p_reason text default null,
  p_make_primary boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_role public.roles%rowtype;
  v_previous_primary text;
  v_inserted boolean := false;
  v_inserted_count integer := 0;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.current_user_has_resource_permission('roles', 'assign') then
    raise exception 'Not authorized to assign roles' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(16103000);

  select role into v_previous_primary
  from public.profiles
  where id = p_target_user_id
  for update;
  if not found then
    raise exception 'Target user not found' using errcode = 'P0002';
  end if;

  select * into v_role
  from public.roles
  where id = p_target_role_id and is_active = true
  for update;
  if not found then
    raise exception 'Role not found or inactive' using errcode = 'P0002';
  end if;

  if not public.is_super_admin(v_actor_id) and (
    regexp_replace(lower(v_role.name), '[^a-z]', '', 'g') in ('superadmin', 'superadministrator', 'admin', 'administrator', 'ict')
    or exists (
      select 1
      from public.permissions permission
      where permission.role_id = v_role.id
        and (
          (permission.resource = 'system' and permission.action = 'override')
          or permission.resource = 'super_admins'
          or not public.current_user_has_resource_permission(permission.resource, permission.action)
        )
    )
  ) then
    raise exception 'Cannot assign roles beyond actor authority' using errcode = '42501';
  end if;

  insert into public.canonical_user_role_assignments (user_id, role_id, assigned_by, reason)
  values (p_target_user_id, v_role.id, v_actor_id, nullif(btrim(p_reason), ''))
  on conflict (user_id, role_id) do nothing;
  get diagnostics v_inserted_count = row_count;
  v_inserted := v_inserted_count > 0;

  if p_make_primary and v_previous_primary is distinct from v_role.name then
    update public.profiles set role = v_role.name where id = p_target_user_id;
  end if;

  if v_inserted or p_make_primary then
    insert into public.role_access_audit (role_id, actor_id, action, reason, before_state, after_state)
    values (
      v_role.id, v_actor_id,
      case when p_make_primary then 'assign_primary' else 'assign' end,
      nullif(btrim(p_reason), ''),
      jsonb_build_object('user_id', p_target_user_id, 'assigned', not v_inserted, 'primary_role', v_previous_primary),
      jsonb_build_object('user_id', p_target_user_id, 'assigned', true, 'role_id', v_role.id, 'primary_role', case when p_make_primary then v_role.name else v_previous_primary end)
    );
  end if;

  return jsonb_build_object(
    'user_id', p_target_user_id,
    'role_id', v_role.id,
    'role_name', v_role.name,
    'created', v_inserted,
    'is_primary', p_make_primary
  );
end;
$$;

revoke all on function public.assign_role_to_user(uuid, uuid, text, boolean) from public;
grant execute on function public.assign_role_to_user(uuid, uuid, text, boolean) to authenticated;

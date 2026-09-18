-- When Make primary updates profiles.role, also clear leftover legacy user_roles
-- text rows that still drive the navbar/sidebar via roles[0] (e.g. dataCollector
-- after Field Assistant was set as primary).
--
-- Custom roles like "Field Assistant" are NOT valid user_roles.role text values
-- (check constraint). Mirror them with role_id only when needed.
-- Sync runs whenever p_make_primary is true — even if profiles.role already matches.
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
  v_new_key text;
  v_is_system_text_role boolean := false;
  v_primary_changed boolean := false;
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

  if p_make_primary then
    v_primary_changed := v_previous_primary is distinct from v_role.name;
    if v_primary_changed then
      update public.profiles set role = v_role.name where id = p_target_user_id;
    end if;

    v_new_key := regexp_replace(lower(v_role.name), '[^a-z]', '', 'g');

    -- Always clear leftover legacy text roles that are not the primary,
    -- even when profiles.role was already correct (dindu case).
    delete from public.user_roles ur
    where ur.user_id = p_target_user_id
      and ur.role is not null
      and ur.role_id is null
      and regexp_replace(lower(ur.role), '[^a-z]', '', 'g') is distinct from v_new_key;

    v_is_system_text_role := v_role.name = any (array[
      'SuperAdmin','Admin','CountryDirector','ICT','Field Operation Manager (FOM)',
      'FinancialAdmin','ProjectManager','SeniorOperationsLead','Supervisor','Coordinator',
      'DataTeam','DataCollector','Reviewer','Employee','HR','HRManager',
      'superAdmin','admin','countryDirector','ict','fom','financialAdmin','projectManager',
      'seniorOperationsLead','supervisor','coordinator','dataTeam','dataCollector','reviewer',
      'employee','hr','hrManager'
    ]::text[]);

    if v_is_system_text_role then
      insert into public.user_roles (user_id, role, assigned_at, status)
      select p_target_user_id, v_role.name, now(), 'offline'
      where not exists (
        select 1 from public.user_roles ur
        where ur.user_id = p_target_user_id
          and ur.role_id is null
          and regexp_replace(lower(coalesce(ur.role, '')), '[^a-z]', '', 'g') = v_new_key
      );
    else
      insert into public.user_roles (user_id, role_id, assigned_at, status)
      select p_target_user_id, v_role.id, now(), 'offline'
      where not exists (
        select 1 from public.user_roles ur
        where ur.user_id = p_target_user_id and ur.role_id = v_role.id
      );
    end if;
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

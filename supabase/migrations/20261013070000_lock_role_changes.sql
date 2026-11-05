-- Role changes are governed by the roles:assign permission instead of the
-- caller's own (self-editable) profiles.role text.

-- 1. Any change to profiles.role / additional_roles needs roles:assign.
create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (new.role is distinct from old.role
      or new.additional_roles is distinct from old.additional_roles)
     and not public.current_user_has_resource_permission('roles', 'assign') then
    raise exception 'Changing roles requires the roles:assign permission'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_role_change_trigger on public.profiles;
create trigger guard_profile_role_change_trigger
  before update of role, additional_roles on public.profiles
  for each row execute function public.guard_profile_role_change();

-- 2. Only the platform owner can grant the Super Admin role (primary or additional).
create or replace function public.protect_admin_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_has boolean;
  old_has boolean;
begin
  if auth.uid() = 'eeaf10a4-84ad-42d7-8042-ab0a42e69e5b'::uuid then
    return new;
  end if;

  select bool_or(lower(regexp_replace(coalesce(r->>'role', r #>> '{}', ''), '[\s_-]+', '', 'g')) = 'superadmin')
    into new_has
  from jsonb_array_elements(case when jsonb_typeof(new.additional_roles) = 'array' then new.additional_roles else '[]'::jsonb end) r;

  select bool_or(lower(regexp_replace(coalesce(r->>'role', r #>> '{}', ''), '[\s_-]+', '', 'g')) = 'superadmin')
    into old_has
  from jsonb_array_elements(case when jsonb_typeof(old.additional_roles) = 'array' then old.additional_roles else '[]'::jsonb end) r;

  if (lower(regexp_replace(coalesce(new.role, ''), '[\s_-]+', '', 'g')) = 'superadmin'
      and lower(regexp_replace(coalesce(old.role, ''), '[\s_-]+', '', 'g')) <> 'superadmin')
     or (coalesce(new_has, false) and not coalesce(old_has, false)) then
    raise exception 'Only the platform owner can assign the Super Admin role'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.protect_super_admin_user_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  role_key text;
begin
  if auth.uid() is null or auth.uid() = 'eeaf10a4-84ad-42d7-8042-ab0a42e69e5b'::uuid then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.role is not distinct from old.role
     and new.role_id is not distinct from old.role_id then
    return new;
  end if;

  select lower(regexp_replace(coalesce(new.role, r.name, ''), '[\s_-]+', '', 'g'))
    into role_key
  from (select 1) x
  left join public.roles r on r.id = new.role_id;

  if role_key = 'superadmin' then
    raise exception 'Only the platform owner can assign the Super Admin role'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_super_admin_user_role_trigger on public.user_roles;
create trigger protect_super_admin_user_role_trigger
  before insert or update on public.user_roles
  for each row execute function public.protect_super_admin_user_role();

-- 3. Writing role assignments needs roles:assign; reading others' needs users:read.
create or replace function public.profile_can_manage_user_roles(check_uid uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select check_uid is not null
     and check_uid = auth.uid()
     and public.current_user_has_resource_permission('roles', 'assign');
$$;

alter policy user_roles_select_policy on public.user_roles
  using (
    user_id = (select auth.uid())
    or public.profile_can_manage_user_roles((select auth.uid()))
    or (select public.current_user_has_resource_permission('users', 'read'))
  );

alter policy canonical_role_assignments_read on public.canonical_user_role_assignments
  using (
    user_id = (select auth.uid())
    or public.profile_can_manage_user_roles((select auth.uid()))
    or (select public.current_user_has_resource_permission('users', 'read'))
  );

-- 4. admin_update_profile is gated by users:update (role edits still hit the trigger above).
create or replace function public.admin_update_profile(
  target_id uuid,
  new_full_name text default null,
  new_username text default null,
  new_email text default null,
  new_role text default null,
  new_avatar_url text default null,
  new_hub_id text default null,
  new_state_id text default null,
  new_locality_id text default null,
  new_employee_id text default null,
  new_phone text default null,
  new_bank_account jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.current_user_has_resource_permission('users', 'update') then
    raise exception 'Forbidden: users:update permission required'
      using errcode = '42501';
  end if;

  update public.profiles
  set
    full_name    = coalesce(new_full_name,    full_name),
    username     = coalesce(new_username,     username),
    email        = coalesce(new_email,        email),
    role         = coalesce(new_role,         role),
    avatar_url   = case when new_avatar_url is not null then new_avatar_url else avatar_url end,
    hub_id       = coalesce(new_hub_id,       hub_id),
    state_id     = coalesce(new_state_id,     state_id),
    locality_id  = coalesce(new_locality_id,  locality_id),
    employee_id  = coalesce(new_employee_id,  employee_id),
    phone        = coalesce(new_phone,        phone),
    bank_account = coalesce(new_bank_account, bank_account)
  where id = target_id;
end;
$$;

revoke execute on function public.admin_update_profile(uuid, text, text, text, text, text, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.admin_update_profile(uuid, text, text, text, text, text, text, text, text, text, text, jsonb) to authenticated, service_role;

-- 5. Self sign-up may only pick the roles offered on the sign-up form.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := NEW.raw_user_meta_data->>'role';
begin
  insert into public.profiles (
    id, email, full_name, username, role, hub_id, state_id, locality_id,
    phone, employee_id, avatar_url, status, created_at
  ) values (
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    coalesce(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    case when requested_role in ('dataCollector', 'coordinator', 'supervisor', 'employee')
         then requested_role else 'dataCollector' end,
    NEW.raw_user_meta_data->>'hubId',
    NEW.raw_user_meta_data->>'stateId',
    NEW.raw_user_meta_data->>'localityId',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'employeeId',
    NEW.raw_user_meta_data->>'avatar',
    'pending',
    now()
  ) on conflict (id) do nothing;

  return NEW;
end;
$$;

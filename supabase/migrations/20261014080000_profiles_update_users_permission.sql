-- Editing other people's profiles is governed by users:update instead of role names.
drop policy if exists "Admins can update any profile" on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists profiles_admin_update_status on public.profiles;

create policy profiles_update_with_users_permission on public.profiles
  for update to authenticated
  using ((select public.current_user_has_resource_permission('users', 'update')))
  with check ((select public.current_user_has_resource_permission('users', 'update')));

-- Users could otherwise approve or reactivate their own account via the own-profile policy.
create or replace function public.guard_profile_account_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.status is distinct from old.status
     and not public.current_user_has_resource_permission('users', 'approve') then
    raise exception 'Approving or rejecting accounts requires the users:approve permission'
      using errcode = '42501';
  end if;

  if new.is_active is distinct from old.is_active
     and not public.current_user_has_resource_permission('users', 'update') then
    raise exception 'Activating or deactivating accounts requires the users:update permission'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_account_status_trigger on public.profiles;
create trigger guard_profile_account_status_trigger
  before update of status, is_active on public.profiles
  for each row execute function public.guard_profile_account_status();

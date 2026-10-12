-- Once a profile has bank details, only callers with users:update may change or clear them.
-- Adding details the first time stays open to the profile owner (existing RLS still applies).
create or replace function public.protect_bank_account_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or old.bank_account is null
     or new.bank_account is not distinct from old.bank_account then
    return new;
  end if;

  if public.current_user_has_resource_permission('users', 'update') then
    return new;
  end if;

  raise exception 'Changing saved bank details requires the users:update permission'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_protect_bank_account_changes on public.profiles;
create trigger trg_protect_bank_account_changes
  before update of bank_account on public.profiles
  for each row execute function public.protect_bank_account_changes();

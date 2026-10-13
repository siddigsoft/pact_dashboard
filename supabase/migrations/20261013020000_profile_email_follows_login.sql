-- The login email (auth.users) is the source of truth; profiles.email follows it
-- once a change is confirmed.
create or replace function public.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set email = new.email
   where id = new.id
     and email is distinct from new.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_profile_email_from_auth();

-- Signed-in users can't edit profiles.email directly. Self-service changes go through
-- the confirmed login-email flow; admin changes go through the admin-update-email
-- function (service role), which updates the login email too.
create or replace function public.protect_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or new.email is not distinct from old.email then
    return new;
  end if;

  raise exception 'Profile email follows the login email and cannot be edited directly'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_protect_profile_email on public.profiles;
create trigger trg_protect_profile_email
  before update of email on public.profiles
  for each row execute function public.protect_profile_email();

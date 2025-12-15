-- Migration: Bidirectional cascade deletion between auth.users and profiles
-- This ensures:
-- 1. When a user is deleted from auth.users, the profile is automatically deleted (already handled by FK cascade)
-- 2. When a profile is deleted, the auth.users record is also deleted (new trigger)
-- 3. When a user is created in auth.users, a profile is automatically created (already exists, but ensuring it's active)

-- Function to delete auth.users when profile is deleted
-- Note: This requires security definer to access auth.users table
-- We use AFTER DELETE to avoid conflicts with the FK cascade
create or replace function public.handle_profile_deleted()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Delete the corresponding auth.users record if it still exists
  -- We check if it exists first to avoid errors and handle the case where
  -- the user was already deleted (which would have cascaded to delete the profile)
  if exists (select 1 from auth.users where id = old.id) then
    delete from auth.users where id = old.id;
  end if;
  return old;
end;
$$;

-- Drop trigger if it exists
drop trigger if exists on_profile_deleted on public.profiles;

-- Create trigger to delete auth.users when profile is deleted
-- Using AFTER DELETE to ensure the profile deletion completes first
create trigger on_profile_deleted
  after delete on public.profiles
  for each row execute function public.handle_profile_deleted();

-- Ensure the profile creation trigger is active (recreate if needed)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, 
    email, 
    full_name, 
    username, 
    role, 
    hub_id, 
    state_id, 
    locality_id, 
    phone, 
    employee_id,
    avatar_url,
    status, 
    created_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'dataCollector'),
    new.raw_user_meta_data->>'hubId',
    new.raw_user_meta_data->>'stateId',
    new.raw_user_meta_data->>'localityId',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'employeeId',
    new.raw_user_meta_data->>'avatar',
    'pending',
    now()
  ) on conflict (id) do nothing;
  return new;
end;
$$;

-- Ensure the trigger exists
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Add comment for documentation
comment on function public.handle_profile_deleted() is 'Deletes the corresponding auth.users record when a profile is deleted, ensuring bidirectional cascade deletion';
comment on function public.handle_new_user() is 'Creates a profile automatically when a new user is created in auth.users';


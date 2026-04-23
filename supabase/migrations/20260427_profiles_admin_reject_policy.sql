-- Allow admins to reject pending user registrations.
--
-- Symptom this fixes: rejecting a pending user from /users showed
-- "Rejection blocked — No user was deleted. Check Row Level Security
-- policies for profiles." The frontend was either trying to DELETE the
-- profile (blocked by RLS) or UPDATE status='rejected' (also blocked,
-- because no policy allowed admins to write that column).
--
-- This migration:
--   1. Ensures the soft-reject columns exist on profiles.
--   2. Adds an RLS policy that lets admins / super_admins / hr update
--      ANY profile's status / is_active / metadata fields.
--   3. Adds a parallel DELETE policy for super_admin only, as a last-resort
--      hard-delete path (used when soft-reject columns are missing).
--
-- Idempotent — safe to re-run.

-- 1. Soft-reject columns
alter table public.profiles add column if not exists status     text;
alter table public.profiles add column if not exists is_active  boolean;

-- 2. Admin UPDATE policy (soft-reject + activate/deactivate)
drop policy if exists "profiles_admin_update_status" on public.profiles;
create policy "profiles_admin_update_status" on public.profiles
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin','super_admin','superadmin','hr','hr_manager')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin','super_admin','superadmin','hr','hr_manager')
    )
  );

-- 3. Hard-delete policy (super_admin only)
drop policy if exists "profiles_superadmin_delete" on public.profiles;
create policy "profiles_superadmin_delete" on public.profiles
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('super_admin','superadmin')
    )
  );

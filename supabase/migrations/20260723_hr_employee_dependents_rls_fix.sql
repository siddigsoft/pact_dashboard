-- ── Fix RLS policies for hr_employee_dependents ───────────────────────────────
-- Previous policies only matched 'super_admin' but some accounts store
-- 'superadmin' (no underscore). This replaces all four policies with a
-- broader role check covering all admin-tier variants.

-- Drop old policies
drop policy if exists "Admins read dependents"    on public.hr_employee_dependents;
drop policy if exists "Staff read own dependents" on public.hr_employee_dependents;
drop policy if exists "Admins insert dependents"  on public.hr_employee_dependents;
drop policy if exists "Admins update dependents"  on public.hr_employee_dependents;
drop policy if exists "Admins delete dependents"  on public.hr_employee_dependents;

-- Helper: is the current user an admin-tier role?
-- Covers all known variants: admin, super_admin, superadmin, hr_admin, ict, fom
create or replace function public.is_hr_admin_tier()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and lower(role) in ('admin','super_admin','superadmin','hr_admin','ict','fom')
  );
$$;

-- SELECT: admins see all rows; staff see their own
create policy "dep_select_admin"
  on public.hr_employee_dependents for select
  using ( public.is_hr_admin_tier() or profile_id = auth.uid() );

-- INSERT: admins can add dependents for anyone; staff can add their own
create policy "dep_insert"
  on public.hr_employee_dependents for insert
  with check ( public.is_hr_admin_tier() or profile_id = auth.uid() );

-- UPDATE: admins can update any; staff can update their own
create policy "dep_update"
  on public.hr_employee_dependents for update
  using ( public.is_hr_admin_tier() or profile_id = auth.uid() );

-- DELETE: admins can delete any; staff can delete their own
create policy "dep_delete"
  on public.hr_employee_dependents for delete
  using ( public.is_hr_admin_tier() or profile_id = auth.uid() );

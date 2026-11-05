-- Benefits: add the plan/enrollment columns the app uses, create open enrollment
-- periods, and let staff request their own enrollment with benefits:submit.

alter table public.hr_benefit_plans
  add column if not exists plan_tier text not null default 'standard'
    check (plan_tier in ('basic', 'standard', 'premium')),
  add column if not exists coverage_type text not null default 'individual'
    check (coverage_type in ('individual', 'family', 'individual_plus_one')),
  add column if not exists effective_date date,
  add column if not exists hub_id text references public.hubs(id) on delete set null,
  add column if not exists max_dependents int not null default 4;

create table if not exists public.hr_open_enrollment_periods (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  description       text,
  starts_at         date not null,
  ends_at           date not null,
  eligible_plan_ids uuid[] not null default '{}',
  is_active         boolean not null default true,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

alter table public.hr_benefit_enrollments
  add column if not exists effective_date date,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists dependents_json jsonb not null default '[]'::jsonb,
  add column if not exists hub_id text references public.hubs(id) on delete set null,
  add column if not exists enrollment_period_id uuid
    references public.hr_open_enrollment_periods(id) on delete set null;

create index if not exists idx_hr_benefit_plans_hub on public.hr_benefit_plans(hub_id);
create index if not exists idx_hr_benefit_enrollments_user on public.hr_benefit_enrollments(user_id);
create index if not exists idx_hr_benefit_enrollments_approved_by on public.hr_benefit_enrollments(approved_by);
create index if not exists idx_hr_benefit_enrollments_hub on public.hr_benefit_enrollments(hub_id);
create index if not exists idx_hr_benefit_enrollments_period on public.hr_benefit_enrollments(enrollment_period_id);
create index if not exists idx_oep_active on public.hr_open_enrollment_periods(is_active, starts_at, ends_at);
create index if not exists idx_oep_created_by on public.hr_open_enrollment_periods(created_by);

alter table public.hr_open_enrollment_periods enable row level security;

revoke all on public.hr_benefit_plans, public.hr_benefit_enrollments,
              public.hr_open_enrollment_periods from anon;
revoke truncate, references, trigger on public.hr_benefit_plans, public.hr_benefit_enrollments,
              public.hr_open_enrollment_periods from authenticated;

-- Every role may request its own enrollment.
insert into public.permissions (role_id, resource, action)
select r.id, 'benefits', 'submit' from public.roles r
on conflict (role_id, resource, action) do nothing;

-- Plans: readable by signed-in users (unchanged meaning, now scoped to authenticated).
drop policy if exists hr_benefit_plans_select on public.hr_benefit_plans;
create policy hr_benefit_plans_select on public.hr_benefit_plans
  for select to authenticated using (true);

-- Enrollment periods
create policy hr_open_enrollment_periods_read on public.hr_open_enrollment_periods
  for select to authenticated
  using (
    (select public.current_user_has_resource_permission('benefits', 'submit'))
    or (select public.current_user_has_resource_permission('benefits', 'read'))
  );

create policy hr_open_enrollment_periods_insert on public.hr_open_enrollment_periods
  for insert to authenticated
  with check ((select public.current_user_has_resource_permission('benefits', 'create')));

create policy hr_open_enrollment_periods_update on public.hr_open_enrollment_periods
  for update to authenticated
  using ((select public.current_user_has_resource_permission('benefits', 'update')))
  with check ((select public.current_user_has_resource_permission('benefits', 'update')));

create policy hr_open_enrollment_periods_delete on public.hr_open_enrollment_periods
  for delete to authenticated
  using ((select public.current_user_has_resource_permission('benefits', 'delete')));

-- Enrollments: staff may request (or re-request) their own, pending and unapproved.
create policy hr_benefit_enrollments_self_insert on public.hr_benefit_enrollments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and approved_by is null and approved_at is null
    and (select public.current_user_has_resource_permission('benefits', 'submit'))
  );

create policy hr_benefit_enrollments_self_update on public.hr_benefit_enrollments
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and status in ('pending', 'terminated')
    and (select public.current_user_has_resource_permission('benefits', 'submit'))
  )
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and approved_by is null and approved_at is null
  );

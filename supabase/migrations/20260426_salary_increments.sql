-- Salary Increments module.
-- The page src/pages/SalaryIncrements.tsx already expects this shape.
-- Each row is one increment event: previous → new salary on a given date,
-- with reason, type, optional approver. When status='approved' and
-- effective_date <= today, employee_salary_config can be auto-updated.

create table if not exists public.salary_increments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null,                          -- profiles.id of the employee
  effective_date      date not null,
  previous_salary     numeric(12,2),
  new_salary          numeric(12,2) not null,
  increment_type      text not null default 'annual',         -- annual|merit|promotion|cost_of_living|market_adjustment|correction|other
  increment_percent   numeric(6,2),                           -- computed convenience field
  currency            text not null default 'USD',
  reason              text,
  status              text not null default 'pending'
                        check (status in ('pending','approved','rejected')),
  requested_by        uuid,
  approved_by         uuid,
  approved_at         timestamptz,
  rejection_reason    text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_salary_inc_user      on public.salary_increments(user_id);
create index if not exists idx_salary_inc_effective on public.salary_increments(effective_date);
create index if not exists idx_salary_inc_status    on public.salary_increments(status);

alter table public.salary_increments enable row level security;

-- Employees can read their own; HR/finance/admin can read all.
drop policy if exists "salary_inc_read" on public.salary_increments;
create policy "salary_inc_read" on public.salary_increments
  for select using (
    auth.uid() = user_id
    or exists (select 1 from profiles
                where id = auth.uid()
                  and lower(coalesce(role,'')) in ('admin','super_admin','superadmin','hr','finance'))
  );

-- Only HR/finance/admin can write.
drop policy if exists "salary_inc_write" on public.salary_increments;
create policy "salary_inc_write" on public.salary_increments
  for all using (
    exists (select 1 from profiles
             where id = auth.uid()
               and lower(coalesce(role,'')) in ('admin','super_admin','superadmin','hr','finance'))
  ) with check (
    exists (select 1 from profiles
             where id = auth.uid()
               and lower(coalesce(role,'')) in ('admin','super_admin','superadmin','hr','finance'))
  );

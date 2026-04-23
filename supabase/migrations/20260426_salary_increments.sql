-- Salary Increments module.
-- The page src/pages/SalaryIncrements.tsx already expects this shape.
-- Each row is one increment event: previous → new salary on a given date,
-- with reason, type, optional approver. When status='approved' and
-- effective_date <= today, employee_salary_config can be auto-updated.
--
-- Idempotent: works whether the table is fresh OR a partial pre-existing
-- table is present (older deployments may have a `salary_increments` table
-- without `status`/`increment_type`/etc., causing index/policy creation
-- to fail with "column does not exist"). We create-if-missing, then add
-- every column individually with `add column if not exists`.

create table if not exists public.salary_increments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null,
  effective_date      date not null,
  new_salary          numeric(12,2) not null,
  created_at          timestamptz not null default now()
);

-- Backfill any missing columns on a pre-existing table.
alter table public.salary_increments add column if not exists previous_salary    numeric(12,2);
alter table public.salary_increments add column if not exists increment_type     text not null default 'annual';
alter table public.salary_increments add column if not exists increment_percent  numeric(6,2);
alter table public.salary_increments add column if not exists currency           text not null default 'USD';
alter table public.salary_increments add column if not exists reason             text;
alter table public.salary_increments add column if not exists status             text not null default 'pending';
alter table public.salary_increments add column if not exists requested_by       uuid;
alter table public.salary_increments add column if not exists approved_by        uuid;
alter table public.salary_increments add column if not exists approved_at        timestamptz;
alter table public.salary_increments add column if not exists rejection_reason   text;
alter table public.salary_increments add column if not exists notes              text;
alter table public.salary_increments add column if not exists updated_at         timestamptz not null default now();

-- Add the status check constraint only if not present.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'salary_increments_status_check'
      and conrelid = 'public.salary_increments'::regclass
  ) then
    alter table public.salary_increments
      add constraint salary_increments_status_check
      check (status in ('pending','approved','rejected'));
  end if;
end$$;

create index if not exists idx_salary_inc_user      on public.salary_increments(user_id);
create index if not exists idx_salary_inc_effective on public.salary_increments(effective_date);
create index if not exists idx_salary_inc_status    on public.salary_increments(status);

alter table public.salary_increments enable row level security;

-- Policies are guarded so the migration succeeds even if the local `profiles`
-- table doesn't have a `role` column under that exact name. Detect the column
-- name dynamically.
do $$
declare
  has_role boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='role'
  ) into has_role;

  execute 'drop policy if exists "salary_inc_read" on public.salary_increments';
  execute 'drop policy if exists "salary_inc_write" on public.salary_increments';

  if has_role then
    execute $p$
      create policy "salary_inc_read" on public.salary_increments
        for select using (
          auth.uid() = user_id
          or exists (select 1 from public.profiles
                      where id = auth.uid()
                        and lower(coalesce(role,'')) in ('admin','super_admin','superadmin','hr','finance'))
        )
    $p$;
    execute $p$
      create policy "salary_inc_write" on public.salary_increments
        for all using (
          exists (select 1 from public.profiles
                   where id = auth.uid()
                     and lower(coalesce(role,'')) in ('admin','super_admin','superadmin','hr','finance'))
        ) with check (
          exists (select 1 from public.profiles
                   where id = auth.uid()
                     and lower(coalesce(role,'')) in ('admin','super_admin','superadmin','hr','finance'))
        )
    $p$;
  else
    -- Fallback: only the employee can read their own row, no one can write
    -- via PostgREST. Adjust the policies after profiles.role is restored.
    execute $p$
      create policy "salary_inc_read" on public.salary_increments
        for select using (auth.uid() = user_id)
    $p$;
  end if;
end$$;

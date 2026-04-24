-- Performance Reviews module.
-- The page src/pages/PerformanceReviews.tsx already expects this shape.
-- Tables:
--   performance_review_cycles — reusable review periods (annual, mid-year, etc.)
--   performance_reviews       — individual review records per employee+cycle
-- Workflow: draft → submitted (self-assess) → in_review (manager) → completed.
--
-- Idempotent: works whether the tables are fresh OR a partial pre-existing
-- table is present (older deployments may have a `performance_reviews` table
-- without `cycle_id`/`status`/`goals`/etc., causing index/policy creation
-- to fail with "column does not exist"). We create-if-missing, then add
-- every column individually with `add column if not exists`.

create table if not exists public.performance_review_cycles (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  created_at      timestamptz not null default now()
);

alter table public.performance_review_cycles add column if not exists review_type     text;
alter table public.performance_review_cycles add column if not exists starts_on       date;
alter table public.performance_review_cycles add column if not exists ends_on         date;
alter table public.performance_review_cycles add column if not exists due_on          date;
alter table public.performance_review_cycles add column if not exists status          text not null default 'draft';
alter table public.performance_review_cycles add column if not exists created_by      uuid;
alter table public.performance_review_cycles add column if not exists updated_at      timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'performance_review_cycles_status_check'
      and conrelid = 'public.performance_review_cycles'::regclass
  ) then
    alter table public.performance_review_cycles
      add constraint performance_review_cycles_status_check
      check (status in ('draft','open','closed'));
  end if;
end$$;

create table if not exists public.performance_reviews (
  id                  uuid primary key default gen_random_uuid(),
  reviewee_id         uuid not null,
  created_at          timestamptz not null default now()
);

alter table public.performance_reviews add column if not exists cycle_id            uuid;
alter table public.performance_reviews add column if not exists reviewer_id         uuid;
alter table public.performance_reviews add column if not exists review_period       text;
alter table public.performance_reviews add column if not exists review_type         text;
alter table public.performance_reviews add column if not exists status              text not null default 'draft';
alter table public.performance_reviews add column if not exists overall_rating      numeric(3,2);
alter table public.performance_reviews add column if not exists goals               jsonb not null default '[]'::jsonb;
alter table public.performance_reviews add column if not exists competencies        jsonb not null default '[]'::jsonb;
alter table public.performance_reviews add column if not exists self_assessment     text;
alter table public.performance_reviews add column if not exists manager_comments    text;
alter table public.performance_reviews add column if not exists strengths           text;
alter table public.performance_reviews add column if not exists development_areas   text;
alter table public.performance_reviews add column if not exists next_goals          text;
alter table public.performance_reviews add column if not exists submitted_at        timestamptz;
alter table public.performance_reviews add column if not exists reviewed_at         timestamptz;
alter table public.performance_reviews add column if not exists updated_at          timestamptz not null default now();

-- Add the FK from cycle_id → cycles only if missing.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'performance_reviews_cycle_id_fkey'
      and conrelid = 'public.performance_reviews'::regclass
  ) then
    alter table public.performance_reviews
      add constraint performance_reviews_cycle_id_fkey
      foreign key (cycle_id) references public.performance_review_cycles(id) on delete set null;
  end if;
end$$;

-- Add the status check only if missing.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'performance_reviews_status_check'
      and conrelid = 'public.performance_reviews'::regclass
  ) then
    alter table public.performance_reviews
      add constraint performance_reviews_status_check
      check (status in ('draft','submitted','in_review','completed'));
  end if;
end$$;

create index if not exists idx_perf_reviews_reviewee on public.performance_reviews(reviewee_id);
create index if not exists idx_perf_reviews_reviewer on public.performance_reviews(reviewer_id);
create index if not exists idx_perf_reviews_cycle    on public.performance_reviews(cycle_id);

alter table public.performance_review_cycles enable row level security;
alter table public.performance_reviews        enable row level security;

drop policy if exists "perf_cycles_read_all" on public.performance_review_cycles;
create policy "perf_cycles_read_all" on public.performance_review_cycles
  for select using (auth.uid() is not null);

drop policy if exists "perf_cycles_admin_write" on public.performance_review_cycles;
create policy "perf_cycles_admin_write" on public.performance_review_cycles
  for all using (
    exists (select 1 from profiles
             where id = auth.uid()
               and lower(coalesce(role,'')) in ('admin','super_admin','superadmin','hr'))
  ) with check (
    exists (select 1 from profiles
             where id = auth.uid()
               and lower(coalesce(role,'')) in ('admin','super_admin','superadmin','hr'))
  );

-- Reviewees see their own; reviewers see assigned; admins/HR see all.
drop policy if exists "perf_reviews_read" on public.performance_reviews;
create policy "perf_reviews_read" on public.performance_reviews
  for select using (
    auth.uid() = reviewee_id
    or auth.uid() = reviewer_id
    or exists (select 1 from profiles
                where id = auth.uid()
                  and lower(coalesce(role,'')) in ('admin','super_admin','superadmin','hr'))
  );

drop policy if exists "perf_reviews_write" on public.performance_reviews;
create policy "perf_reviews_write" on public.performance_reviews
  for all using (
    auth.uid() = reviewee_id
    or auth.uid() = reviewer_id
    or exists (select 1 from profiles
                where id = auth.uid()
                  and lower(coalesce(role,'')) in ('admin','super_admin','superadmin','hr'))
  ) with check (
    auth.uid() = reviewee_id
    or auth.uid() = reviewer_id
    or exists (select 1 from profiles
                where id = auth.uid()
                  and lower(coalesce(role,'')) in ('admin','super_admin','superadmin','hr'))
  );

-- Performance Reviews module.
-- The page src/pages/PerformanceReviews.tsx already expects this shape.
-- Tables:
--   performance_review_cycles — reusable review periods (annual, mid-year, etc.)
--   performance_reviews       — individual review records per employee+cycle
-- Workflow: draft → submitted (self-assess) → in_review (manager) → completed.

create table if not exists public.performance_review_cycles (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,                                 -- e.g. "FY26 Annual"
  review_type     text not null,                                 -- annual|mid_year|probation|quarterly|project_completion
  starts_on       date not null,
  ends_on         date not null,
  due_on          date,
  status          text not null default 'draft'
                    check (status in ('draft','open','closed')),
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.performance_reviews (
  id                  uuid primary key default gen_random_uuid(),
  cycle_id            uuid references public.performance_review_cycles(id) on delete set null,
  reviewee_id         uuid not null,                              -- profiles.id
  reviewer_id         uuid,                                       -- profiles.id (usually manager)
  review_period       text not null,                              -- e.g. "2026-Q1"
  review_type         text not null,
  status              text not null default 'draft'
                        check (status in ('draft','submitted','in_review','completed')),
  overall_rating      numeric(3,2),                               -- 0..5
  goals               jsonb not null default '[]'::jsonb,
  competencies        jsonb not null default '[]'::jsonb,
  self_assessment     text,
  manager_comments    text,
  strengths           text,
  development_areas   text,
  next_goals          text,
  submitted_at        timestamptz,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

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

-- ============================================================
-- PACT HR: Benefits Enrollment, Succession Planning & Pulse Surveys
-- Apply in Supabase SQL Editor
-- ============================================================

-- ── 1. Enhance hr_benefit_plans ───────────────────────────────────────────────
alter table hr_benefit_plans
  add column if not exists plan_tier text not null default 'standard'
    check (plan_tier in ('basic','standard','premium')),
  add column if not exists coverage_type text not null default 'individual'
    check (coverage_type in ('individual','family','individual_plus_one')),
  add column if not exists effective_date date,
  add column if not exists hub_id uuid references hubs(id) on delete set null,
  add column if not exists max_dependents int not null default 4;

-- ── 2. Enhance hr_benefit_enrollments ────────────────────────────────────────
alter table hr_benefit_enrollments
  add column if not exists effective_date date,
  add column if not exists approved_by uuid references profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists dependents_json jsonb not null default '[]'::jsonb,
  add column if not exists hub_id uuid references hubs(id) on delete set null,
  add column if not exists enrollment_period_id uuid;

-- ── 3. Open Enrollment Periods ───────────────────────────────────────────────
create table if not exists hr_open_enrollment_periods (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  starts_at     date not null,
  ends_at       date not null,
  eligible_plan_ids uuid[] not null default '{}',
  is_active     boolean not null default true,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table hr_benefit_enrollments
  add constraint fk_enrollment_period
    foreign key (enrollment_period_id)
    references hr_open_enrollment_periods(id)
    on delete set null
  not valid;

alter table hr_benefit_enrollments
  validate constraint fk_enrollment_period;

-- RLS for open enrollment periods
alter table hr_open_enrollment_periods enable row level security;

drop policy if exists oep_select on hr_open_enrollment_periods;
create policy oep_select on hr_open_enrollment_periods for select
  using (auth.uid() is not null);

drop policy if exists oep_write on hr_open_enrollment_periods;
create policy oep_write on hr_open_enrollment_periods for all
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and role in ('super_admin','superAdmin','SuperAdmin','admin','Admin','hr','hr_manager')
    )
  );

-- ── 4. Succession Planning — add columns to positions ────────────────────────
alter table positions
  add column if not exists is_critical_role boolean not null default false,
  add column if not exists primary_successor_id uuid references profiles(id) on delete set null,
  add column if not exists secondary_successor_id uuid references profiles(id) on delete set null,
  add column if not exists successor_readiness int check (successor_readiness between 0 and 100),
  add column if not exists succession_notes text;

create index if not exists idx_positions_critical on positions(is_critical_role) where is_critical_role = true;

-- ── 5. Pulse Surveys ─────────────────────────────────────────────────────────
create table if not exists hr_pulse_surveys (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  questions   jsonb not null default '[]'::jsonb,
  -- each question: { id, text, type: 'rating'|'nps'|'text'|'yes_no', required: bool }
  target_hub_id uuid references hubs(id) on delete set null,  -- null = all staff
  starts_at   date not null,
  ends_at     date not null,
  is_active   boolean not null default true,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Responses are intentionally NOT linked to a user — strict anonymity
create table if not exists hr_pulse_responses (
  id          uuid primary key default gen_random_uuid(),
  survey_id   uuid not null references hr_pulse_surveys(id) on delete cascade,
  responses   jsonb not null default '{}'::jsonb,
  -- { question_id: answer_value }
  hub_id      uuid references hubs(id) on delete set null,  -- coarse grouping only
  submitted_at timestamptz not null default now()
  -- NO user_id: responses are anonymous
);

create index if not exists idx_pulse_responses_survey on hr_pulse_responses(survey_id);
create index if not exists idx_pulse_responses_hub on hr_pulse_responses(hub_id);

-- RLS: any authenticated user can read active surveys
alter table hr_pulse_surveys enable row level security;

drop policy if exists ps_select on hr_pulse_surveys;
create policy ps_select on hr_pulse_surveys for select
  using (auth.uid() is not null);

drop policy if exists ps_write on hr_pulse_surveys;
create policy ps_write on hr_pulse_surveys for all
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and role in ('super_admin','superAdmin','SuperAdmin','admin','Admin','hr','hr_manager')
    )
  );

-- RLS for responses: any authenticated user can INSERT (anonymous submission).
-- Only admins can SELECT aggregates. No UPDATE/DELETE allowed (immutable audit).
alter table hr_pulse_responses enable row level security;

drop policy if exists pr_insert on hr_pulse_responses;
create policy pr_insert on hr_pulse_responses for insert
  with check (auth.uid() is not null);

drop policy if exists pr_select_admin on hr_pulse_responses;
create policy pr_select_admin on hr_pulse_responses for select
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and role in ('super_admin','superAdmin','SuperAdmin','admin','Admin','hr','hr_manager')
    )
  );

-- ── 6. Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_oep_active on hr_open_enrollment_periods(is_active, starts_at, ends_at);
create index if not exists idx_hr_pulse_surveys_active on hr_pulse_surveys(is_active, starts_at, ends_at);

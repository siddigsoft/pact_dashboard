-- HR enhancement pack: Recruitment/ATS, Disciplinary/Grievance Tracking,
-- Benefits Administration, Headcount Planning.
-- (Org Chart Visualization needs no new table — it reads profiles.reports_to.)
--
-- Apply manually in the Supabase SQL editor for the PACT production project.
-- Safe to re-run: every statement is guarded with IF NOT EXISTS / DO blocks.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Recruitment / Applicant Tracking
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists hr_job_postings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department_id uuid references departments(id) on delete set null,
  position_id uuid references positions(id) on delete set null,
  employment_type text not null default 'full_time',
  status text not null default 'open' check (status in ('open', 'on_hold', 'closed')),
  headcount_needed int not null default 1,
  description text,
  requirements text,
  opened_at date not null default current_date,
  closed_at date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hr_candidates (
  id uuid primary key default gen_random_uuid(),
  job_posting_id uuid not null references hr_job_postings(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  resume_url text,
  source text,
  stage text not null default 'applied'
    check (stage in ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected')),
  rating int check (rating between 1 and 5),
  interview_date timestamptz,
  interviewer_id uuid references profiles(id) on delete set null,
  notes text,
  applied_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hr_candidates_posting on hr_candidates(job_posting_id);
create index if not exists idx_hr_candidates_stage on hr_candidates(stage);

alter table hr_job_postings enable row level security;
alter table hr_candidates enable row level security;

drop policy if exists hr_job_postings_select on hr_job_postings;
create policy hr_job_postings_select on hr_job_postings for select
  using (auth.role() = 'authenticated');

drop policy if exists hr_job_postings_write on hr_job_postings;
create policy hr_job_postings_write on hr_job_postings for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('super_admin', 'admin', 'hr', 'hr_manager')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('super_admin', 'admin', 'hr', 'hr_manager')));

drop policy if exists hr_candidates_select on hr_candidates;
create policy hr_candidates_select on hr_candidates for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('super_admin', 'admin', 'hr', 'hr_manager')));

drop policy if exists hr_candidates_write on hr_candidates;
create policy hr_candidates_write on hr_candidates for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('super_admin', 'admin', 'hr', 'hr_manager')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('super_admin', 'admin', 'hr', 'hr_manager')));

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Disciplinary / Grievance Tracking
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists hr_disciplinary_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  case_type text not null default 'disciplinary' check (case_type in ('disciplinary', 'grievance')),
  category text,
  severity text not null default 'low' check (severity in ('low', 'medium', 'high', 'critical')),
  description text not null,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'closed')),
  incident_date date not null default current_date,
  raised_by uuid references profiles(id) on delete set null,
  assigned_to uuid references profiles(id) on delete set null,
  resolution_notes text,
  resolved_at timestamptz,
  confidential boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hr_disciplinary_user on hr_disciplinary_cases(user_id);
create index if not exists idx_hr_disciplinary_status on hr_disciplinary_cases(status);

alter table hr_disciplinary_cases enable row level security;

-- Restricted to HR/admin only — this is deliberately more locked-down than
-- other HR tables since it holds sensitive personnel records. Staff do NOT
-- get read access to their own case (case visibility itself is sensitive).
drop policy if exists hr_disciplinary_cases_all on hr_disciplinary_cases;
create policy hr_disciplinary_cases_all on hr_disciplinary_cases for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('super_admin', 'admin', 'hr', 'hr_manager')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('super_admin', 'admin', 'hr', 'hr_manager')));

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Benefits Administration
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists hr_benefit_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan_type text not null default 'health_insurance'
    check (plan_type in ('health_insurance', 'pension', 'social_security', 'life_insurance', 'other')),
  provider text,
  employer_cost numeric(14,2) not null default 0,
  employee_cost numeric(14,2) not null default 0,
  currency text not null default 'SDG',
  is_active boolean not null default true,
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hr_benefit_enrollments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references hr_benefit_plans(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('pending', 'active', 'terminated')),
  dependents_count int not null default 0,
  enrolled_at date not null default current_date,
  terminated_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, user_id)
);

create index if not exists idx_hr_benefit_enrollments_user on hr_benefit_enrollments(user_id);
create index if not exists idx_hr_benefit_enrollments_plan on hr_benefit_enrollments(plan_id);

alter table hr_benefit_plans enable row level security;
alter table hr_benefit_enrollments enable row level security;

drop policy if exists hr_benefit_plans_select on hr_benefit_plans;
create policy hr_benefit_plans_select on hr_benefit_plans for select
  using (auth.role() = 'authenticated');

drop policy if exists hr_benefit_plans_write on hr_benefit_plans;
create policy hr_benefit_plans_write on hr_benefit_plans for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('super_admin', 'admin', 'hr', 'hr_manager')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('super_admin', 'admin', 'hr', 'hr_manager')));

drop policy if exists hr_benefit_enrollments_select_own on hr_benefit_enrollments;
create policy hr_benefit_enrollments_select_own on hr_benefit_enrollments for select
  using (
    user_id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('super_admin', 'admin', 'hr', 'hr_manager'))
  );

drop policy if exists hr_benefit_enrollments_write on hr_benefit_enrollments;
create policy hr_benefit_enrollments_write on hr_benefit_enrollments for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('super_admin', 'admin', 'hr', 'hr_manager')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('super_admin', 'admin', 'hr', 'hr_manager')));

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Headcount Planning
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists hr_headcount_plans (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references departments(id) on delete set null,
  position_title text not null,
  fiscal_year int not null,
  quarter int check (quarter between 1 and 4),
  current_count int not null default 0,
  budgeted_count int not null default 0,
  planned_hires int not null default 0,
  planned_salary_cost numeric(14,2) not null default 0,
  currency text not null default 'SDG',
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hr_headcount_plans_fy on hr_headcount_plans(fiscal_year, quarter);

alter table hr_headcount_plans enable row level security;

drop policy if exists hr_headcount_plans_select on hr_headcount_plans;
create policy hr_headcount_plans_select on hr_headcount_plans for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('super_admin', 'admin', 'hr', 'hr_manager', 'finance')));

drop policy if exists hr_headcount_plans_write on hr_headcount_plans;
create policy hr_headcount_plans_write on hr_headcount_plans for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('super_admin', 'admin', 'hr', 'hr_manager')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('super_admin', 'admin', 'hr', 'hr_manager')));

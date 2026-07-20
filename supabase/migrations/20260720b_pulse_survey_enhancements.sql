-- ============================================================
-- Pulse Survey Enhancements v2
-- Run after: 20260720_hr_benefits_succession_pulse_surveys.sql
-- ============================================================

-- 1. Department-based targeting
alter table hr_pulse_surveys
  add column if not exists target_department_id uuid references departments(id) on delete set null,
  add column if not exists target_audience text not null default 'all'
    check (target_audience in ('all','hub','department'));

-- 2. Reminder scheduling
alter table hr_pulse_surveys
  add column if not exists enable_reminders boolean not null default false,
  add column if not exists reminder_days integer[] not null default '{3,7}';

-- 3. Anonymous dedup token
--    respondent_hash is a random UUID generated client-side (NOT derived from
--    user identity). It is stored in the browser's localStorage under
--    pact_pulse_token_<survey_id>. The same browser cannot submit twice (unique
--    constraint), but the token cannot be used to identify the respondent.
alter table hr_pulse_responses
  add column if not exists respondent_hash text;

alter table hr_pulse_responses
  drop constraint if exists uq_pulse_response_hash;

alter table hr_pulse_responses
  add constraint uq_pulse_response_hash unique (survey_id, respondent_hash);

-- 4. Department snapshot on response (for department breakdown analytics)
--    Captured at submission time from the user's current department_id.
--    No user_id is stored — the department is a coarse grouping only.
alter table hr_pulse_responses
  add column if not exists department_id uuid references departments(id) on delete set null;

create index if not exists idx_pulse_responses_dept on hr_pulse_responses(department_id);

-- 5. Index for reminder cron queries
create index if not exists idx_pulse_surveys_reminders
  on hr_pulse_surveys(enable_reminders, is_active, ends_at)
  where enable_reminders = true;

-- 6. Update SELECT RLS so authenticated users can read surveys
drop policy if exists ps_select on hr_pulse_surveys;
create policy ps_select on hr_pulse_surveys for select
  to authenticated using (true);

-- 7. Benefits enrollment self-service RLS
--    Employees must be able to INSERT their own pending enrollment.
--    HR/admin can do everything via the existing admin policy.

-- 7a. Allow each authenticated user to read their own enrollments
drop policy if exists be_self_select on hr_benefit_enrollments;
create policy be_self_select on hr_benefit_enrollments for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('admin','super_admin','hr','hr_manager','HR','HR Admin','hr_admin')
    )
  );

-- 7b. Allow each authenticated user to INSERT only their own pending enrollment
drop policy if exists be_self_insert on hr_benefit_enrollments;
create policy be_self_insert on hr_benefit_enrollments for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
  );

-- 7c. Allow employees to update only their own pending requests (e.g. cancel)
--     HR/admin updates (approve/reject) are handled by the existing admin policy.
drop policy if exists be_self_update on hr_benefit_enrollments;
create policy be_self_update on hr_benefit_enrollments for update
  to authenticated
  using (
    user_id = auth.uid()
    and status = 'pending'
  )
  with check (
    user_id = auth.uid()
    and status = 'pending'
  );

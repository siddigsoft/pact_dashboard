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

-- 3. Anonymous dedup — respondent_hash prevents double-submission
--    The hash is SHA-256(survey_id || ':' || user_id || ':pulse_v1'),
--    computed client-side. It cannot be reversed to reveal user identity
--    without knowing the user_id corpus.
alter table hr_pulse_responses
  add column if not exists respondent_hash text;

-- Unique constraint: one response per (survey, hash) pair
alter table hr_pulse_responses
  drop constraint if exists uq_pulse_response_hash;

alter table hr_pulse_responses
  add constraint uq_pulse_response_hash unique (survey_id, respondent_hash);

-- 4. Index for reminder cron queries
create index if not exists idx_pulse_surveys_reminders
  on hr_pulse_surveys(enable_reminders, is_active, ends_at)
  where enable_reminders = true;

-- 5. Update SELECT RLS so authenticated users can read surveys
--    regardless of target audience (filtering is done in app layer)
drop policy if exists ps_select on hr_pulse_surveys;
create policy ps_select on hr_pulse_surveys for select
  to authenticated using (true);

-- Pulse survey tables (never created in the database) with pulse_surveys:* rules.
-- Responses stay anonymous: no user id is stored.

create table if not exists public.hr_pulse_surveys (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  description          text,
  questions            jsonb not null default '[]'::jsonb,
  target_audience      text not null default 'all' check (target_audience in ('all', 'hub', 'department')),
  target_hub_id        text references public.hubs(id) on delete set null,
  target_department_id uuid references public.departments(id) on delete set null,
  starts_at            date not null,
  ends_at              date not null,
  is_active            boolean not null default true,
  enable_reminders     boolean not null default false,
  reminder_days        integer[] not null default '{3,7}',
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now()
);

create table if not exists public.hr_pulse_responses (
  id              uuid primary key default gen_random_uuid(),
  survey_id       uuid not null references public.hr_pulse_surveys(id) on delete cascade,
  responses       jsonb not null default '{}'::jsonb,
  hub_id          text references public.hubs(id) on delete set null,
  department_id   uuid references public.departments(id) on delete set null,
  respondent_hash text,
  submitted_at    timestamptz not null default now(),
  constraint uq_pulse_response_hash unique (survey_id, respondent_hash)
);

create index if not exists idx_hr_pulse_surveys_active on public.hr_pulse_surveys(is_active, starts_at, ends_at);
create index if not exists idx_pulse_surveys_reminders on public.hr_pulse_surveys(enable_reminders, is_active, ends_at)
  where enable_reminders = true;
create index if not exists idx_hr_pulse_surveys_created_by on public.hr_pulse_surveys(created_by);
create index if not exists idx_pulse_responses_hub on public.hr_pulse_responses(hub_id);
create index if not exists idx_pulse_responses_dept on public.hr_pulse_responses(department_id);

alter table public.hr_pulse_surveys enable row level security;
alter table public.hr_pulse_responses enable row level security;

revoke all on public.hr_pulse_surveys, public.hr_pulse_responses from anon;
revoke truncate, references, trigger on public.hr_pulse_surveys, public.hr_pulse_responses from authenticated;
revoke update, delete on public.hr_pulse_responses from authenticated;

-- Every role may answer surveys.
insert into public.permissions (role_id, resource, action)
select r.id, 'pulse_surveys', 'submit' from public.roles r
on conflict (role_id, resource, action) do nothing;

-- Surveys: respondents see active ones; managers see all.
create policy hr_pulse_surveys_read on public.hr_pulse_surveys
  for select to authenticated
  using (
    (is_active and (select public.current_user_has_resource_permission('pulse_surveys', 'submit')))
    or (select public.current_user_has_resource_permission('pulse_surveys', 'read'))
    or (select public.current_user_has_resource_permission('pulse_surveys', 'update'))
    or (select public.current_user_has_resource_permission('pulse_surveys', 'delete'))
  );

create policy hr_pulse_surveys_insert on public.hr_pulse_surveys
  for insert to authenticated
  with check ((select public.current_user_has_resource_permission('pulse_surveys', 'create')));

create policy hr_pulse_surveys_update on public.hr_pulse_surveys
  for update to authenticated
  using ((select public.current_user_has_resource_permission('pulse_surveys', 'update')))
  with check ((select public.current_user_has_resource_permission('pulse_surveys', 'update')));

create policy hr_pulse_surveys_delete on public.hr_pulse_surveys
  for delete to authenticated
  using ((select public.current_user_has_resource_permission('pulse_surveys', 'delete')));

-- Responses: insert-only while the survey is open; results need pulse_surveys:read.
create policy hr_pulse_responses_insert on public.hr_pulse_responses
  for insert to authenticated
  with check (
    (select public.current_user_has_resource_permission('pulse_surveys', 'submit'))
    and exists (select 1 from public.hr_pulse_surveys s
                 where s.id = hr_pulse_responses.survey_id
                   and s.is_active
                   and current_date between s.starts_at and s.ends_at)
  );

create policy hr_pulse_responses_read on public.hr_pulse_responses
  for select to authenticated
  using ((select public.current_user_has_resource_permission('pulse_surveys', 'read')));

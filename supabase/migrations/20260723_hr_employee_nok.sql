-- ── hr_employee_nok ───────────────────────────────────────────────────────────
-- Standalone Next of Kin / Emergency Contact record per employee.
-- Separate from hr_employee_dependents so NOK can be anyone (not just a dependent).
-- The dependents table keeps its own is_next_of_kin flag for the case where
-- the NOK also happens to be a listed dependent.

create table if not exists public.hr_employee_nok (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  full_name    text not null,
  relationship text not null default 'other',
  phone        text,
  email        text,
  address      text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One NOK record per employee (enforced at DB level)
create unique index if not exists hr_employee_nok_profile_unique
  on public.hr_employee_nok (profile_id);

create index if not exists hr_employee_nok_profile_id_idx
  on public.hr_employee_nok (profile_id);

-- RLS
alter table public.hr_employee_nok enable row level security;

create policy "nok_select"
  on public.hr_employee_nok for select
  using ( public.is_hr_admin_tier() or profile_id = auth.uid() );

create policy "nok_insert"
  on public.hr_employee_nok for insert
  with check ( public.is_hr_admin_tier() or profile_id = auth.uid() );

create policy "nok_update"
  on public.hr_employee_nok for update
  using ( public.is_hr_admin_tier() or profile_id = auth.uid() );

create policy "nok_delete"
  on public.hr_employee_nok for delete
  using ( public.is_hr_admin_tier() or profile_id = auth.uid() );

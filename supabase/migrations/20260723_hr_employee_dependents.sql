-- ── hr_employee_dependents ────────────────────────────────────────────────────
-- Stores family members, dependents, and benefit beneficiaries for each staff
-- member. Referenced by the Dependents & Beneficiaries tab on employee profiles.

create table if not exists public.hr_employee_dependents (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  full_name        text not null,
  relationship     text not null default 'child',
  date_of_birth    date,
  gender           text,
  national_id_no   text,
  is_beneficiary   boolean not null default false,
  health_insurance boolean not null default false,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Indexes
create index if not exists hr_employee_dependents_profile_id_idx
  on public.hr_employee_dependents (profile_id);

-- RLS
alter table public.hr_employee_dependents enable row level security;

-- Admins and HR can read all dependents
create policy "Admins read dependents"
  on public.hr_employee_dependents for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin','super_admin','hr_admin','ict')
    )
  );

-- Staff can read their own dependents
create policy "Staff read own dependents"
  on public.hr_employee_dependents for select
  using (profile_id = auth.uid());

-- Admins and HR can insert
create policy "Admins insert dependents"
  on public.hr_employee_dependents for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin','super_admin','hr_admin','ict')
    )
  );

-- Admins and HR can update
create policy "Admins update dependents"
  on public.hr_employee_dependents for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin','super_admin','hr_admin','ict')
    )
  );

-- Admins and HR can delete
create policy "Admins delete dependents"
  on public.hr_employee_dependents for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin','super_admin','hr_admin','ict')
    )
  );

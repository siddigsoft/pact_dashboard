-- T013: EOSB day-rate settings table
-- Previously the End of Service Benefit (EOSB) accrual rule (21 days/year for
-- the first 5 years of service, 30 days/year thereafter — per Sudan Labour
-- Law) was hardcoded in the frontend (EOSBPanel.tsx). This migration adds a
-- singleton settings table so the thresholds/rates can be tuned without a
-- code deploy. The frontend falls back to the same hardcoded defaults if this
-- table is empty or unreachable, so this migration is purely additive/safe.
--
-- Apply manually in the Supabase SQL editor. Not auto-run by the app.

create table if not exists public.hr_eosb_settings (
  id uuid primary key default gen_random_uuid(),
  tier1_years_threshold numeric not null default 5,   -- years of service at/under which tier1 rate applies
  tier1_days_per_year numeric not null default 21,     -- accrual days per year of service, years 1..tier1_years_threshold
  tier2_days_per_year numeric not null default 30,     -- accrual days per year of service, years beyond tier1_years_threshold
  days_per_month numeric not null default 30,          -- days used to derive a daily rate from monthly salary
  min_service_months numeric not null default 12,      -- minimum months of service before any entitlement accrues
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.hr_eosb_settings is 'Singleton configuration table for End of Service Benefit (EOSB) accrual rates. Only one row is expected/used (the most recently updated one).';

alter table public.hr_eosb_settings enable row level security;

drop policy if exists "hr_eosb_settings_select" on public.hr_eosb_settings;
create policy "hr_eosb_settings_select" on public.hr_eosb_settings
  for select using (auth.role() = 'authenticated');

drop policy if exists "hr_eosb_settings_write" on public.hr_eosb_settings;
create policy "hr_eosb_settings_write" on public.hr_eosb_settings
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('super_admin', 'admin', 'hr', 'hrManager', 'financialAdmin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('super_admin', 'admin', 'hr', 'hrManager', 'financialAdmin')
    )
  );

-- Seed one default row matching the previous hardcoded behavior, only if the
-- table is currently empty.
insert into public.hr_eosb_settings (tier1_years_threshold, tier1_days_per_year, tier2_days_per_year, days_per_month, min_service_months)
select 5, 21, 30, 30, 12
where not exists (select 1 from public.hr_eosb_settings);

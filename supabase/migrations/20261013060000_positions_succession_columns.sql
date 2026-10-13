-- Succession columns from 20260720_hr_benefits_succession_pulse_surveys.sql that never
-- reached the live database; Positions, Org Chart and Offboarding read and write them.

alter table public.positions
  add column if not exists is_critical_role boolean not null default false,
  add column if not exists primary_successor_id uuid references public.profiles(id) on delete set null,
  add column if not exists secondary_successor_id uuid references public.profiles(id) on delete set null,
  add column if not exists successor_readiness int check (successor_readiness between 0 and 100),
  add column if not exists succession_notes text;

create index if not exists idx_positions_critical on public.positions(is_critical_role) where is_critical_role = true;

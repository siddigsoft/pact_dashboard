-- Positions & Vacancies. A "position" is a budgeted slot in the org structure
-- that is independent of who currently fills it. This lets HR/managers see
-- vacant headcount and plan hiring without depending on profile records.

create table if not exists public.positions (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  department_id       uuid references public.departments(id) on delete set null,
  reports_to_position uuid references public.positions(id) on delete set null,
  level               text,                                       -- e.g. "manager","officer","director"
  employment_type     text default 'full_time'
                        check (employment_type in ('full_time','part_time','contractor','intern','consultant')),
  current_holder_id   uuid,                                       -- profiles.id; null = vacant
  vacancy_status      text not null default 'filled'
                        check (vacancy_status in ('filled','open','frozen','planned')),
  opened_at           date,
  target_fill_date    date,
  monthly_budget      numeric(12,2),
  currency            text default 'USD',
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_positions_department on public.positions(department_id);
create index if not exists idx_positions_holder     on public.positions(current_holder_id);
create index if not exists idx_positions_vacancy    on public.positions(vacancy_status);

-- Auto-sync vacancy_status from current_holder_id changes.
create or replace function public.sync_position_vacancy_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.current_holder_id is distinct from old.current_holder_id then
    if new.current_holder_id is null and new.vacancy_status = 'filled' then
      new.vacancy_status := 'open';
      new.opened_at      := coalesce(new.opened_at, current_date);
    elsif new.current_holder_id is not null then
      new.vacancy_status := 'filled';
      new.opened_at      := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_positions_sync_vacancy on public.positions;
create trigger trg_positions_sync_vacancy
before update on public.positions
for each row execute function public.sync_position_vacancy_status();

alter table public.positions enable row level security;

-- All staff can see the position structure (helps with transparency / planning).
drop policy if exists "positions_read_all" on public.positions;
create policy "positions_read_all" on public.positions
  for select using (auth.uid() is not null);

-- HR/admin can write.
drop policy if exists "positions_admin_write" on public.positions;
create policy "positions_admin_write" on public.positions
  for all using (
    exists (select 1 from profiles
             where id = auth.uid()
               and lower(coalesce(role,'')) in ('admin','super_admin','superadmin','hr'))
  ) with check (
    exists (select 1 from profiles
             where id = auth.uid()
               and lower(coalesce(role,'')) in ('admin','super_admin','superadmin','hr'))
  );

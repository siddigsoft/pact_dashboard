-- Enumerator Reconciliation Records
-- Stores per-enumerator settlement decisions made during cycle close.
-- One record per (mmp_id, enumerator_id) pair.

create table if not exists public.enumerator_reconciliation_records (
  id                  uuid primary key default gen_random_uuid(),
  mmp_id              uuid not null references public.mmp_files(id) on delete cascade,
  enumerator_id       uuid references public.profiles(id) on delete set null,
  enumerator_name     text,
  settlement_status   text not null default 'pending'
                        check (settlement_status in ('pending','payment_generated','recovery_scheduled','written_off','redirected','balanced')),
  settlement_note     text,
  net_to_pay          numeric(14,2) default 0,
  advance_paid        numeric(14,2) default 0,
  total_earned        numeric(14,2) default 0,
  currency            text not null default 'SDG',
  decided_by          uuid references public.profiles(id) on delete set null,
  decided_by_name     text,
  decided_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Unique constraint so upsert works cleanly
create unique index if not exists uniq_enum_recon_mmp_enum
  on public.enumerator_reconciliation_records (mmp_id, enumerator_id)
  where enumerator_id is not null;

-- RLS
alter table public.enumerator_reconciliation_records enable row level security;

create policy "Authenticated users can read reconciliation records"
  on public.enumerator_reconciliation_records for select
  to authenticated using (true);

create policy "Authenticated users can upsert reconciliation records"
  on public.enumerator_reconciliation_records for insert
  to authenticated with check (true);

create policy "Authenticated users can update reconciliation records"
  on public.enumerator_reconciliation_records for update
  to authenticated using (true);

-- Updated_at trigger
create or replace function public.set_updated_at_enumerator_recon()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_enum_recon_updated_at on public.enumerator_reconciliation_records;
create trigger trg_enum_recon_updated_at
  before update on public.enumerator_reconciliation_records
  for each row execute procedure public.set_updated_at_enumerator_recon();

-- Indexes
create index if not exists idx_enum_recon_mmp_id on public.enumerator_reconciliation_records(mmp_id);
create index if not exists idx_enum_recon_status on public.enumerator_reconciliation_records(settlement_status);

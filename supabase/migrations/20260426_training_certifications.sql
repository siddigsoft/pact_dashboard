-- Training & Certifications register. Tracks each training event or
-- certification issued to an employee, with expiry and renewal reminders.

create table if not exists public.training_records (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null,                              -- profiles.id
  title               text not null,
  category            text not null default 'training'
                        check (category in ('training','certification','license','workshop','conference')),
  provider            text,
  issued_on           date,
  expires_on          date,
  status              text not null default 'active'
                        check (status in ('active','expired','revoked','planned')),
  cost                numeric(12,2),
  currency            text default 'USD',
  evidence_url        text,                                       -- e.g. PDF certificate in storage
  notes               text,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_training_user    on public.training_records(user_id);
create index if not exists idx_training_expires on public.training_records(expires_on);
create index if not exists idx_training_status  on public.training_records(status);

-- Auto-mark expired when expires_on passes (queried on read; no nightly job needed).
create or replace view public.training_records_v as
  select
    t.*,
    case
      when t.status = 'revoked' then 'revoked'
      when t.expires_on is not null and t.expires_on < current_date then 'expired'
      else t.status
    end as effective_status,
    case
      when t.expires_on is not null then (t.expires_on - current_date)
      else null
    end as days_until_expiry
  from public.training_records t;

alter table public.training_records enable row level security;

-- Employees can read their own; HR/admin can read all.
drop policy if exists "training_read" on public.training_records;
create policy "training_read" on public.training_records
  for select using (
    auth.uid() = user_id
    or exists (select 1 from profiles
                where id = auth.uid()
                  and lower(coalesce(role,'')) in ('admin','super_admin','superadmin','hr'))
  );

-- HR/admin can write.
drop policy if exists "training_write" on public.training_records;
create policy "training_write" on public.training_records
  for all using (
    exists (select 1 from profiles
             where id = auth.uid()
               and lower(coalesce(role,'')) in ('admin','super_admin','superadmin','hr'))
  ) with check (
    exists (select 1 from profiles
             where id = auth.uid()
               and lower(coalesce(role,'')) in ('admin','super_admin','superadmin','hr'))
  );

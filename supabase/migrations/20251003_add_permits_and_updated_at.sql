-- Add missing columns used by the app for permit persistence and updated timestamps
-- Safe to run multiple times

-- 1) Columns
alter table public.mmp_files
  add column if not exists permits jsonb,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists cp_verification jsonb;

-- 2) updated_at trigger
create or replace function public.set_mmp_files_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_mmp_files_updated_at on public.mmp_files;
create trigger set_mmp_files_updated_at
before update on public.mmp_files
for each row execute function public.set_mmp_files_updated_at();

-- 3) RLS and policy (safe reapply)
alter table public.mmp_files enable row level security;

do $$
begin
  if exists(select 1 from pg_policies where schemaname='public' and tablename='mmp_files' and policyname='mmp_files_all_auth') then
    drop policy "mmp_files_all_auth" on public.mmp_files;
  end if;
end$$;

create policy "mmp_files_all_auth" on public.mmp_files
for all using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

-- 4) Storage bucket for MMP files. Make it public to work with getPublicUrl.
insert into storage.buckets (id, name, public)
values ('mmp-files', 'mmp-files', true)
on conflict (id) do update set public = excluded.public;

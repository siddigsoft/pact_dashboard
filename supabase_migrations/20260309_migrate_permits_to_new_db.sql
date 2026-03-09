-- Comprehensive Migration for PACT Documents System
-- This migration sets up all tables, buckets, and RLS policies needed for permits, photos, and document indexing
-- Date: March 9, 2026

-- Enable pgcrypto for UUID generation
create extension if not exists pgcrypto;

-- ============================================================================
-- 1. PERMIT TABLES (state_permits, local_permits, federal_permits)
-- ============================================================================

-- State Permits Table
create table if not exists public.state_permits (
  id uuid default gen_random_uuid() primary key,
  mmp_id uuid,
  mmp_name text,
  project_id uuid,
  site_visit_id uuid,
  state text,
  locality text,
  file_key text,
  file_url text,
  file_name text,
  uploaded_by uuid,
  uploaded_at timestamptz default now(),
  issue_date date,
  expiry_date date,
  verified boolean default false,
  status text,
  source_meta jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_state_permits_mmp_id on public.state_permits (mmp_id);
create index if not exists idx_state_permits_state on public.state_permits (state);
create index if not exists idx_state_permits_locality on public.state_permits (locality);
create index if not exists idx_state_permits_uploaded_at on public.state_permits (uploaded_at);

alter table public.state_permits enable row level security;
create policy "state_permits_all_auth" on public.state_permits for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Local Permits Table  
create table if not exists public.local_permits (
  id uuid default gen_random_uuid() primary key,
  mmp_id uuid,
  mmp_name text,
  project_id uuid,
  site_visit_id uuid,
  state text,
  locality text,
  file_key text,
  file_url text,
  file_name text,
  uploaded_by uuid,
  uploaded_at timestamptz default now(),
  issue_date date,
  expiry_date date,
  verified boolean default false,
  status text,
  source_meta jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_local_permits_mmp_id on public.local_permits (mmp_id);
create index if not exists idx_local_permits_locality on public.local_permits (locality);
create index if not exists idx_local_permits_uploaded_at on public.local_permits (uploaded_at);

alter table public.local_permits enable row level security;
create policy "local_permits_all_auth" on public.local_permits for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Federal Permits Table
create table if not exists public.federal_permits (
  id uuid default gen_random_uuid() primary key,
  mmp_id uuid,
  mmp_name text,
  project_id uuid,
  file_key text,
  file_url text,
  file_name text,
  uploaded_by uuid,
  uploaded_at timestamptz default now(),
  issue_date date,
  expiry_date date,
  verified boolean default false,
  status text,
  source_meta jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_federal_permits_mmp_id on public.federal_permits (mmp_id);
create index if not exists idx_federal_permits_uploaded_at on public.federal_permits (uploaded_at);

alter table public.federal_permits enable row level security;
create policy "federal_permits_all_auth" on public.federal_permits for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================================
-- 2. SITE VISIT PHOTOS TABLE
-- ============================================================================

create table if not exists public.site_visit_photos (
  id uuid default gen_random_uuid() primary key,
  site_visit_id uuid,
  mmp_id uuid,
  mmp_name text,
  project_id uuid,
  state text,
  locality text,
  site_name text,
  file_key text,
  file_url text,
  caption text,
  uploaded_by uuid,
  uploaded_at timestamptz default now(),
  verified boolean default true,
  source_meta jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_site_photos_site_visit on public.site_visit_photos (site_visit_id);
create index if not exists idx_site_photos_mmp_id on public.site_visit_photos (mmp_id);
create index if not exists idx_site_photos_uploaded_at on public.site_visit_photos (uploaded_at);

alter table public.site_visit_photos enable row level security;
create policy "site_visit_photos_all_auth" on public.site_visit_photos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================================
-- 3. DOCUMENT INDEX TABLE (Central registry for all documents)
-- ============================================================================

create table if not exists public.document_index (
  id uuid default gen_random_uuid() primary key,
  file_name text not null,
  file_url text,
  file_size integer,
  file_type text,
  category text not null default 'other',
  uploaded_at timestamptz default now(),
  uploaded_by uuid,
  uploaded_by_name text,
  project_id uuid,
  project_name text,
  hub_id text,
  hub_name text,
  state text,
  locality text,
  mmp_id uuid,
  mmp_name text,
  site_visit_id uuid,
  site_visit_code text,
  cost_submission_id uuid,
  transaction_id uuid,
  month_bucket text,
  issue_date date,
  expiry_date date,
  status text default 'pending',
  verified boolean default false,
  verified_at timestamptz,
  verified_by uuid,
  signature_id text,
  signed_at timestamptz,
  signed_by uuid,
  signature_method text,
  source_type text,
  source_table text,
  source_id text,
  metadata jsonb,
  checksum text,
  tags text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Comprehensive indexes for document_index
create index if not exists idx_document_index_category on public.document_index (category);
create index if not exists idx_document_index_mmp_id on public.document_index (mmp_id);
create index if not exists idx_document_index_uploaded_at on public.document_index (uploaded_at desc);
create index if not exists idx_document_index_file_url on public.document_index (file_url);
create index if not exists idx_document_index_source on public.document_index (source_table, source_id);
create index if not exists idx_document_index_project_id on public.document_index (project_id);
create index if not exists idx_document_index_state on public.document_index (state);
create index if not exists idx_document_index_month_bucket on public.document_index (month_bucket);
create index if not exists idx_document_index_status on public.document_index (status);

alter table public.document_index enable row level security;
create policy "document_index_all_auth" on public.document_index for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Trigger to update document_index updated_at
create or replace function public.set_document_index_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_document_index_updated_at on public.document_index;
create trigger set_document_index_updated_at
before update on public.document_index
for each row execute function public.set_document_index_updated_at();

-- ============================================================================
-- 4. STORAGE BUCKETS & POLICIES
-- ============================================================================

-- Create storage buckets for permits and photos
insert into storage.buckets (id, name, public, avif_autodetection, file_size_limit)
values 
  ('state-permits', 'state-permits', true, false, 104857600),
  ('local-permits', 'local-permits', true, false, 104857600),
  ('federal-permits', 'federal-permits', true, false, 104857600),
  ('coordinator-permits', 'coordinator-permits', true, false, 104857600),
  ('site-visit-photos', 'site-visit-photos', true, false, 104857600),
  ('monitoring_photos', 'monitoring_photos', true, false, 104857600)
on conflict (id) do nothing;

-- State Permits Bucket Policies
drop policy if exists "state_permits_insert_auth" on storage.objects;
drop policy if exists "state_permits_select_auth" on storage.objects;
drop policy if exists "state_permits_delete_auth" on storage.objects;

create policy "state_permits_insert_auth"
on storage.objects for insert
to authenticated
with check (bucket_id = 'state-permits');

create policy "state_permits_select_auth"
on storage.objects for select
to authenticated
using (bucket_id = 'state-permits');

create policy "state_permits_delete_auth"
on storage.objects for delete
to authenticated
using (bucket_id = 'state-permits');

-- Local Permits Bucket Policies
drop policy if exists "local_permits_insert_auth" on storage.objects;
drop policy if exists "local_permits_select_auth" on storage.objects;
drop policy if exists "local_permits_delete_auth" on storage.objects;

create policy "local_permits_insert_auth"
on storage.objects for insert
to authenticated
with check (bucket_id = 'local-permits');

create policy "local_permits_select_auth"
on storage.objects for select
to authenticated
using (bucket_id = 'local-permits');

create policy "local_permits_delete_auth"
on storage.objects for delete
to authenticated
using (bucket_id = 'local-permits');

-- Federal Permits Bucket Policies
drop policy if exists "federal_permits_insert_auth" on storage.objects;
drop policy if exists "federal_permits_select_auth" on storage.objects;
drop policy if exists "federal_permits_delete_auth" on storage.objects;

create policy "federal_permits_insert_auth"
on storage.objects for insert
to authenticated
with check (bucket_id = 'federal-permits');

create policy "federal_permits_select_auth"
on storage.objects for select
to authenticated
using (bucket_id = 'federal-permits');

create policy "federal_permits_delete_auth"
on storage.objects for delete
to authenticated
using (bucket_id = 'federal-permits');

-- Coordinator Permits Bucket Policies
drop policy if exists "coordinator_permits_insert_auth" on storage.objects;
drop policy if exists "coordinator_permits_select_auth" on storage.objects;
drop policy if exists "coordinator_permits_delete_auth" on storage.objects;

create policy "coordinator_permits_insert_auth"
on storage.objects for insert
to authenticated
with check (bucket_id = 'coordinator-permits');

create policy "coordinator_permits_select_auth"
on storage.objects for select
to authenticated
using (bucket_id = 'coordinator-permits');

create policy "coordinator_permits_delete_auth"
on storage.objects for delete
to authenticated
using (bucket_id = 'coordinator-permits');

-- Site Visit Photos Bucket Policies
drop policy if exists "site_visit_photos_insert_auth" on storage.objects;
drop policy if exists "site_visit_photos_select_auth" on storage.objects;
drop policy if exists "site_visit_photos_delete_auth" on storage.objects;

create policy "site_visit_photos_insert_auth"
on storage.objects for insert
to authenticated
with check (bucket_id = 'site-visit-photos');

create policy "site_visit_photos_select_auth"
on storage.objects for select
to authenticated
using (bucket_id = 'site-visit-photos');

create policy "site_visit_photos_delete_auth"
on storage.objects for delete
to authenticated
using (bucket_id = 'site-visit-photos');

-- Monitoring Photos Bucket Policies
drop policy if exists "monitoring_photos_insert_auth" on storage.objects;
drop policy if exists "monitoring_photos_select_auth" on storage.objects;
drop policy if exists "monitoring_photos_delete_auth" on storage.objects;

create policy "monitoring_photos_insert_auth"
on storage.objects for insert
to authenticated
with check (bucket_id = 'monitoring_photos');

create policy "monitoring_photos_select_auth"
on storage.objects for select
to authenticated
using (bucket_id = 'monitoring_photos');

create policy "monitoring_photos_delete_auth"
on storage.objects for delete
to authenticated
using (bucket_id = 'monitoring_photos');

-- ============================================================================
-- 5. PERMITS & PHOTOS UPDATED AT TRIGGERS
-- ============================================================================

-- State Permits Updated At Trigger
create or replace function public.set_state_permits_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_state_permits_updated_at on public.state_permits;
create trigger set_state_permits_updated_at
before update on public.state_permits
for each row execute function public.set_state_permits_updated_at();

-- Local Permits Updated At Trigger
create or replace function public.set_local_permits_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_local_permits_updated_at on public.local_permits;
create trigger set_local_permits_updated_at
before update on public.local_permits
for each row execute function public.set_local_permits_updated_at();

-- Federal Permits Updated At Trigger
create or replace function public.set_federal_permits_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_federal_permits_updated_at on public.federal_permits;
create trigger set_federal_permits_updated_at
before update on public.federal_permits
for each row execute function public.set_federal_permits_updated_at();

-- Site Visit Photos Updated At Trigger
create or replace function public.set_site_visit_photos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_site_visit_photos_updated_at on public.site_visit_photos;
create trigger set_site_visit_photos_updated_at
before update on public.site_visit_photos
for each row execute function public.set_site_visit_photos_updated_at();

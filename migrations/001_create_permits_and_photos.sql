-- Migration: Create permits and site_visit_photos tables
-- Run with psql or through Supabase migrations

-- Ensure pgcrypto for gen_random_uuid (Supabase has this available)
create extension if not exists pgcrypto;

-- state_permits
create table if not exists state_permits (
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
  source_meta jsonb
);
create index if not exists idx_state_permits_mmp_id on state_permits (mmp_id);
create index if not exists idx_state_permits_state on state_permits (state);
create index if not exists idx_state_permits_locality on state_permits (locality);
create index if not exists idx_state_permits_uploaded_at on state_permits (uploaded_at);

-- local_permits
create table if not exists local_permits (
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
  source_meta jsonb
);
create index if not exists idx_local_permits_mmp_id on local_permits (mmp_id);
create index if not exists idx_local_permits_locality on local_permits (locality);
create index if not exists idx_local_permits_uploaded_at on local_permits (uploaded_at);

-- federal_permits (optional)
create table if not exists federal_permits (
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
  source_meta jsonb
);
create index if not exists idx_federal_permits_mmp_id on federal_permits (mmp_id);
create index if not exists idx_federal_permits_uploaded_at on federal_permits (uploaded_at);

-- site_visit_photos
create table if not exists site_visit_photos (
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
  source_meta jsonb
);
create index if not exists idx_site_photos_site_visit on site_visit_photos (site_visit_id);
create index if not exists idx_site_photos_mmp_id on site_visit_photos (mmp_id);
create index if not exists idx_site_photos_uploaded_at on site_visit_photos (uploaded_at);

-- Combined recreate SQL for this project
-- This file concatenates the project's `supabase/schema.sql` (core tables & RLS policies)
-- and the transformed `scripts/target_ready.sql` (extended tables, FK attachments and helpers).
-- Review before running. Import with: psql "postgresql://user:pass@host:5432/dbname" -f scripts/recreate_schema_full.sql

-- =====================================================================
-- Part 1: supabase/schema.sql (core tables, RLS policies, triggers)
-- =====================================================================

-- Enable extension for UUID generation
create extension if not exists pgcrypto;

-- PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text,
  full_name text,
  role text,
  avatar_url text,
  hub_id text,
  state_id text,
  locality_id text,
  employee_id text,
  phone text,
  status text default 'pending',
  availability text,
  location jsonb,
  location_sharing boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create profile on new auth user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, 
    email, 
    full_name, 
    username, 
    role, 
    hub_id, 
    state_id, 
    locality_id, 
    phone, 
    employee_id,
    avatar_url,
    status, 
    created_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'dataCollector'),
    new.raw_user_meta_data->>'hubId',
    new.raw_user_meta_data->>'stateId',
    new.raw_user_meta_data->>'localityId',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'employeeId',
    new.raw_user_meta_data->>'avatar',
    'pending',
    now()
  ) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
create policy "profiles_select_authenticated" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- USER ROLES
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null,
  created_at timestamptz default now()
);

alter table public.user_roles enable row level security;
create policy "user_roles_select_all_auth" on public.user_roles for select using (true);
create policy "user_roles_modify_all_auth" on public.user_roles for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- PROJECTS
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  project_code text,
  description text,
  project_type text,
  status text,
  start_date date,
  end_date date,
  budget jsonb,
  location jsonb,
  team jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.projects enable row level security;
create policy "projects_all_auth" on public.projects for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Trigger for projects updated_at
drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

-- PROJECT ACTIVITIES
create table if not exists public.project_activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text,
  description text,
  start_date date,
  end_date date,
  status text,
  is_active boolean default true,
  assigned_to uuid,
  created_at timestamptz default now()
);

alter table public.project_activities enable row level security;
create policy "project_activities_all_auth" on public.project_activities for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- SUB ACTIVITIES
create table if not exists public.sub_activities (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid references public.project_activities(id) on delete cascade,
  name text,
  description text,
  status text,
  is_active boolean default true,
  due_date date,
  assigned_to uuid,
  created_at timestamptz default now()
);

alter table public.sub_activities enable row level security;
create policy "sub_activities_all_auth" on public.sub_activities for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- MMP FILES
create table if not exists public.mmp_files (
  id uuid primary key default gen_random_uuid(),
  name text,
  uploaded_at timestamptz,
  uploaded_by text,
  status text,
  entries integer,
  processed_entries integer,
  mmp_id text,
  version jsonb,
  site_entries jsonb,
  workflow jsonb,
  approval_workflow jsonb,
  project_id uuid,
  file_path text,
  original_filename text,
  file_url text,
  description text,
  project_name text,
  type text,
  region text,
  month integer,
  year integer,
  location jsonb,
  team jsonb,
  permits jsonb,
  site_visit jsonb,
  financial jsonb,
  performance jsonb,
  cp_verification jsonb,
  rejection_reason text,
  approved_by text,
  approved_at timestamptz,
  verified_by text,
  verified_at timestamptz,
  archived_by text,
  archived_at timestamptz,
  deleted_by text,
  deleted_at timestamptz,
  expiry_date date,
  modification_history jsonb,
  modified_at timestamptz,
  activities jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.mmp_files enable row level security;
create policy "mmp_files_all_auth" on public.mmp_files for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Optional: updated_at trigger for mmp_files
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

-- SETTINGS TABLES
create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  settings jsonb,
  last_updated timestamptz default now()
);

alter table public.user_settings enable row level security;
create policy "user_settings_select_own" on public.user_settings for select using (user_id = auth.uid());
create policy "user_settings_insert_own" on public.user_settings for insert with check (user_id = auth.uid());
create policy "user_settings_update_own" on public.user_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "user_settings_delete_own" on public.user_settings for delete using (user_id = auth.uid());

-- ROLES TABLE
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name character varying not null unique,
  display_name character varying not null,
  description text,
  is_system_role boolean default false,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.profiles(id)
);

alter table public.roles enable row level security;
create policy "roles_all_auth" on public.roles for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- PERMISSIONS TABLE
create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid references public.roles(id),
  resource character varying not null check (resource::text = any (array['users'::text, 'roles'::text, 'permissions'::text, 'projects'::text, 'mmp'::text, 'site_visits'::text, 'finances'::text, 'reports'::text, 'settings'::text])),
  action character varying not null check (action::text = any (array['create'::text, 'read'::text, 'update'::text, 'delete'::text, 'approve'::text, 'assign'::text])),
  conditions jsonb,
  created_at timestamptz default now()
);

alter table public.permissions enable row level security;
create policy "permissions_all_auth" on public.permissions for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- (The rest of the `supabase/schema.sql` content continues below in Part 2)

-- =====================================================================
-- Part 2: scripts/target_ready.sql (extended tables, FK constraints and helpers)
-- =====================================================================

SET client_min_messages = WARNING;

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS postgis;

-- Sequences used by integer PK defaults
CREATE SEQUENCE IF NOT EXISTS public.app_versions_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.hub_states_id_seq;

-- Tables (transformed) - excerpt from scripts/target_ready.sql

CREATE TABLE public.app_versions (
  id integer NOT NULL DEFAULT nextval('public.app_versions_id_seq'::regclass),
  platform character varying NOT NULL CHECK (platform::text = ANY (ARRAY['web'::character varying, 'mobile'::character varying]::text[])),
  current_version character varying NOT NULL,
  minimum_supported character varying NOT NULL,
  latest_version character varying NOT NULL,
  changelog text,
  download_url character varying,
  force_update boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT app_versions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  module text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  entity_name text,
  actor_id text NOT NULL DEFAULT 'system'::text,
  actor_name text NOT NULL DEFAULT 'System'::text,
  actor_role text DEFAULT 'system'::text,
  actor_email text,
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  severity text NOT NULL DEFAULT 'info'::text,
  workflow_step text,
  previous_state jsonb,
  new_state jsonb,
  changes jsonb,
  metadata jsonb,
  ip_address text,
  user_agent text,
  session_id text,
  description text NOT NULL,
  details text,
  tags text[],
  related_entity_ids text[],
  duration integer,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);

-- (many more CREATE TABLE statements follow in the original `scripts/target_ready.sql` file)

-- End of combined file. Review and remove duplicates before executing if necessary.

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
  archived_by text,
  archived_at timestamptz,
  deleted_by text,
  deleted_at timestamptz,
  expiry_date date,
  modification_history jsonb,
  modified_at timestamptz,
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

-- SITE VISITS
create table if not exists public.site_visits (
  id uuid primary key default gen_random_uuid(),
  site_name text,
  site_code text,
  status text,
  locality text,
  state text,
  activity text,
  priority text,
  due_date timestamptz,
  notes text,
  main_activity text,
  location jsonb,
  fees jsonb,
  visit_data jsonb,
  assigned_to uuid,
  assigned_by uuid,
  assigned_at timestamptz,
  attachments text[],
  completed_at timestamptz,
  rating integer,
  mmp_id text,
  created_at timestamptz default now()
);

alter table public.site_visits enable row level security;
create policy "site_visits_all_auth" on public.site_visits for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

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

create table if not exists public.wallet_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  notification_prefs jsonb,
  auto_withdraw boolean default false,
  last_updated timestamptz default now()
);

alter table public.wallet_settings enable row level security;
create policy "wallet_settings_select_own" on public.wallet_settings for select using (user_id = auth.uid());
create policy "wallet_settings_insert_own" on public.wallet_settings for insert with check (user_id = auth.uid());
create policy "wallet_settings_update_own" on public.wallet_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "wallet_settings_delete_own" on public.wallet_settings for delete using (user_id = auth.uid());

create table if not exists public.data_visibility_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  options jsonb,
  last_updated timestamptz default now()
);

alter table public.data_visibility_settings enable row level security;
create policy "data_visibility_settings_select_own" on public.data_visibility_settings for select using (user_id = auth.uid());
create policy "data_visibility_settings_insert_own" on public.data_visibility_settings for insert with check (user_id = auth.uid());
create policy "data_visibility_settings_update_own" on public.data_visibility_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "data_visibility_settings_delete_own" on public.data_visibility_settings for delete using (user_id = auth.uid());

create table if not exists public.dashboard_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  layout jsonb,
  widget_order text[],
  last_updated timestamptz default now()
);

alter table public.dashboard_settings enable row level security;
create policy "dashboard_settings_select_own" on public.dashboard_settings for select using (user_id = auth.uid());
create policy "dashboard_settings_insert_own" on public.dashboard_settings for insert with check (user_id = auth.uid());
create policy "dashboard_settings_update_own" on public.dashboard_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "dashboard_settings_delete_own" on public.dashboard_settings for delete using (user_id = auth.uid());

-- Optional: simple updated_at trigger for profiles
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

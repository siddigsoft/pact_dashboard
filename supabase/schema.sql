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
  arrival_latitude double precision,
  arrival_longitude double precision,
  arrival_timestamp timestamp without time zone,
  journey_path jsonb,
  arrival_recorded boolean DEFAULT false,
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

-- CHATS TABLE
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Chat'::text,
  type text not null check (type = any (array['private'::text, 'group'::text, 'state-group'::text])),
  is_group boolean not null default false,
  created_by uuid references public.profiles(id),
  state_id text,
  related_entity_id text,
  related_entity_type text check (related_entity_type = any (array['mmpFile'::text, 'siteVisit'::text, 'project'::text])),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  pair_key text
);

alter table public.chats enable row level security;
create policy "chats_all_auth" on public.chats for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- CHAT PARTICIPANTS TABLE
create table if not exists public.chat_participants (
  chat_id uuid not null references public.chats(id),
  user_id uuid not null references public.profiles(id),
  joined_at timestamptz default now(),
  primary key (chat_id, user_id)
);

alter table public.chat_participants enable row level security;
create policy "chat_participants_all_auth" on public.chat_participants for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- CHAT MESSAGES TABLE
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id),
  sender_id uuid not null references public.profiles(id),
  content text,
  content_type text not null default 'text'::text check (content_type = any (array['text'::text, 'image'::text, 'file'::text, 'location'::text, 'audio'::text])),
  attachments jsonb,
  metadata jsonb,
  status text not null default 'sent'::text check (status = any (array['sent'::text, 'delivered'::text, 'read'::text, 'failed'::text])),
  created_at timestamptz default now()
);

alter table public.chat_messages enable row level security;
create policy "chat_messages_all_auth" on public.chat_messages for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- CHAT MESSAGE READS TABLE
create table if not exists public.chat_message_reads (
  message_id uuid not null references public.chat_messages(id),
  user_id uuid not null references public.profiles(id),
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.chat_message_reads enable row level security;
create policy "chat_message_reads_all_auth" on public.chat_message_reads for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- NOTIFICATIONS TABLE
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  title text not null,
  message text not null,
  type text not null check (type = any (array['info'::text, 'success'::text, 'warning'::text, 'error'::text])),
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  link text,
  related_entity_id text,
  related_entity_type text check (related_entity_type = any (array['siteVisit'::text, 'mmpFile'::text, 'transaction'::text, 'chat'::text, 'user'::text]))
);

alter table public.notifications enable row level security;
create policy "notifications_all_auth" on public.notifications for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- EQUIPMENT TABLE
create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text,
  status text,
  location text,
  last_inspection timestamp without time zone,
  next_inspection timestamp without time zone,
  is_synced boolean default false,
  last_modified timestamp without time zone default now()
);

alter table public.equipment enable row level security;
create policy "equipment_all_auth" on public.equipment for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- INCIDENT REPORTS TABLE
create table if not exists public.incident_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  location text,
  latitude double precision,
  longitude double precision,
  reported_by uuid references public.profiles(id),
  status text,
  severity text,
  date_reported timestamp without time zone default now(),
  is_synced boolean default false,
  last_modified timestamp without time zone default now()
);

alter table public.incident_reports enable row level security;
create policy "incident_reports_all_auth" on public.incident_reports for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- LOCATION LOGS TABLE
create table if not exists public.location_logs (
  id uuid primary key default gen_random_uuid(),
  site_visit_id uuid references public.site_visits(id),
  latitude double precision not null,
  longitude double precision not null,
  timestamp timestamp without time zone default now(),
  accuracy double precision,
  is_synced boolean default false,
  last_modified timestamp without time zone default now()
);

alter table public.location_logs enable row level security;
create policy "location_logs_all_auth" on public.location_logs for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- REPORTS TABLE
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  site_visit_id uuid references public.site_visits(id),
  notes text not null,
  submitted_at timestamp without time zone default now(),
  is_synced boolean default false,
  last_modified timestamp without time zone default now()
);

alter table public.reports enable row level security;
create policy "reports_all_auth" on public.reports for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- REPORT PHOTOS TABLE
create table if not exists public.report_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id),
  photo_url text not null,
  created_at timestamp without time zone default now(),
  deleted_at timestamp without time zone,
  storage_path text,
  is_synced boolean default false,
  last_modified timestamp without time zone default now()
);

alter table public.report_photos enable row level security;
create policy "report_photos_all_auth" on public.report_photos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- SAFETY CHECKLISTS TABLE
create table if not exists public.safety_checklists (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  items jsonb,
  completed_by uuid references public.profiles(id),
  site_visit_id uuid references public.site_visits(id),
  completed_at timestamp without time zone,
  is_synced boolean default false,
  last_modified timestamp without time zone default now()
);

alter table public.safety_checklists enable row level security;
create policy "safety_checklists_all_auth" on public.safety_checklists for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- VISIT STATUS TABLE
create table if not exists public.visit_status (
  id uuid primary key default gen_random_uuid(),
  site_visit_id uuid references public.site_visits(id),
  status text not null,
  updated_at timestamp without time zone default now(),
  updated_by uuid references public.profiles(id),
  is_synced boolean default false,
  last_modified timestamp without time zone default now()
);

alter table public.visit_status enable row level security;
create policy "visit_status_all_auth" on public.visit_status for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- FEEDBACK TABLE
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  user_email text,
  user_name text,
  page_url text,
  page_name text,
  reaction text,
  feedback_text text,
  category text default 'general'::text,
  priority text default 'medium'::text,
  status text default 'new'::text,
  assigned_to uuid references public.profiles(id),
  internal_notes text,
  browser_info jsonb,
  device_info jsonb,
  session_info jsonb,
  ip_address inet,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id)
);

alter table public.feedback enable row level security;
create policy "feedback_all_auth" on public.feedback for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

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

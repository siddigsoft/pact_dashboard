-- Migration: Create user_activity_logs table
-- Date: 2026-02-27

-- Create the table used by the frontend to store user activity tracking
create table if not exists public.user_activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  user_name text,
  user_email text,
  user_role text,
  activity_type text,
  category text,
  component text,
  action text,
  description text,
  path text,
  timestamp timestamptz default now(),
  metadata jsonb,
  element_id text,
  element_text text,
  previous_value text,
  new_value text,
  duration integer,
  success boolean,
  error_message text,
  session_id text,
  device_info jsonb,
  created_at timestamptz default now()
);

-- Indexes to help typical queries
create index if not exists idx_user_activity_logs_timestamp on public.user_activity_logs(timestamp desc);
create index if not exists idx_user_activity_logs_user_id on public.user_activity_logs(user_id);
create index if not exists idx_user_activity_logs_activity_type on public.user_activity_logs(activity_type);

-- Enable Row Level Security and add minimal policies to allow app inserts/selects
alter table public.user_activity_logs enable row level security;

-- Allow authenticated clients to insert their activity logs
create policy if not exists "user_activity_logs_insert_authenticated"
  on public.user_activity_logs
  for insert
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Allow authenticated clients to select (you may want to tighten this for privacy)
create policy if not exists "user_activity_logs_select_authenticated"
  on public.user_activity_logs
  for select
  using (auth.role() = 'authenticated');

-- Optional: disallow updates/deletes by default (no policy created)

-- Column comments
comment on column public.user_activity_logs.metadata is 'Arbitrary JSON metadata captured with the event';
comment on column public.user_activity_logs.device_info is 'Device info JSON (userAgent, screen size, isMobile, etc.)';

-- End migration

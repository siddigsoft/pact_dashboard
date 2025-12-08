-- Consolidated Migration: Chat System and Notifications Tables
-- Run this in Supabase SQL Editor to create all missing tables
-- Date: 2025-12-08

-- Enable required extension for UUIDs if not already enabled
create extension if not exists pgcrypto;

-- =====================================================
-- CHATS TABLE
-- =====================================================
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Chat',
  type text not null check (type in ('private','group','state-group')),
  is_group boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  state_id text,
  pair_key text unique,
  related_entity_id text,
  related_entity_type text check (related_entity_type in ('mmpFile','siteVisit','project')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================================================
-- CHAT PARTICIPANTS TABLE
-- =====================================================
create table if not exists public.chat_participants (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (chat_id, user_id)
);

-- =====================================================
-- CHAT MESSAGES TABLE
-- =====================================================
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete set null,
  content text,
  content_type text not null default 'text' check (content_type in ('text','image','file','location','audio')),
  attachments jsonb,
  metadata jsonb,
  status text not null default 'sent' check (status in ('sent','delivered','read','failed')),
  created_at timestamptz default now()
);

-- =====================================================
-- CHAT MESSAGE READS TABLE
-- =====================================================
create table if not exists public.chat_message_reads (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- =====================================================
-- NOTIFICATIONS TABLE
-- =====================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null check (type = any (array['info'::text, 'success'::text, 'warning'::text, 'error'::text])),
  is_read boolean not null default false,
  created_at timestamptz default now(),
  link text,
  related_entity_id text,
  related_entity_type text check (related_entity_type = any (array['siteVisit'::text, 'mmpFile'::text, 'transaction'::text, 'chat'::text, 'user'::text]))
);

-- =====================================================
-- INDEXES
-- =====================================================
create index if not exists chat_participants_user_id_idx on public.chat_participants(user_id);
create index if not exists chat_messages_chat_id_created_at_idx on public.chat_messages(chat_id, created_at);
create index if not exists chat_messages_sender_id_idx on public.chat_messages(sender_id);
create index if not exists notifications_user_id_idx on public.notifications(user_id);
create index if not exists notifications_created_at_idx on public.notifications(created_at);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger for chats updated_at
drop trigger if exists set_chats_updated_at on public.chats;
create trigger set_chats_updated_at
before update on public.chats
for each row execute function public.set_updated_at();

-- Function to touch chat updated_at when message inserted
create or replace function public.touch_chat_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chats set updated_at = now() where id = new.chat_id;
  return new;
end;
$$;

drop trigger if exists chat_messages_touch_chat on public.chat_messages;
create trigger chat_messages_touch_chat
after insert on public.chat_messages
for each row execute function public.touch_chat_updated_at();

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

-- CHATS RLS
alter table public.chats enable row level security;

drop policy if exists "chats_select_participant" on public.chats;
create policy "chats_select_participant" on public.chats
  for select using (
    exists (
      select 1 from public.chat_participants cp
      where cp.chat_id = id and cp.user_id = auth.uid()
    )
  );

drop policy if exists "chats_insert_creator" on public.chats;
create policy "chats_insert_creator" on public.chats
  for insert with check (created_by = auth.uid());

drop policy if exists "chats_update_creator" on public.chats;
create policy "chats_update_creator" on public.chats
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "chats_delete_creator" on public.chats;
create policy "chats_delete_creator" on public.chats
  for delete using (created_by = auth.uid());

-- CHAT PARTICIPANTS RLS
alter table public.chat_participants enable row level security;

drop policy if exists "chat_participants_select_in_same_chat" on public.chat_participants;
create policy "chat_participants_select_in_same_chat" on public.chat_participants
  for select using (
    exists (
      select 1 from public.chat_participants cp
      where cp.chat_id = chat_participants.chat_id and cp.user_id = auth.uid()
    )
  );

drop policy if exists "chat_participants_insert_self_or_owner" on public.chat_participants;
create policy "chat_participants_insert_self_or_owner" on public.chat_participants
  for insert with check (
    (user_id = auth.uid()) or
    exists (select 1 from public.chats c where c.id = chat_participants.chat_id and c.created_by = auth.uid())
  );

drop policy if exists "chat_participants_delete_self_or_owner" on public.chat_participants;
create policy "chat_participants_delete_self_or_owner" on public.chat_participants
  for delete using (
    (user_id = auth.uid()) or
    exists (select 1 from public.chats c where c.id = chat_participants.chat_id and c.created_by = auth.uid())
  );

-- CHAT MESSAGES RLS
alter table public.chat_messages enable row level security;

drop policy if exists "chat_messages_select_participant" on public.chat_messages;
create policy "chat_messages_select_participant" on public.chat_messages
  for select using (
    exists (
      select 1 from public.chat_participants cp
      where cp.chat_id = chat_messages.chat_id and cp.user_id = auth.uid()
    )
  );

drop policy if exists "chat_messages_insert_participant" on public.chat_messages;
create policy "chat_messages_insert_participant" on public.chat_messages
  for insert with check (
    sender_id = auth.uid() and exists (
      select 1 from public.chat_participants cp
      where cp.chat_id = chat_messages.chat_id and cp.user_id = auth.uid()
    )
  );

-- CHAT MESSAGE READS RLS
alter table public.chat_message_reads enable row level security;

drop policy if exists "chat_message_reads_select_participant" on public.chat_message_reads;
create policy "chat_message_reads_select_participant" on public.chat_message_reads
  for select using (
    exists (
      select 1 from public.chat_messages m
      join public.chat_participants cp on cp.chat_id = m.chat_id
      where m.id = chat_message_reads.message_id and cp.user_id = auth.uid()
    )
  );

drop policy if exists "chat_message_reads_insert_self" on public.chat_message_reads;
create policy "chat_message_reads_insert_self" on public.chat_message_reads
  for insert with check (user_id = auth.uid());

drop policy if exists "chat_message_reads_update_self" on public.chat_message_reads;
create policy "chat_message_reads_update_self" on public.chat_message_reads
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- NOTIFICATIONS RLS
alter table public.notifications enable row level security;

drop policy if exists "notifications_all_auth" on public.notifications;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications 
  for select using (user_id = auth.uid());

-- Users can only create notifications for themselves
-- System/backend notifications should use service_role which bypasses RLS
drop policy if exists "notifications_insert_own" on public.notifications;
create policy "notifications_insert_own" on public.notifications 
  for insert with check (user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications 
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications 
  for delete using (user_id = auth.uid());

-- =====================================================
-- REALTIME PUBLICATION
-- =====================================================
-- Add tables to realtime for live updates (ignore errors if already added)
do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when others then null;
end $$;

-- =====================================================
-- DONE
-- =====================================================
-- All chat and notification tables have been created with proper RLS policies

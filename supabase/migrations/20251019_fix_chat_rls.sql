-- Fix RLS recursion between chats and chat_participants
-- Breaks cyclical dependency that caused 42P17 (infinite recursion) on insert/select

begin;

-- Ensure RLS enabled
alter table public.chats enable row level security;
alter table public.chat_participants enable row level security;

-- Drop problematic recursive policy on chat_participants (self-referencing)
drop policy if exists "chat_participants_select_in_same_chat" on public.chat_participants;

-- Allow chat creators to select their own chats without referencing chat_participants
-- This prevents recursion when other policies reference chats in subqueries
drop policy if exists "chats_select_creator" on public.chats;
create policy "chats_select_creator" on public.chats
  for select using (created_by = auth.uid());

-- Ensure participant-based select policy on chats exists (safe because cp policy below is non-recursive)
-- Only create if missing to avoid duplicate policy errors
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p 
    WHERE p.schemaname = 'public' AND p.tablename = 'chats' AND p.policyname = 'chats_select_participant'
  ) THEN
    create policy "chats_select_participant" on public.chats
      for select using (
        exists (
          select 1 from public.chat_participants cp
          where cp.chat_id = id and cp.user_id = auth.uid()
        )
      );
  END IF;
END$$;

-- Non-recursive chat_participants SELECT policies
-- 1) A user can select their own participant rows
DROP POLICY IF EXISTS "chat_participants_select_self" ON public.chat_participants;
CREATE POLICY "chat_participants_select_self" ON public.chat_participants
  FOR SELECT USING (user_id = auth.uid());

-- 2) The creator of a chat can select all participant rows for their chats
-- This references chats, which is safe due to chats_select_creator above
DROP POLICY IF EXISTS "chat_participants_select_chat_creator" ON public.chat_participants;
CREATE POLICY "chat_participants_select_chat_creator" ON public.chat_participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chats c
      WHERE c.id = chat_participants.chat_id AND c.created_by = auth.uid()
    )
  );

commit;

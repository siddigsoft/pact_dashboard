-- Fix chat_messages RLS Policy for INSERT Operations
-- This script adds the missing INSERT policy that allows users to send messages
-- Run this in your Supabase SQL Editor

-- Drop existing INSERT policy if any (to avoid conflicts)
DROP POLICY IF EXISTS "Users can insert messages in their chats" ON chat_messages;

-- Create INSERT policy: Users can only insert messages if:
-- 1. They are the sender (sender_id matches their auth.uid())
-- 2. They are a participant in the chat
CREATE POLICY "Users can insert messages in their chats"
ON chat_messages
FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM chat_participants cp
    WHERE cp.chat_id = chat_messages.chat_id
    AND cp.user_id = auth.uid()
  )
);

-- Also ensure UPDATE policy exists for message status updates
DROP POLICY IF EXISTS "Users can update their own messages" ON chat_messages;

CREATE POLICY "Users can update their own messages"
ON chat_messages
FOR UPDATE
USING (
  auth.uid() = sender_id
  OR EXISTS (
    SELECT 1 FROM chat_participants cp
    WHERE cp.chat_id = chat_messages.chat_id
    AND cp.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = sender_id
  OR EXISTS (
    SELECT 1 FROM chat_participants cp
    WHERE cp.chat_id = chat_messages.chat_id
    AND cp.user_id = auth.uid()
  )
);

-- Ensure SELECT policy exists
DROP POLICY IF EXISTS "Users can view messages in their chats" ON chat_messages;

CREATE POLICY "Users can view messages in their chats"
ON chat_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM chat_participants cp
    WHERE cp.chat_id = chat_messages.chat_id
    AND cp.user_id = auth.uid()
  )
);

-- Verify RLS is enabled on the table
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Output confirmation
SELECT 'Chat messages RLS policies updated successfully!' as status;

-- ============================================================================
-- CHAT ATTACHMENTS STORAGE POLICIES
-- ============================================================================
-- Storage bucket policies for chat attachments (images and documents)
-- This file contains RLS policies for the chat-attachments bucket only.
-- 
-- Created: 2025-01-25
-- ============================================================================

-- Create chat-attachments bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing chat attachment policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "chat_attachments_insert_auth" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_select_auth" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_delete_auth" ON storage.objects;

-- Policy: Authenticated users can upload chat attachments
-- Any authenticated user can upload files to chat-attachments bucket
CREATE POLICY "chat_attachments_insert_auth"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-attachments');

-- Policy: Authenticated users can view chat attachments
-- Public bucket but RLS ensures only authenticated users can access
CREATE POLICY "chat_attachments_select_auth"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'chat-attachments');

-- Policy: Users can delete their own uploaded attachments
-- Users can delete files they uploaded (tracked via folder structure or metadata)
-- File path structure: chat_id/user_id/filename
CREATE POLICY "chat_attachments_delete_auth"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-attachments' AND
  (
    -- Allow deletion if file is in user's folder (path: chat_id/user_id/filename)
    auth.uid()::text = (storage.foldername(name))[2] OR
    -- Or if metadata indicates user uploaded it
    (metadata->>'uploaded_by')::text = auth.uid()::text
  )
);

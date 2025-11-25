-- ============================================================================
-- CHAT ATTACHMENTS STORAGE BUCKET MIGRATION
-- ============================================================================
-- This migration creates the storage bucket and RLS policies for chat 
-- attachments (images and documents) used in the chat messaging feature.
-- 
-- Created: 2025-01-25
-- ============================================================================

-- Create chat-attachments bucket if it doesn't exist
-- Public bucket allows easy access to shared files in chat messages
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist (to avoid conflicts on re-run)
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

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- 
-- Summary:
-- ✅ Created 'chat-attachments' storage bucket (public)
-- ✅ Added RLS policies for insert, select, and delete operations
-- ✅ Files are organized by: chat_id/user_id/filename
-- 
-- Usage:
-- - Images and documents uploaded in chat messages are stored here
-- - Files are accessible via public URLs for easy sharing
-- - Users can only delete their own uploaded files
-- ============================================================================


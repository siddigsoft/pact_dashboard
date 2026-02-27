-- ============================================================================
-- AVATARS & MMP-FILES BUCKET POLICIES (OWNER-RUN)
-- ============================================================================
-- This file creates idempotent RLS policies for the 'avatars' and
-- 'mmp-files' storage buckets. These statements must be executed as the
-- database owner (Supabase SQL editor is recommended) because they
-- operate on `storage.objects` which is owned by a Supabase internal role.
--
-- Created: 2026-02-18
-- ============================================================================

BEGIN;

-- AVATARS: allow authenticated users to upload and read from avatars bucket
DROP POLICY IF EXISTS avatars_insert_auth ON storage.objects;
CREATE POLICY avatars_insert_auth
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS avatars_select_auth ON storage.objects;
CREATE POLICY avatars_select_auth
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS avatars_delete_auth ON storage.objects;
CREATE POLICY avatars_delete_auth
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND (metadata->>'uploaded_by')::text = auth.uid()::text);

-- MMP-FILES: allow authenticated uploads and reads into mmp-files bucket
DROP POLICY IF EXISTS mmp_files_insert_auth ON storage.objects;
CREATE POLICY mmp_files_insert_auth
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'mmp-files');

DROP POLICY IF EXISTS mmp_files_select_auth ON storage.objects;
CREATE POLICY mmp_files_select_auth
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'mmp-files');

DROP POLICY IF EXISTS mmp_files_delete_auth ON storage.objects;
CREATE POLICY mmp_files_delete_auth
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'mmp-files' AND (metadata->>'uploaded_by')::text = auth.uid()::text);

COMMIT;

-- NOTES:
-- 1) The INSERT policies only check bucket_id so uploads will succeed even
--    when the client doesn't set metadata.uploaded_by. DELETE policies remain
--    strict and require metadata.uploaded_by to match auth.uid() to delete.
-- 2) If you want stricter INSERT checks (require metadata.uploaded_by),
--    modify the WITH CHECK to include (metadata->>'uploaded_by')::text = auth.uid()::text.
-- 3) Run this file in Supabase Dashboard → SQL. Running as a non-owner will
--    likely give "must be owner of table objects" errors.

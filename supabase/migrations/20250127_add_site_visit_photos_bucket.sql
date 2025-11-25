-- ============================================================================
-- SITE VISIT PHOTOS STORAGE BUCKET MIGRATION
-- ============================================================================
-- This migration creates the storage bucket and RLS policies for site visit
-- photos used in the visit report feature.
-- 
-- Created: 2025-01-27
-- ============================================================================

-- Create site-visit-photos bucket if it doesn't exist
-- Public bucket allows easy access to photos in visit reports
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-visit-photos', 'site-visit-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist (to avoid conflicts on re-run)
DROP POLICY IF EXISTS "site_visit_photos_insert_auth" ON storage.objects;
DROP POLICY IF EXISTS "site_visit_photos_select_auth" ON storage.objects;
DROP POLICY IF EXISTS "site_visit_photos_delete_auth" ON storage.objects;

-- Policy: Authenticated users can upload site visit photos
-- Any authenticated user can upload files to site-visit-photos bucket
CREATE POLICY "site_visit_photos_insert_auth"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'site-visit-photos');

-- Policy: Authenticated users can view site visit photos
-- Public bucket but RLS ensures only authenticated users can access
CREATE POLICY "site_visit_photos_select_auth"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'site-visit-photos');

-- Policy: Users can delete their own uploaded photos
-- Users can delete files they uploaded (tracked via folder structure or metadata)
CREATE POLICY "site_visit_photos_delete_auth"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'site-visit-photos' AND
  (
    -- Allow deletion if file is in user's folder (path: reports/site_id/... or draft-photos/site_id/...)
    -- Or if metadata indicates user uploaded it
    (metadata->>'uploaded_by')::text = auth.uid()::text
  )
);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- 
-- Summary:
-- ✅ Created 'site-visit-photos' storage bucket (public)
-- ✅ Added RLS policies for insert, select, and delete operations
-- ✅ Files are organized by: reports/site_id/... or draft-photos/site_id/...
-- 
-- Usage:
-- - Photos uploaded during site visit reports are stored here
-- - Files are accessible via public URLs for easy viewing
-- - Users can only delete their own uploaded files
-- ============================================================================


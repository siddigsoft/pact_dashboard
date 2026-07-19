-- Create avatars storage bucket for profile pictures
-- Run this in Supabase SQL editor or via supabase migration

-- Create the bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload/update their own avatar
CREATE POLICY IF NOT EXISTS "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND name = 'avatars/' || auth.uid() || '.jpg'
         OR bucket_id = 'avatars' AND name LIKE 'avatars/' || auth.uid()::text || '.%');

-- Allow authenticated users to update their own avatar
CREATE POLICY IF NOT EXISTS "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = split_part(name, '/', 2));

-- Allow admins to upload any avatar
CREATE POLICY IF NOT EXISTS "Admins can upload any avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin','SuperAdmin')
  )
);

-- Public read — bucket is public so no policy needed, but explicit anyway
CREATE POLICY IF NOT EXISTS "Public can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

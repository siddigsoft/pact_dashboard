-- ============================================================
-- Fix: Avatars bucket Storage RLS policies
-- 
-- Problems fixed:
--   1. Admin INSERT policy used role IN ('Admin','SuperAdmin') — fails
--      when DB stores 'admin' / 'super_admin' (case-sensitive mismatch).
--   2. UPDATE policy used split_part(name, '/', 2) which returns
--      'user-id.jpg' (with extension) — never matches auth.uid(), so
--      re-uploading / upsert fails for ALL users.
--   3. Admin bypass missing from UPDATE policy.
--   4. Settings.tsx previously used UUID-timestamp.ext filename format
--      which did not match the LIKE 'avatars/<uuid>.%' pattern.
--      Code has been updated to use UUID.ext format consistently,
--      but the policy also accepts UUID-<anything>.ext for old files.
-- ============================================================

-- Drop all existing policies for the avatars bucket so we can recreate
-- them cleanly (CREATE POLICY IF NOT EXISTS never updates an existing one).
DROP POLICY IF EXISTS "Users can upload own avatar"   ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar"   ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload any avatar"  ON storage.objects;
DROP POLICY IF EXISTS "Public can view avatars"       ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert"                ON storage.objects;
DROP POLICY IF EXISTS "avatars_update"                ON storage.objects;
DROP POLICY IF EXISTS "avatars_select"                ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete"                ON storage.objects;

-- ── INSERT (new upload / first-time upsert) ─────────────────
-- Accepts both:
--   avatars/<uuid>.<ext>           (standard format, UserDetail + Settings)
--   avatars/<uuid>-<timestamp>.<ext>  (old Settings format, backward compat)
CREATE POLICY "avatars_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (
    -- Regular user: path starts with their UUID
    name LIKE 'avatars/' || auth.uid()::text || '%'
    OR
    -- Admin / SuperAdmin: can upload for any user
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND LOWER(role) IN ('admin', 'superadmin', 'super_admin')
    )
  )
);

-- ── UPDATE (re-upload / upsert when file already exists) ────
CREATE POLICY "avatars_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    name LIKE 'avatars/' || auth.uid()::text || '%'
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND LOWER(role) IN ('admin', 'superadmin', 'super_admin')
    )
  )
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (
    name LIKE 'avatars/' || auth.uid()::text || '%'
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND LOWER(role) IN ('admin', 'superadmin', 'super_admin')
    )
  )
);

-- ── SELECT (public read — bucket is public) ──────────────────
CREATE POLICY "avatars_select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- ── DELETE (own avatar, or admin for any) ────────────────────
CREATE POLICY "avatars_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    name LIKE 'avatars/' || auth.uid()::text || '%'
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND LOWER(role) IN ('admin', 'superadmin', 'super_admin')
    )
  )
);

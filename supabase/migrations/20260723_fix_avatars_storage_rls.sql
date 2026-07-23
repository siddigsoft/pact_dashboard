-- ============================================================
-- Fix: Avatars bucket Storage RLS policies
--
-- Problems fixed:
--   1. Admin check only read profiles.role, which is often stale
--      ('dataCollector') when the real role lives in user_roles.
--      All policies now check BOTH profiles.role AND user_roles.
--   2. UPDATE policy used split_part(name,'/',2) — never matched
--      auth.uid(), blocking all re-uploads.
--   3. Admin bypass was missing from UPDATE/DELETE policies.
-- ============================================================

-- Helper: returns true when the caller is admin/superadmin/ict/hr_admin
-- by checking BOTH profiles.role (fast) and user_roles (authoritative).
-- Inline so it works inside storage policy WITH CHECK clauses.

-- Drop all existing policies for the avatars bucket
DROP POLICY IF EXISTS "Users can upload own avatar"   ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar"   ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload any avatar"  ON storage.objects;
DROP POLICY IF EXISTS "Public can view avatars"       ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert"                ON storage.objects;
DROP POLICY IF EXISTS "avatars_update"                ON storage.objects;
DROP POLICY IF EXISTS "avatars_select"                ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete"                ON storage.objects;

-- ── INSERT ───────────────────────────────────────────────────
CREATE POLICY "avatars_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (
    -- Own avatar
    name LIKE 'avatars/' || auth.uid()::text || '%'
    OR
    -- Admin: check profiles.role first, then user_roles fallback
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND LOWER(role) IN ('admin','superadmin','super_admin','hr_admin','ict')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND LOWER(role) IN ('admin','superadmin','super_admin','hr_admin','ict')
    )
  )
);

-- ── UPDATE ───────────────────────────────────────────────────
CREATE POLICY "avatars_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    name LIKE 'avatars/' || auth.uid()::text || '%'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND LOWER(role) IN ('admin','superadmin','super_admin','hr_admin','ict')
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND LOWER(role) IN ('admin','superadmin','super_admin','hr_admin','ict')
    )
  )
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (
    name LIKE 'avatars/' || auth.uid()::text || '%'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND LOWER(role) IN ('admin','superadmin','super_admin','hr_admin','ict')
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND LOWER(role) IN ('admin','superadmin','super_admin','hr_admin','ict')
    )
  )
);

-- ── SELECT (public read — avatars bucket is public) ──────────
CREATE POLICY "avatars_select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- ── DELETE ───────────────────────────────────────────────────
CREATE POLICY "avatars_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    name LIKE 'avatars/' || auth.uid()::text || '%'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND LOWER(role) IN ('admin','superadmin','super_admin','hr_admin','ict')
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND LOWER(role) IN ('admin','superadmin','super_admin','hr_admin','ict')
    )
  )
);

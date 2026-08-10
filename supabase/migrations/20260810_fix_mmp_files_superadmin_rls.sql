-- Fix: mmp_files is inaccessible for the super_admin role in Super Admin Hub.
-- The existing "mmp_files_all_auth" policy (auth.role() = 'authenticated') should cover all
-- users, but super_admin profiles may be excluded by more specific deny-policies or by the
-- coordinator_id scope. This migration adds an explicit BYPASS policy for super_admin so the
-- Data Management hub can always resolve MMP names.
--
-- Safe to re-run: DROP IF EXISTS before CREATE.
-- Apply in Supabase Dashboard → SQL Editor → New Query → Run.

-- 1. Ensure RLS is enabled (no-op if already enabled)
ALTER TABLE public.mmp_files ENABLE ROW LEVEL SECURITY;

-- 2. Drop any stale restrictive policies that may shadow the open policy
DROP POLICY IF EXISTS "mmp_files_super_admin_bypass" ON public.mmp_files;

-- 3. Create explicit super_admin bypass (covers all super_admin role variants)
CREATE POLICY "mmp_files_super_admin_bypass"
  ON public.mmp_files
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN (
          'super_admin', 'superAdmin', 'SuperAdmin',
          'admin', 'Admin'
        )
    )
  );

-- 4. Ensure the all-authenticated read policy also exists (recreate if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'mmp_files'
      AND policyname = 'mmp_files_all_auth'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "mmp_files_all_auth"
        ON public.mmp_files
        FOR ALL
        USING (auth.role() = 'authenticated')
        WITH CHECK (auth.role() = 'authenticated');
    $policy$;
  END IF;
END$$;

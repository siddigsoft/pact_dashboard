-- =============================================================================
-- FIX: Allow super_admin / admin / fom / ict roles to read all mmp_files
--
-- WHY THIS IS NEEDED:
--   The mmp_files table has RLS active.  The current policies filter by
--   coordinator_id = auth.uid(), which means only coordinators can see their
--   own files.  Super-admin users have a different role and no coordinator_id
--   match, so they get 0 rows — breaking the Data Management Center page.
--
-- HOW TO APPLY:
--   1. Open your Supabase project → SQL Editor
--   2. Paste and run this entire file
--   3. Hard-refresh the app (Ctrl+Shift+R) — MMP names will appear immediately
-- =============================================================================

-- Step 1: inspect current policies (optional – just for visibility)
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'mmp_files';

-- Step 2: create the super-admin read policy (safe to re-run)
DROP POLICY IF EXISTS "superadmin_read_all_mmp_files" ON public.mmp_files;

CREATE POLICY "superadmin_read_all_mmp_files"
  ON public.mmp_files
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN (
          'super_admin', 'superAdmin',
          'admin',
          'fom', 'hub_supervisor',
          'ict', 'ictSupport'
        )
    )
  );

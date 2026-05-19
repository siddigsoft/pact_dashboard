-- =============================================================================
-- COMPREHENSIVE FIX: Grant super_admin full SELECT access to ALL tables
--
-- WHY NEEDED:
--   The app determines super-admin status via the `super_admins` table
--   (user_id + is_active), NOT via profiles.role.  Many RLS policies use
--   profiles.role checks that exclude the super-admin user.
--
--   This script adds a permissive SELECT policy to every RLS-enabled table,
--   keyed on the super_admins table — exactly how the app itself checks.
--
-- HOW TO APPLY:
--   1. Open your Supabase project → SQL Editor
--   2. Paste this entire file and click RUN
--   3. Hard-refresh the app (Ctrl+Shift+R) — all pages show full data
-- =============================================================================

DO $$
DECLARE
  r RECORD;
  policy_name TEXT;
BEGIN
  -- Iterate every table that has RLS enabled in the public schema
  FOR r IN
    SELECT DISTINCT pt.tablename
    FROM pg_tables pt
    JOIN pg_class pc ON pc.relname = pt.tablename
    JOIN pg_namespace pn ON pn.oid = pc.relnamespace
    WHERE pt.schemaname = 'public'
      AND pc.relrowsecurity = true
    ORDER BY pt.tablename
  LOOP
    policy_name := 'superadmin_select_all_' || r.tablename;

    BEGIN
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.%I',
        policy_name, r.tablename
      );

      -- Check via super_admins table (same logic the app uses for isSuperAdmin)
      EXECUTE format(
        $policy$
          CREATE POLICY %I ON public.%I
          FOR SELECT
          USING (
            EXISTS (
              SELECT 1 FROM public.super_admins
              WHERE super_admins.user_id = (SELECT auth.uid())
                AND super_admins.is_active = true
            )
          )
        $policy$,
        policy_name, r.tablename
      );

    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped table %: %', r.tablename, SQLERRM;
    END;

  END LOOP;

  RAISE NOTICE 'Done. Super-admin SELECT policies applied to all RLS tables.';
END $$;

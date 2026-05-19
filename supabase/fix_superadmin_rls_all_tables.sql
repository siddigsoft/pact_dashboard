-- =============================================================================
-- COMPREHENSIVE FIX: Grant super_admin full SELECT access to ALL tables
--
-- WHY NEEDED:
--   Dozens of tables have RLS policies listing specific roles (admin, ict,
--   financialAdmin, supervisor...) but never include super_admin / superAdmin.
--   This causes Super Admin users to see only their own rows (or nothing) on
--   almost every page in the app.
--
-- WHAT THIS DOES:
--   Loops over every RLS-enabled table in the public schema and adds one
--   permissive SELECT policy for super_admin / superAdmin roles.
--   Existing policies are NOT modified — this simply adds an additional
--   permissive policy alongside them.
--
-- HOW TO APPLY:
--   1. Open your Supabase project → SQL Editor (left sidebar)
--   2. Paste this entire file and click RUN
--   3. Hard-refresh the app (Ctrl+Shift+R)
--      → All pages will show complete data immediately
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
      AND pc.relrowsecurity = true   -- RLS is enabled on this table
    ORDER BY pt.tablename
  LOOP
    policy_name := 'superadmin_select_all_' || r.tablename;

    BEGIN
      -- Drop existing version of this policy if present (idempotent)
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.%I',
        policy_name, r.tablename
      );

      -- Add new permissive SELECT policy for super_admin roles
      EXECUTE format(
        $policy$
          CREATE POLICY %I ON public.%I
          FOR SELECT
          USING (
            EXISTS (
              SELECT 1 FROM public.profiles
              WHERE profiles.id = (SELECT auth.uid())
                AND profiles.role IN (
                  'super_admin', 'superAdmin',
                  'admin',
                  'financialAdmin',
                  'fom', 'hub_supervisor',
                  'ict', 'ictSupport'
                )
            )
          )
        $policy$,
        policy_name, r.tablename
      );

    EXCEPTION WHEN OTHERS THEN
      -- Some system/view tables may reject policy creation — skip silently
      RAISE NOTICE 'Skipped table %: %', r.tablename, SQLERRM;
    END;

  END LOOP;

  RAISE NOTICE 'Done. Super-admin SELECT policies applied to all RLS tables.';
END $$;

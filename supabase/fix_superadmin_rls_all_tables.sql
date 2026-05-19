-- =============================================================================
-- MASTER FIX: Super Admin full data access across all tables
--
-- WHY THIS IS NEEDED:
--   The super-admin user's profiles.role = 'dataCollector' so all existing
--   policies that check profiles.role IN ('admin','super_admin',...) deny
--   access. This script uses the is_super_admin() SECURITY DEFINER function
--   (which bypasses RLS and reads super_admins directly) to grant full SELECT
--   access to the active super admin on every RLS-protected table.
--
-- WHAT IT DOES:
--   Step 1 - Recreates is_super_admin() to be sure it exists and works.
--   Step 2 - Fixes super_admins table so the user can read their own row.
--   Step 3 - Adds a permissive SELECT policy to every RLS-enabled table.
--
-- HOW TO APPLY:
--   Supabase → SQL Editor → paste entire file → Run
--   Then hard-refresh the app (Ctrl+Shift+R) and log back in.
-- =============================================================================

-- ── STEP 1: Ensure is_super_admin() SECURITY DEFINER function exists ────────
DROP FUNCTION IF EXISTS public.is_super_admin(UUID);
DROP FUNCTION IF EXISTS public.is_super_admin();

CREATE OR REPLACE FUNCTION public.is_super_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER   -- bypasses RLS; reads super_admins directly
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE user_id = check_user_id
      AND is_active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO anon;

-- ── STEP 2: Fix super_admins table SELECT policy (self-read) ────────────────
DROP POLICY IF EXISTS "super_admins_select"     ON public.super_admins;
DROP POLICY IF EXISTS "super_admins_view"        ON public.super_admins;
DROP POLICY IF EXISTS "super_admins_view_own"    ON public.super_admins;
DROP POLICY IF EXISTS "super_admins_view_admin"  ON public.super_admins;

CREATE POLICY "super_admins_select" ON public.super_admins
  FOR SELECT USING (
    user_id = auth.uid()        -- any user can read their OWN row
    OR public.is_super_admin()  -- super admins can see all rows
  );

-- ── STEP 3: Add permissive SELECT policy to every RLS-protected table ───────
DO $$
DECLARE
  r RECORD;
  policy_name TEXT;
BEGIN
  FOR r IN
    SELECT DISTINCT pt.tablename
    FROM pg_tables pt
    JOIN pg_class pc ON pc.relname = pt.tablename
    JOIN pg_namespace pn ON pn.oid = pc.relnamespace
    WHERE pt.schemaname = 'public'
      AND pc.relrowsecurity = true
    ORDER BY pt.tablename
  LOOP
    policy_name := 'superadmin_full_select_' || r.tablename;

    BEGIN
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.%I',
        policy_name, r.tablename
      );

      -- Uses is_super_admin() which is SECURITY DEFINER — no circular deps
      EXECUTE format(
        $policy$
          CREATE POLICY %I ON public.%I
          FOR SELECT
          USING ( public.is_super_admin() )
        $policy$,
        policy_name, r.tablename
      );

    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped table %: %', r.tablename, SQLERRM;
    END;

  END LOOP;

  RAISE NOTICE 'Done — super-admin SELECT policies applied to all RLS tables.';
END $$;

-- ── DIAGNOSTIC: Show what the running super admin user looks like ────────────
SELECT
  sa.user_id,
  sa.is_active,
  p.role   AS profiles_role,
  p.email,
  public.is_super_admin(sa.user_id) AS fn_result
FROM public.super_admins sa
LEFT JOIN public.profiles p ON p.id = sa.user_id
WHERE sa.is_active = true;

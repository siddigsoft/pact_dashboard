-- =============================================================================
-- EMERGENCY FIX: Infinite recursion in super_admins RLS policy
--
-- CAUSE: A previous script added a policy named "superadmin_select_all_super_admins"
-- (or "superadmin_full_select_super_admins") on the super_admins table that
-- checks the super_admins table FROM WITHIN the super_admins table policy —
-- a self-referential loop. This breaks ALL data access for ALL users.
--
-- WHAT THIS DOES: Removes every policy added by the fix scripts, then restores
-- the original correct super_admins policy. No user data is changed.
--
-- RUN IN: Supabase → SQL Editor → paste entire file → Run
-- =============================================================================

-- Step 1: Remove ALL policies added by the fix scripts on super_admins
-- (these are the ones causing the infinite recursion)
DROP POLICY IF EXISTS "superadmin_select_all_super_admins"      ON public.super_admins;
DROP POLICY IF EXISTS "superadmin_full_select_super_admins"     ON public.super_admins;
DROP POLICY IF EXISTS "superadmin_select_all_profiles"          ON public.profiles;
DROP POLICY IF EXISTS "superadmin_full_select_profiles"         ON public.profiles;

-- Step 2: Remove ALL superadmin_select_all_* and superadmin_full_select_* policies
-- from every table (the DO loop that was run before)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        policyname LIKE 'superadmin_select_all_%'
        OR policyname LIKE 'superadmin_full_select_%'
      )
  LOOP
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
      RAISE NOTICE 'Dropped: % on %', r.policyname, r.tablename;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not drop % on %: %', r.policyname, r.tablename, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Done removing all superadmin_* policies.';
END $$;

-- Step 3: Recreate is_super_admin() correctly (SECURITY DEFINER — bypasses RLS,
-- no recursion possible even when called from within other RLS policies)
CREATE OR REPLACE FUNCTION public.is_super_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
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

-- Step 4: Restore the correct super_admins SELECT policy
DROP POLICY IF EXISTS "super_admins_select"    ON public.super_admins;
DROP POLICY IF EXISTS "super_admins_view"       ON public.super_admins;
DROP POLICY IF EXISTS "super_admins_view_own"   ON public.super_admins;
DROP POLICY IF EXISTS "super_admins_view_admin" ON public.super_admins;

CREATE POLICY "super_admins_select" ON public.super_admins
  FOR SELECT USING (
    user_id = (SELECT auth.uid())     -- any user can read their OWN row
    OR public.is_super_admin()        -- super admins see all (uses SECURITY DEFINER, no loop)
  );

-- Step 5: Restore profiles open read (all authenticated users can read profiles)
DROP POLICY IF EXISTS profiles_select_combined      ON public.profiles;
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
DROP POLICY IF EXISTS profiles_select_open          ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.profiles;

CREATE POLICY profiles_select_open
  ON public.profiles FOR SELECT
  USING (true);

-- Step 6: Confirm no more recursion — this should return results without error
SELECT COUNT(*) AS total_profiles FROM public.profiles;
SELECT COUNT(*) AS total_super_admins FROM public.super_admins;

-- Step 7: Show active super admins
SELECT sa.user_id, p.email, p.role AS profiles_role, sa.is_active
FROM public.super_admins sa
LEFT JOIN public.profiles p ON p.id = sa.user_id
WHERE sa.is_active = true;

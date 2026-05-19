-- =============================================================================
-- MASTER FIX: All roles data access + Super Admin full access
--
-- Addresses:
--   1. Super admin identified via super_admins table (not profiles.role)
--   2. All other roles use profiles.role or user_roles for their own data
--   3. is_super_admin() kept with CREATE OR REPLACE (no DROP — deps exist)
--   4. is_admin_or_super_admin() also includes super_admins table check
--   5. user_roles readable by super admins
--   6. profiles readable by all authenticated users
--
-- RUN IN: Supabase → SQL Editor → paste entire file → Run
-- THEN: Log out of the app and log back in, or hard-refresh (Ctrl+Shift+R)
-- =============================================================================

-- ── 1. Recreate is_super_admin() without DROP (other policies depend on it) ──
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

-- ── 2. Recreate is_admin_or_super_admin() — check super_admins table too ────
CREATE OR REPLACE FUNCTION public.is_admin_or_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Check profiles.role first
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

  IF v_role IN (
    'admin', 'Admin', 'administrator',
    'SuperAdmin', 'superAdmin', 'super_admin', 'Super Admin',
    'CountryDirector', 'countryDirector', 'Country Director',
    'FinancialAdmin', 'financialAdmin', 'finance_admin',
    'ICT', 'ict'
  ) THEN
    RETURN TRUE;
  END IF;

  -- Also check super_admins table (handles users whose profiles.role != 'superAdmin')
  RETURN EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE user_id = auth.uid() AND is_active = true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_super_admin() TO authenticated;

-- ── 3. Fix super_admins SELECT policy (self-read + super admin reads all) ───
DROP POLICY IF EXISTS "super_admins_select"    ON public.super_admins;
DROP POLICY IF EXISTS "super_admins_view"       ON public.super_admins;
DROP POLICY IF EXISTS "super_admins_view_own"   ON public.super_admins;
DROP POLICY IF EXISTS "super_admins_view_admin" ON public.super_admins;

CREATE POLICY "super_admins_select" ON public.super_admins
  FOR SELECT USING (
    user_id = auth.uid()        -- any user can read their OWN row
    OR public.is_super_admin()  -- super admin can see all rows
  );

-- ── 4. Fix profiles SELECT — all authenticated users can read all profiles ──
DROP POLICY IF EXISTS profiles_select_combined         ON public.profiles;
DROP POLICY IF EXISTS profiles_select_authenticated    ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Service role can read all profiles"    ON public.profiles;

CREATE POLICY profiles_select_open
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Service role can read all profiles"
  ON public.profiles FOR SELECT
  USING ((SELECT auth.role()) = 'service_role');

-- ── 5. Fix user_roles SELECT — super admin can see all rows ─────────────────
DROP POLICY IF EXISTS user_roles_select_self_or_admin ON public.user_roles;

CREATE POLICY user_roles_select_self_or_admin
  ON public.user_roles FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('admin','ict','Admin','ICT')
    )
  );

-- ── 6. Add super-admin full SELECT on every RLS-protected table ──────────────
DO $$
DECLARE
  r RECORD;
  pname TEXT;
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
    pname := 'superadmin_full_select_' || r.tablename;
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pname, r.tablename);
      -- Uses SECURITY DEFINER is_super_admin() — no circular RLS dependency
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING ( public.is_super_admin() )',
        pname, r.tablename
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped %: %', r.tablename, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Super-admin SELECT policies applied to all RLS tables.';
END $$;

-- ── 7. Diagnostic: show active super admins and verify function works ─────────
SELECT
  sa.user_id,
  sa.is_active,
  p.role           AS profiles_role,
  p.email,
  p.name,
  public.is_super_admin(sa.user_id)          AS is_super_admin_fn,
  public.is_admin_or_super_admin()           AS is_admin_or_super_current_user
FROM public.super_admins sa
LEFT JOIN public.profiles p ON p.id = sa.user_id
WHERE sa.is_active = true;

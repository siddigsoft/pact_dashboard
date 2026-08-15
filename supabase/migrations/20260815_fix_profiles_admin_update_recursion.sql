-- Fix: "infinite recursion detected in policy for relation profiles"
--
-- Root cause: the profiles_admin_update RLS UPDATE policy contained an
--   EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() ...)
-- sub-query.  PostgreSQL evaluates that sub-query under the SAME RLS
-- context, which immediately triggers the UPDATE policy again → infinite
-- loop.
--
-- Solution: extract the role check into a SECURITY DEFINER function.
-- SECURITY DEFINER runs with the function-owner's privileges (superuser),
-- so it bypasses RLS entirely and can safely read public.profiles without
-- re-triggering any policy.

-- ── 1. SECURITY DEFINER helper ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND LOWER(role) IN ('admin', 'superadmin', 'super_admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;

COMMENT ON FUNCTION public.current_user_is_admin IS
'SECURITY DEFINER helper: returns true when the calling session belongs to
 an admin or super-admin.  Uses the function-owner privileges so it can
 read public.profiles without triggering RLS recursion.';

-- ── 2. Drop the recursive policy ─────────────────────────────────────────────
DROP POLICY IF EXISTS profiles_admin_update ON public.profiles;

-- ── 3. Re-create using the SECURITY DEFINER helper ───────────────────────────
--    No direct reference to public.profiles inside the policy expression.
CREATE POLICY profiles_admin_update
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR public.current_user_is_admin()
  )
  WITH CHECK (
    public.is_super_admin((SELECT auth.uid()))
    OR public.current_user_is_admin()
  );

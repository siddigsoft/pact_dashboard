-- Fix: "infinite recursion detected in policy for relation profiles"
-- Also adds update_own_bank_account() so field staff can save bank details
-- without hitting RLS at all.
--
-- Root cause: profiles_admin_update RLS UPDATE policy contained an inline
--   EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() ...)
-- sub-query.  PostgreSQL evaluates it under the SAME RLS context → loop.

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

-- ── 2. Drop the recursive policy ─────────────────────────────────────────────
DROP POLICY IF EXISTS profiles_admin_update ON public.profiles;

-- ── 3. Re-create using the SECURITY DEFINER helper ───────────────────────────
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

-- ── 4. RPC: any user can update their OWN bank account ───────────────────────
-- SECURITY DEFINER bypasses RLS so it never triggers the policy above.
-- The WHERE id = auth.uid() ensures users can only update their own row.
CREATE OR REPLACE FUNCTION public.update_own_bank_account(bank_account_data JSONB)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
  SET    bank_account = bank_account_data,
         updated_at   = now()
  WHERE  id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.update_own_bank_account(JSONB) TO authenticated;

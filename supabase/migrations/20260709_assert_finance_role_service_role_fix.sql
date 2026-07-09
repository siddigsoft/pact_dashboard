-- =============================================================================
-- PATCH: _assert_finance_role() — allow service_role callers
--
-- Problem: activate_pre_fund_rpc (and other pre-fund RPCs) call
--   _assert_finance_role(), which resolves the caller's role via
--   profiles.id = auth.uid(). When the bank-feed edge function invokes these
--   RPCs using the SUPABASE_SERVICE_ROLE_KEY client, auth.uid() is NULL and
--   auth.role() = 'service_role', so the profile lookup returns nothing and
--   the guard raises "Access denied".
--
-- Fix: short-circuit the check for service_role JWT so edge functions and
--   internal server-side automations can call the RPCs without needing a real
--   user session.  All human-facing API calls still go through the full
--   profile/role lookup as before.
-- =============================================================================

CREATE OR REPLACE FUNCTION _assert_finance_role()Financial Summary
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Service-role JWT (used by edge functions / server automation) bypasses the
  -- per-user profile check.  The caller must already have authenticated with
  -- the service-role key, which is equivalent to a super-admin grant.
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;

  -- For regular authenticated users, verify they hold a finance/admin role.
  -- Accept all known canonical spellings (legacy tokens included).
  SELECT LOWER(role) INTO v_role
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN (
    'super_admin', 'superadmin', 'admin',
    'financialadmin', 'financial_admin', 'financialadmin'
  ) THEN
    RAISE EXCEPTION 'Access denied: finance or admin role required (role="%").', COALESCE(v_role, '<null>');
  END IF;
END;
$$;

-- Grants unchanged — keep service_role implicit (it bypasses RLS/grants anyway)
REVOKE ALL ON FUNCTION _assert_finance_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION _assert_finance_role() TO authenticated;

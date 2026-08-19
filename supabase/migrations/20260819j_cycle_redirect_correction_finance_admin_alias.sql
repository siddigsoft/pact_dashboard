-- Accept the alternate Finance Admin role code used by some existing profiles.
-- This remains limited to financial reversal roles; it does not authorize
-- operational Admin or FOM users.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_cycle_redirect_correction_authorizer(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND lower(regexp_replace(coalesce(p.role::text, ''), '[^a-z0-9]', '', 'g'))
          IN ('superadmin', 'finance', 'financialadmin', 'financeadmin', 'accountant')
  );
$$;

REVOKE ALL ON FUNCTION public.is_cycle_redirect_correction_authorizer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_cycle_redirect_correction_authorizer(uuid) TO authenticated;

COMMIT;
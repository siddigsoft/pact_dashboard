-- Allow the project's canonical Financial Admin role to perform the same
-- controlled legacy Redirect correction as Finance and Accountant.
--
-- The original correction migration normalized role names but omitted the
-- financialAdmin/financial_admin aliases used by profiles in this project.
-- Keep the authorizer narrow: this does not grant correction to operational
-- Admin, FOM, or other roles.

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
          IN ('superadmin', 'finance', 'financialadmin', 'accountant')
  );
$$;

REVOKE ALL ON FUNCTION public.is_cycle_redirect_correction_authorizer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_cycle_redirect_correction_authorizer(uuid) TO authenticated;

COMMIT;
-- Normalize role values case-insensitively before removing separators.
-- The prior correction authorizer used [^a-z0-9] before lower(), which
-- incorrectly removed uppercase letters from stored camel-case roles such as
-- "superAdmin" and "financialAdmin".

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
      AND (
        regexp_replace(lower(coalesce(p.role::text, '')), '[^a-z0-9]', '', 'g')
          IN (
            'superadmin', 'superadministrator',
            'finance', 'financialadmin', 'financeadmin', 'accountant'
          )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(p.additional_roles) = 'array' THEN p.additional_roles
              ELSE '[]'::jsonb
            END
          ) AS additional_role
          WHERE regexp_replace(
            lower(coalesce(additional_role->>'role', '')),
            '[^a-z0-9]', '', 'g'
          ) IN (
            'superadmin', 'superadministrator',
            'finance', 'financialadmin', 'financeadmin', 'accountant'
          )
        )
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND regexp_replace(lower(coalesce(ur.role::text, '')), '[^a-z0-9]', '', 'g')
          IN (
            'superadmin', 'superadministrator',
            'finance', 'financialadmin', 'financeadmin', 'accountant'
          )
  );
$$;

REVOKE ALL ON FUNCTION public.is_cycle_redirect_correction_authorizer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_cycle_redirect_correction_authorizer(uuid) TO authenticated;

COMMIT;
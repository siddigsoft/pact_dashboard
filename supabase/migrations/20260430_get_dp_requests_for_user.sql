-- SECURITY DEFINER function: returns down_payment_requests with role-based
-- filtering applied in SQL, bypassing the overly-restrictive RLS on the table.
--
-- Role normalisation: strips non-alpha chars and lowercases so that
--   'Super Admin', 'super_admin', 'superAdmin', 'SUPERADMIN' all match.

DROP FUNCTION IF EXISTS public.get_dp_requests_for_user(uuid, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_dp_requests_for_user(
  p_user_id          uuid,
  p_role             text,
  p_hub_id           uuid    DEFAULT NULL,
  p_secondary_hub_id uuid    DEFAULT NULL
)
RETURNS SETOF public.down_payment_requests
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT *
  FROM public.down_payment_requests
  WHERE CASE
    -- Privileged roles see every record
    WHEN REGEXP_REPLACE(lower(p_role), '[^a-z]', '', 'g') = ANY(ARRAY[
           'superadmin', 'admin', 'financialadmin', 'ict',
           'fom', 'fieldoperationmanager',
           'countrydirector', 'datateam'
         ])
      THEN true

    -- Supervisors see their own requests + their hub(s)
    WHEN REGEXP_REPLACE(lower(p_role), '[^a-z]', '', 'g') = ANY(ARRAY['supervisor', 'hubsupervisor'])
      THEN (
        requested_by = p_user_id
        OR hub_id = p_hub_id
        OR (p_secondary_hub_id IS NOT NULL AND hub_id = p_secondary_hub_id)
      )

    -- Everyone else sees only their own requests
    ELSE requested_by = p_user_id
  END
  ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_dp_requests_for_user(uuid, text, uuid, uuid)
  TO authenticated, anon, service_role;

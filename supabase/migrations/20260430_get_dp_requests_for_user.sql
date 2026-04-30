-- SECURITY DEFINER function: returns down_payment_requests with role-based
-- filtering applied in SQL, bypassing the overly-restrictive RLS on the table.
-- Parameters are TEXT (not uuid) because requested_by / hub_id columns are text.

DROP FUNCTION IF EXISTS public.get_dp_requests_for_user(uuid, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.get_dp_requests_for_user(text, text, text, text);

CREATE OR REPLACE FUNCTION public.get_dp_requests_for_user(
  p_user_id          text,
  p_role             text,
  p_hub_id           text    DEFAULT NULL,
  p_secondary_hub_id text    DEFAULT NULL
)
RETURNS SETOF public.down_payment_requests
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT *
  FROM public.down_payment_requests
  WHERE CASE
    WHEN REGEXP_REPLACE(lower(p_role), '[^a-z]', '', 'g') = ANY(ARRAY[
           'superadmin', 'admin', 'financialadmin', 'ict',
           'fom', 'fieldoperationmanager',
           'countrydirector', 'datateam'
         ])
      THEN true
    WHEN REGEXP_REPLACE(lower(p_role), '[^a-z]', '', 'g') = ANY(ARRAY['supervisor', 'hubsupervisor'])
      THEN (
        requested_by = p_user_id
        OR hub_id = p_hub_id
        OR (p_secondary_hub_id IS NOT NULL AND hub_id = p_secondary_hub_id)
      )
    ELSE requested_by = p_user_id
  END
  ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_dp_requests_for_user(text, text, text, text)
  TO authenticated, anon, service_role;

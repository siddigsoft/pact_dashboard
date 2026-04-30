-- SECURITY DEFINER function: bypasses RLS on down_payment_requests.
-- Column types confirmed: requested_by = UUID, hub_id = TEXT
-- Parameters are TEXT so JS can pass user.id (string) directly.

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
    -- Admins / directors see everything
    WHEN REGEXP_REPLACE(lower(p_role), '[^a-z]', '', 'g') = ANY(ARRAY[
           'superadmin', 'admin', 'financialadmin', 'ict',
           'fom', 'fieldoperationmanager', 'countrydirector', 'datateam'
         ])
      THEN true

    -- Supervisors see their hub + their own requests
    WHEN REGEXP_REPLACE(lower(p_role), '[^a-z]', '', 'g') = ANY(ARRAY['supervisor', 'hubsupervisor'])
      THEN (
        requested_by::text = p_user_id                                          -- own requests (uuid → text)
        OR hub_id           = p_hub_id                                          -- hub_id is already TEXT
        OR (p_secondary_hub_id IS NOT NULL AND hub_id = p_secondary_hub_id)
      )

    -- Everyone else sees only their own requests
    ELSE requested_by::text = p_user_id
  END
  ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_dp_requests_for_user(text, text, text, text)
  TO authenticated, anon, service_role;

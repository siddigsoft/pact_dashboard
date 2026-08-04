-- Profiles that currently have GPS coordinates (for field maps).
-- Avoids hydrating the full users directory into React Context.

CREATE OR REPLACE FUNCTION public.list_profiles_with_location(
  p_limit integer DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  full_name text,
  username text,
  email text,
  role text,
  status text,
  availability text,
  avatar_url text,
  state_id text,
  hub_id text,
  location jsonb,
  last_activity timestamptz,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.username,
    p.email,
    p.role,
    p.status,
    p.availability,
    p.avatar_url,
    p.state_id,
    p.hub_id,
    p.location,
    p.last_activity,
    COALESCE(p.is_active, true) AS is_active
  FROM public.profiles p
  WHERE COALESCE(p.is_active, true) = true
    AND p.location IS NOT NULL
    AND NULLIF(btrim(p.location->>'latitude'), '') IS NOT NULL
    AND NULLIF(btrim(p.location->>'longitude'), '') IS NOT NULL
    AND (p.location->>'latitude') ~ '^-?[0-9]+(\\.[0-9]+)?$'
    AND (p.location->>'longitude') ~ '^-?[0-9]+(\\.[0-9]+)?$'
  ORDER BY p.last_activity DESC NULLS LAST, p.full_name NULLS LAST
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));
$$;

GRANT EXECUTE ON FUNCTION public.list_profiles_with_location(integer) TO authenticated;

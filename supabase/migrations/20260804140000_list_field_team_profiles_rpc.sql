-- Field team directory: coordinators / data collectors with optional GPS.
-- Avoids hydrating the full profiles list into React Context for FieldTeam.

CREATE OR REPLACE FUNCTION public.list_field_team_profiles(
  p_search text DEFAULT '',
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  full_name text,
  username text,
  email text,
  phone text,
  role text,
  status text,
  availability text,
  avatar_url text,
  state_id text,
  hub_id text,
  location jsonb,
  last_activity timestamptz,
  is_active boolean,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT
      p.id,
      p.full_name,
      p.username,
      p.email,
      p.phone,
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
      AND lower(replace(COALESCE(p.role, ''), ' ', '')) IN (
        'coordinator',
        'datacollector',
        'data_collector',
        'enumerator',
        'fieldassistant',
        'field_assistant'
      )
      AND (
        NULLIF(btrim(p_search), '') IS NULL
        OR p.full_name ILIKE '%' || btrim(p_search) || '%'
        OR p.email ILIKE '%' || btrim(p_search) || '%'
        OR p.username ILIKE '%' || btrim(p_search) || '%'
        OR p.phone ILIKE '%' || btrim(p_search) || '%'
      )
  )
  SELECT
    f.*,
    (SELECT count(*)::bigint FROM filtered) AS total_count
  FROM filtered f
  ORDER BY f.last_activity DESC NULLS LAST, f.full_name NULLS LAST
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 300))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

GRANT EXECUTE ON FUNCTION public.list_field_team_profiles(text, integer, integer) TO authenticated;

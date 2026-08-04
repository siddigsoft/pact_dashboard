-- Paginated / searchable user directory + batch id lookup.
-- Replaces "select all profiles into React Context on every session".

CREATE OR REPLACE FUNCTION public.search_user_directory(
  p_search text DEFAULT '',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_status text DEFAULT NULL,
  p_active_only boolean DEFAULT true
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
  department_id uuid,
  state_id text,
  hub_id text,
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
      p.role,
      p.status,
      p.availability,
      p.avatar_url,
      p.department_id,
      p.state_id,
      p.hub_id,
      COALESCE(p.is_active, true) AS is_active
    FROM public.profiles p
    WHERE
      (NOT p_active_only OR COALESCE(p.is_active, true) = true)
      AND (p_status IS NULL OR p.status = p_status)
      AND (
        NULLIF(btrim(p_search), '') IS NULL
        OR p.full_name ILIKE '%' || btrim(p_search) || '%'
        OR p.email ILIKE '%' || btrim(p_search) || '%'
        OR p.username ILIKE '%' || btrim(p_search) || '%'
      )
  )
  SELECT
    f.*,
    (SELECT count(*)::bigint FROM filtered) AS total_count
  FROM filtered f
  ORDER BY f.full_name NULLS LAST
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

CREATE OR REPLACE FUNCTION public.get_profiles_by_ids(p_ids uuid[])
RETURNS TABLE (
  id uuid,
  full_name text,
  username text,
  email text,
  role text,
  status text,
  availability text,
  avatar_url text,
  department_id uuid,
  state_id text,
  hub_id text,
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
    p.department_id,
    p.state_id,
    p.hub_id,
    COALESCE(p.is_active, true) AS is_active
  FROM public.profiles p
  WHERE p.id = ANY (p_ids);
$$;

GRANT EXECUTE ON FUNCTION public.search_user_directory(text, integer, integer, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profiles_by_ids(uuid[]) TO authenticated;

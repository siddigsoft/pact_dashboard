-- RPC: get_mmp_coordinators
-- Returns all coordinators who have sites assigned in a given MMP file,
-- with their site count and profile info. Uses SECURITY DEFINER to bypass
-- RLS on mmp_site_entries so super admins see the full picture.

CREATE OR REPLACE FUNCTION public.get_mmp_coordinators(p_mmp_file_id uuid)
RETURNS TABLE (
  coordinator_id  uuid,
  full_name       text,
  email           text,
  username        text,
  site_count      bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    coord_id                                    AS coordinator_id,
    COALESCE(p.full_name, p.username, p.email)  AS full_name,
    p.email,
    p.username,
    COUNT(*)::bigint                            AS site_count
  FROM (
    SELECT forwarded_to_user_id AS coord_id
    FROM mmp_site_entries
    WHERE mmp_file_id = p_mmp_file_id
      AND forwarded_to_user_id IS NOT NULL
    UNION ALL
    SELECT accepted_by AS coord_id
    FROM mmp_site_entries
    WHERE mmp_file_id = p_mmp_file_id
      AND accepted_by IS NOT NULL
      AND forwarded_to_user_id IS NULL
  ) src
  LEFT JOIN profiles p ON p.id = src.coord_id
  GROUP BY src.coord_id, p.full_name, p.username, p.email
  ORDER BY COALESCE(p.full_name, p.username, p.email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mmp_coordinators(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_mmp_coordinators(uuid) IS
'Returns all coordinators with assigned sites in the given MMP file, bypassing RLS. Safe for super-admin use.';

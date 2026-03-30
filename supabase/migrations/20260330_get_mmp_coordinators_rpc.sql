-- RPC: get_mmp_coordinators
-- Returns all coordinators who have sites assigned in a given MMP file,
-- with their site count and profile info. Uses SECURITY DEFINER to bypass
-- RLS on mmp_site_entries so super admins see the full picture.
--
-- Coordinator ID priority (mirrors mmpActions.ts line 411):
--   1. forwarded_to_user_id  (UUID FK — primary path for newer assignments)
--   2. additional_data->>'assigned_to'  (JSON — legacy/alternate path)
--   3. accepted_by  (text UUID — last resort, only if UUID-shaped)

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
  WITH coord_ids AS (
    SELECT
      COALESCE(
        forwarded_to_user_id,
        CASE
          WHEN additional_data->>'assigned_to' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (additional_data->>'assigned_to')::uuid
          ELSE NULL
        END,
        CASE
          WHEN accepted_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN accepted_by::uuid
          ELSE NULL
        END
      ) AS coord_id
    FROM mmp_site_entries
    WHERE mmp_file_id = p_mmp_file_id
  )
  SELECT
    ci.coord_id                                 AS coordinator_id,
    COALESCE(p.full_name, p.username, p.email)  AS full_name,
    p.email,
    p.username,
    COUNT(*)::bigint                            AS site_count
  FROM coord_ids ci
  LEFT JOIN profiles p ON p.id = ci.coord_id
  WHERE ci.coord_id IS NOT NULL
  GROUP BY ci.coord_id, p.full_name, p.username, p.email
  ORDER BY COALESCE(p.full_name, p.username, p.email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mmp_coordinators(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_mmp_coordinators(uuid) IS
'Returns all coordinators with assigned sites in the given MMP file, bypassing RLS. Resolves coordinator ID from forwarded_to_user_id, additional_data.assigned_to, or accepted_by (UUID-shaped only).';

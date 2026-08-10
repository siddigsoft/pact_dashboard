-- RPC: get_mmp_names (v2 — coalesces project name when mmp_files.name is null)
-- Returns id + resolved name for every row in mmp_files, joining projects so
-- MMPs without a name column still show the linked project name.
-- Uses SECURITY DEFINER to bypass RLS entirely for super_admin resolution.
--
-- Re-run this in Supabase Dashboard → SQL Editor → New Query → Run
-- (safe to run again — uses CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.get_mmp_names(
  p_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id           uuid,
  name         text,
  project_name text,
  month        integer,
  year         integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    -- Return all MMPs, coalescing project name when mmp_files.name is null
    RETURN QUERY
      SELECT
        f.id,
        COALESCE(NULLIF(TRIM(f.name), ''), p.name, NULLIF(TRIM(f.project_name), ''),
                 CASE WHEN f.month IS NOT NULL AND f.year IS NOT NULL
                      THEN 'MMP ' || f.month || '/' || f.year ELSE NULL END)   AS name,
        COALESCE(NULLIF(TRIM(f.project_name), ''), p.name)                     AS project_name,
        f.month,
        f.year
      FROM mmp_files f
      LEFT JOIN projects p ON p.id = f.project_id
      ORDER BY f.created_at DESC
      LIMIT 500;
  ELSE
    -- Return only the requested IDs
    RETURN QUERY
      SELECT
        f.id,
        COALESCE(NULLIF(TRIM(f.name), ''), p.name, NULLIF(TRIM(f.project_name), ''),
                 CASE WHEN f.month IS NOT NULL AND f.year IS NOT NULL
                      THEN 'MMP ' || f.month || '/' || f.year ELSE NULL END)   AS name,
        COALESCE(NULLIF(TRIM(f.project_name), ''), p.name)                     AS project_name,
        f.month,
        f.year
      FROM mmp_files f
      LEFT JOIN projects p ON p.id = f.project_id
      WHERE f.id = ANY(p_ids);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mmp_names(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_mmp_names(uuid[]) IS
'Returns MMP display names (coalesced from name → project.name → project_name → month/year), bypassing RLS. Used by Super Admin Hub Claimed/Dispatched tabs.';

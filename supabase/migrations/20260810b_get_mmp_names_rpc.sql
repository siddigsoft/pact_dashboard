-- RPC: get_mmp_names
-- Returns id + name for every row in mmp_files the caller can see,
-- or (when p_ids is supplied) just the rows matching those IDs.
-- Uses SECURITY DEFINER so super_admin and all other roles can resolve
-- MMP names even if the mmp_files RLS policy is restrictive.
--
-- Apply in Supabase Dashboard → SQL Editor → New Query → Run.

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
    -- Return all MMPs (no filter)
    RETURN QUERY
      SELECT f.id, f.name, f.project_name, f.month, f.year
      FROM mmp_files f
      ORDER BY f.created_at DESC
      LIMIT 500;
  ELSE
    -- Return only the requested IDs
    RETURN QUERY
      SELECT f.id, f.name, f.project_name, f.month, f.year
      FROM mmp_files f
      WHERE f.id = ANY(p_ids);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mmp_names(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_mmp_names(uuid[]) IS
'Returns MMP file names, bypassing RLS. Pass p_ids to get specific MMPs or omit for all (up to 500). Used by Super Admin Hub to resolve MMP names in Claimed/Dispatched tables.';

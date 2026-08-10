-- RPC: get_mmp_names (v3 — coalesces mmp_id text code + project name)
-- Name resolution order: name → project.name → project_name → mmp_id (human code) → month/year
-- SECURITY DEFINER bypasses RLS entirely.
--
-- Re-run in Supabase Dashboard → SQL Editor → New Query → Run (safe, uses CREATE OR REPLACE).

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
    RETURN QUERY
      SELECT
        f.id,
        COALESCE(
          NULLIF(TRIM(f.name), ''),
          p.name,
          NULLIF(TRIM(f.project_name), ''),
          NULLIF(TRIM(f.mmp_id), ''),
          CASE WHEN f.month IS NOT NULL AND f.year IS NOT NULL
               THEN 'MMP ' || f.month || '/' || f.year ELSE NULL END
        )                                                               AS name,
        COALESCE(NULLIF(TRIM(f.project_name), ''), p.name)             AS project_name,
        f.month,
        f.year
      FROM mmp_files f
      LEFT JOIN projects p ON p.id = f.project_id
      ORDER BY f.created_at DESC
      LIMIT 500;
  ELSE
    RETURN QUERY
      SELECT
        f.id,
        COALESCE(
          NULLIF(TRIM(f.name), ''),
          p.name,
          NULLIF(TRIM(f.project_name), ''),
          NULLIF(TRIM(f.mmp_id), ''),
          CASE WHEN f.month IS NOT NULL AND f.year IS NOT NULL
               THEN 'MMP ' || f.month || '/' || f.year ELSE NULL END
        )                                                               AS name,
        COALESCE(NULLIF(TRIM(f.project_name), ''), p.name)             AS project_name,
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
'Returns MMP display names (name → project.name → project_name → mmp_id code → month/year), bypassing RLS. Used by Super Admin Hub.';

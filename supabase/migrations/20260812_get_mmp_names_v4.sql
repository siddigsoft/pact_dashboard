-- ─────────────────────────────────────────────────────────────────────────────
-- get_mmp_names v4 — swap COALESCE priority: month/year before mmp_id code
--
-- Change from v3: "Aug 2026" (month/year) now takes priority over the raw
-- mmp_id code (e.g. "MMP-041FC857").  This makes the Button Registry and all
-- MMP filter dropdowns show human-readable dates whenever month+year are set,
-- falling back to the code only when the date is genuinely missing.
--
-- Safe to re-run: uses CREATE OR REPLACE.
-- ─────────────────────────────────────────────────────────────────────────────

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
          -- ↓ month/year NOW takes priority over the raw mmp_id code
          CASE WHEN f.month IS NOT NULL AND f.year IS NOT NULL
               THEN to_char(make_date(f.year, f.month, 1), 'Mon YYYY') ELSE NULL END,
          NULLIF(TRIM(f.mmp_id), '')
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
          CASE WHEN f.month IS NOT NULL AND f.year IS NOT NULL
               THEN to_char(make_date(f.year, f.month, 1), 'Mon YYYY') ELSE NULL END,
          NULLIF(TRIM(f.mmp_id), '')
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
'v4: Returns MMP display names — priority: explicit name → project name → project_name → Mon YYYY → mmp_id code. Bypasses RLS.';

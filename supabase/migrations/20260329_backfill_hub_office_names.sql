-- Backfill existing mmp_site_entries rows to use canonical hub names.
-- Canonical names come from the hubs table (is_active = true):
--   'Dongola Hub', 'Forchana Hub', 'Kassala Hub', 'Kosti Hub', 'Country Office'
--
-- Matching rules (case-insensitive):
--   %dongola%                              → Dongola Hub
--   %forchana% | %farchana% | %forchan%   → Forchana Hub
--   %kassala%                              → Kassala Hub
--   %kosti%                                → Kosti Hub
--   %country% | ' co ' | 'co' | %(co)%    → Country Office
--
-- Rows already equal to a canonical name are untouched.

CREATE OR REPLACE FUNCTION backfill_hub_office_names()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE mmp_site_entries
  SET hub_office = CASE
    WHEN LOWER(TRIM(hub_office)) LIKE '%dongola%'
      THEN 'Dongola Hub'

    WHEN LOWER(TRIM(hub_office)) LIKE '%forchana%'
      OR LOWER(TRIM(hub_office)) LIKE '%farchana%'
      OR LOWER(TRIM(hub_office)) LIKE '%forchan%'
      THEN 'Forchana Hub'

    WHEN LOWER(TRIM(hub_office)) LIKE '%kassala%'
      THEN 'Kassala Hub'

    WHEN LOWER(TRIM(hub_office)) LIKE '%kosti%'
      THEN 'Kosti Hub'

    WHEN LOWER(TRIM(hub_office)) LIKE '%country%'
      OR TRIM(hub_office) ILIKE 'co'
      OR TRIM(hub_office) ILIKE 'co (%'
      OR TRIM(hub_office) ILIKE '%(co)%'
      OR TRIM(hub_office) ILIKE 'country office (co)'
      THEN 'Country Office'

    ELSE hub_office
  END
  WHERE hub_office IS NOT NULL
    AND TRIM(hub_office) != ''
    AND hub_office NOT IN (
      'Dongola Hub', 'Forchana Hub', 'Kassala Hub', 'Kosti Hub', 'Country Office'
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Log the operation
  RAISE NOTICE '[backfill_hub_office_names] Updated % rows', updated_count;

  RETURN jsonb_build_object(
    'success', true,
    'updated', updated_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION backfill_hub_office_names() TO authenticated;

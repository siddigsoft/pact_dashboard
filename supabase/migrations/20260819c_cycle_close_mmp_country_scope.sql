-- =============================================================================
-- Cycle Close: restore MMP country scope
-- Date: 2026-08-19
--
-- The inline exception RPC reads mmp_files.country_id to scope GL postings and
-- roll/hold targets. Older databases did not yet have that column, causing
-- "record v_mmp has no field country_id" at execution time.
--
-- Safe to re-run.
-- =============================================================================

BEGIN;

ALTER TABLE public.mmp_files
  ADD COLUMN IF NOT EXISTS country_id uuid
  REFERENCES public.countries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mmp_files_country_id
  ON public.mmp_files(country_id)
  WHERE country_id IS NOT NULL;

-- Prefer the owning project's country when an MMP is attached to a project.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'projects'
      AND column_name = 'country_id'
  ) THEN
    EXECUTE $sql$
      UPDATE public.mmp_files mmp
      SET country_id = project.country_id
      FROM public.projects project
      WHERE project.id = mmp.project_id
        AND mmp.country_id IS NULL
        AND project.country_id IS NOT NULL
    $sql$;
  END IF;
END;
$$;

-- MMPs without a project can still be unambiguously backfilled from their
-- existing advances. Do not guess where an MMP contains more than one country.
WITH single_advance_country AS (
  SELECT
    site.mmp_file_id,
    min(advance.country_id::text)::uuid AS country_id
  FROM public.mmp_site_entries site
  JOIN public.down_payment_requests advance
    ON advance.mmp_site_entry_id = site.id
  WHERE advance.country_id IS NOT NULL
  GROUP BY site.mmp_file_id
  HAVING count(DISTINCT advance.country_id) = 1
)
UPDATE public.mmp_files mmp
SET country_id = source.country_id
FROM single_advance_country source
WHERE source.mmp_file_id = mmp.id
  AND mmp.country_id IS NULL;

-- Keep future project-backed MMPs scoped at creation time.
CREATE OR REPLACE FUNCTION public.stamp_mmp_file_country_from_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.country_id IS NULL
     AND NEW.project_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'projects'
         AND column_name = 'country_id'
     )
  THEN
    EXECUTE 'SELECT country_id FROM public.projects WHERE id = $1'
      INTO NEW.country_id
      USING NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mmp_files_stamp_country ON public.mmp_files;
CREATE TRIGGER trg_mmp_files_stamp_country
  BEFORE INSERT OR UPDATE OF project_id ON public.mmp_files
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_mmp_file_country_from_project();

COMMENT ON COLUMN public.mmp_files.country_id IS
  'Country scope used by Cycle Close exception execution and target-cycle validation.';

COMMIT;
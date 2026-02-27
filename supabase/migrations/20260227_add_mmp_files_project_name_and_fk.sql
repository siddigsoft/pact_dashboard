-- Add project_name column (if missing) and ensure FK from mmp_files.project_id -> projects.id
-- Safe to run multiple times (idempotent checks)

BEGIN;

-- Add project_name column if it doesn't exist
ALTER TABLE public.mmp_files
  ADD COLUMN IF NOT EXISTS project_name text;

-- Add FK constraint if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'mmp_files_project_id_fkey'
  ) THEN
    ALTER TABLE public.mmp_files
      ADD CONSTRAINT mmp_files_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
  END IF;
END
$$;

-- Populate project_name from projects where possible (one-time update)
UPDATE public.mmp_files mf
SET project_name = p.name
FROM public.projects p
WHERE mf.project_id = p.id
  AND (mf.project_name IS NULL OR mf.project_name = '');

COMMIT;

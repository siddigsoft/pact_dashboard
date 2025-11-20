-- Migration: Add FK and index for mmp_files.project_id -> projects.id
-- Ensures PostgREST can embed projects when selecting mmp_files

BEGIN;

-- Clean up any orphaned project_id values to avoid FK creation failure
UPDATE public.mmp_files m
SET project_id = NULL
WHERE project_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = m.project_id
  );

-- Add the foreign key if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mmp_files_project_id_fkey'
  ) THEN
    ALTER TABLE public.mmp_files
      ADD CONSTRAINT mmp_files_project_id_fkey
      FOREIGN KEY (project_id)
      REFERENCES public.projects(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- Helpful index for filtering/joining
CREATE INDEX IF NOT EXISTS idx_mmp_files_project_id
  ON public.mmp_files(project_id);

COMMIT;

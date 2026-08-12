-- Track server-side ZIP extract progress for workspace archive uploads.
ALTER TABLE public.workspace_files
  ADD COLUMN IF NOT EXISTS extract_status text NULL;

COMMENT ON COLUMN public.workspace_files.extract_status IS
  'ZIP extract lifecycle: pending | extracting | done | failed | NULL (not a zip extract job)';

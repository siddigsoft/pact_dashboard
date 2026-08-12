-- Cloudflare R2 wiring: track which byte store holds each workspace file.
-- 'supabase' = existing workspace-files bucket, 'r2' = Cloudflare R2 archive bucket.
ALTER TABLE public.workspace_files
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'supabase';

ALTER TABLE public.workspace_file_versions
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'supabase';

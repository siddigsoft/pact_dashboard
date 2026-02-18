-- Migration: Add updated_at to projects and create update trigger
-- Run this in your Supabase SQL editor or via psql against the database that the app uses.

-- Add updated_at column if missing
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill updated_at for existing rows where it's null using created_at if available
UPDATE public.projects
SET updated_at = COALESCE(created_at, now())
WHERE updated_at IS NULL;

-- Ensure the trigger exists to keep updated_at current on updates
DROP TRIGGER IF EXISTS set_projects_updated_at ON public.projects;
CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Verify after running:
-- SELECT column_default, is_nullable FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='projects' AND column_name='updated_at';

-- Add archived flag to projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

-- Index for fast archive filtering
CREATE INDEX IF NOT EXISTS idx_projects_archived ON public.projects(archived);

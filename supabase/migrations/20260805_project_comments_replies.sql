-- Migration: Add reply threading to project_comments
-- Creates the table if it doesn't exist yet, then adds parent_id for one-level threading.

CREATE TABLE IF NOT EXISTS project_comments (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- parent_id: self-referencing FK for reply threads (one level deep)
ALTER TABLE project_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid
    REFERENCES project_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS project_comments_parent_id_idx
  ON project_comments(parent_id);

-- Ensure realtime is enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'project_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_comments;
  END IF;
END $$;

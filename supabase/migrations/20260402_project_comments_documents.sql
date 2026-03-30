-- Migration: Project Comments & Document Attachments
-- Adds project_comments table and project_documents table (metadata; files stored in Supabase Storage).

-- ============================================================
-- 1. project_comments
-- ============================================================
CREATE TABLE IF NOT EXISTS project_comments (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_comments_project_id_idx
  ON project_comments(project_id, created_at DESC);

ALTER TABLE project_comments ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read comments on projects they can see
CREATE POLICY "project_comments_select"
  ON project_comments FOR SELECT
  TO authenticated
  USING (true);

-- Any authenticated user can insert their own comment
CREATE POLICY "project_comments_insert"
  ON project_comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = author_id);

-- Author can delete their own comment; admins/super_admins handled at app layer via service-role
CREATE POLICY "project_comments_delete"
  ON project_comments FOR DELETE
  TO authenticated
  USING (auth.uid() = author_id);

-- ============================================================
-- 2. project_documents (metadata only; files live in Storage)
-- ============================================================
CREATE TABLE IF NOT EXISTS project_documents (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label       text NOT NULL,
  file_name   text NOT NULL,
  storage_path text NOT NULL,
  public_url  text NOT NULL,
  file_size   bigint,
  mime_type   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_documents_project_id_idx
  ON project_documents(project_id, created_at DESC);

ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_documents_select"
  ON project_documents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "project_documents_insert"
  ON project_documents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = uploader_id);

CREATE POLICY "project_documents_delete"
  ON project_documents FOR DELETE
  TO authenticated
  USING (auth.uid() = uploader_id);

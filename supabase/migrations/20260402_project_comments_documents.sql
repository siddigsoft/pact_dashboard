-- Migration: Project Comments & Document Attachments
-- Adds project_comments and project_documents tables with proper RLS.
-- Team membership is determined by: projects.team->'teamComposition' contains the user's profile id.
-- Admin roles allowed to delete any row: super_admin, admin, fom (stored in profiles.role).

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

-- SELECT: team members of the project can read comments
-- Team membership = user's profile id appears in team->teamComposition array,
-- OR user is a project manager (team->projectManagerId matches),
-- OR user is an admin/super_admin/fom.
CREATE POLICY "project_comments_select"
  ON project_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_comments.project_id
        AND (
          -- admin / super_admin / fom can always read
          EXISTS (
            SELECT 1 FROM profiles pr
            WHERE pr.id = auth.uid()
              AND pr.role IN ('super_admin', 'admin', 'fom')
          )
          -- team member (JSONB array contains the user's id)
          OR p.team->'teamComposition' @> jsonb_build_array(jsonb_build_object('userId', auth.uid()::text))
          -- project manager by id stored as text
          OR (p.team->>'projectManagerId') = auth.uid()::text
        )
    )
  );

-- INSERT: any authenticated team member/admin can insert their own comment
CREATE POLICY "project_comments_insert"
  ON project_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_comments.project_id
        AND (
          EXISTS (
            SELECT 1 FROM profiles pr
            WHERE pr.id = auth.uid()
              AND pr.role IN ('super_admin', 'admin', 'fom')
          )
          OR p.team->'teamComposition' @> jsonb_build_array(jsonb_build_object('userId', auth.uid()::text))
          OR (p.team->>'projectManagerId') = auth.uid()::text
        )
    )
  );

-- DELETE: author can delete their own, OR admin/super_admin/fom can delete any
CREATE POLICY "project_comments_delete"
  ON project_comments FOR DELETE
  TO authenticated
  USING (
    auth.uid() = author_id
    OR EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role IN ('super_admin', 'admin', 'fom')
    )
  );

-- ============================================================
-- 2. project_documents (metadata only; files live in Storage)
-- ============================================================
CREATE TABLE IF NOT EXISTS project_documents (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploader_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label        text NOT NULL,
  file_name    text NOT NULL,
  storage_path text NOT NULL,
  public_url   text NOT NULL,
  file_size    bigint,
  mime_type    text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_documents_project_id_idx
  ON project_documents(project_id, created_at DESC);

ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

-- SELECT: team members / admins
CREATE POLICY "project_documents_select"
  ON project_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_documents.project_id
        AND (
          EXISTS (
            SELECT 1 FROM profiles pr
            WHERE pr.id = auth.uid()
              AND pr.role IN ('super_admin', 'admin', 'fom')
          )
          OR p.team->'teamComposition' @> jsonb_build_array(jsonb_build_object('userId', auth.uid()::text))
          OR (p.team->>'projectManagerId') = auth.uid()::text
        )
    )
  );

-- INSERT: team member/admin inserting as themselves
CREATE POLICY "project_documents_insert"
  ON project_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = uploader_id
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_documents.project_id
        AND (
          EXISTS (
            SELECT 1 FROM profiles pr
            WHERE pr.id = auth.uid()
              AND pr.role IN ('super_admin', 'admin', 'fom')
          )
          OR p.team->'teamComposition' @> jsonb_build_array(jsonb_build_object('userId', auth.uid()::text))
          OR (p.team->>'projectManagerId') = auth.uid()::text
        )
    )
  );

-- DELETE: uploader can delete their own, OR admin/super_admin/fom can delete any
CREATE POLICY "project_documents_delete"
  ON project_documents FOR DELETE
  TO authenticated
  USING (
    auth.uid() = uploader_id
    OR EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role IN ('super_admin', 'admin', 'fom')
    )
  );

-- ============================================================
-- 3. Enable Realtime for project_comments
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'project_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_comments;
  END IF;
END $$;

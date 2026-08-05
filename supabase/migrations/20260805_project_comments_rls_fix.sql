-- Migration: Fix missing RLS policies for project_comments
-- Drops and recreates all three policies idempotently so they are applied
-- even if the original migration (20260402_project_comments_documents.sql)
-- was run before RLS was enabled or partially failed.

ALTER TABLE project_comments ENABLE ROW LEVEL SECURITY;

-- ── SELECT ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "project_comments_select" ON project_comments;

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

-- ── INSERT ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "project_comments_insert" ON project_comments;

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

-- ── DELETE ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "project_comments_delete" ON project_comments;

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

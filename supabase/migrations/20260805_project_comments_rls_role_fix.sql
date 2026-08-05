-- Fix project_comments RLS role matching.
-- profiles.role uses camelCase (e.g. superAdmin), but earlier policies
-- checked snake_case (super_admin), so Super Admins failed INSERT.

ALTER TABLE project_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_comments_select" ON project_comments;
CREATE POLICY "project_comments_select"
  ON project_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_comments.project_id
        AND (
          EXISTS (
            SELECT 1 FROM profiles pr
            WHERE pr.id = auth.uid()
              AND lower(replace(pr.role, '_', '')) IN (
                'superadmin', 'admin', 'fom', 'countrydirector'
              )
          )
          OR p.team->'teamComposition' @> jsonb_build_array(jsonb_build_object('userId', auth.uid()::text))
          OR (p.team->>'projectManagerId') = auth.uid()::text
        )
    )
  );

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
              AND lower(replace(pr.role, '_', '')) IN (
                'superadmin', 'admin', 'fom', 'countrydirector'
              )
          )
          OR p.team->'teamComposition' @> jsonb_build_array(jsonb_build_object('userId', auth.uid()::text))
          OR (p.team->>'projectManagerId') = auth.uid()::text
        )
    )
  );

DROP POLICY IF EXISTS "project_comments_delete" ON project_comments;
CREATE POLICY "project_comments_delete"
  ON project_comments FOR DELETE
  TO authenticated
  USING (
    auth.uid() = author_id
    OR EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND lower(replace(pr.role, '_', '')) IN (
          'superadmin', 'admin', 'fom', 'countrydirector'
        )
    )
  );

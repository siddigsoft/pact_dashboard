-- File attachments for project field tasks
CREATE TABLE IF NOT EXISTS project_field_task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES project_field_tasks(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pfta_task_id ON project_field_task_attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_pfta_project_id ON project_field_task_attachments(project_id);

ALTER TABLE project_field_task_attachments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'project_field_task_attachments' AND policyname = 'allow_all_authenticated'
  ) THEN
    CREATE POLICY allow_all_authenticated ON project_field_task_attachments
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE project_field_task_attachments IS
  'Files uploaded to project field tasks; stored in project-attachments bucket under field-tasks/{projectId}/{taskId}/';

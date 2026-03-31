-- Per-task discussion threads for Field Tasks
CREATE TABLE IF NOT EXISTS field_task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES project_field_tasks(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  author_name text NOT NULL DEFAULT 'Unknown',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ftc_task_id ON field_task_comments(task_id);

ALTER TABLE field_task_comments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'field_task_comments' AND policyname = 'allow_all_authenticated'
  ) THEN
    CREATE POLICY allow_all_authenticated ON field_task_comments
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

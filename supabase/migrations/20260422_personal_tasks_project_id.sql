-- Link personal_tasks to projects (nullable; only used when task type = project)
ALTER TABLE personal_tasks
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_personal_tasks_project_id ON personal_tasks(project_id);

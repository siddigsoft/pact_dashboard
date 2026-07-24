-- Add co_assignee_ids to project_field_tasks for multi-assignee support
-- The primary assignee remains in `assigned_to`; additional assignees go here.
ALTER TABLE project_field_tasks
  ADD COLUMN IF NOT EXISTS co_assignee_ids uuid[] DEFAULT '{}';

-- Index for fast "tasks where I am a co-assignee" queries
CREATE INDEX IF NOT EXISTS idx_project_field_tasks_co_assignee_ids
  ON project_field_tasks USING GIN (co_assignee_ids);

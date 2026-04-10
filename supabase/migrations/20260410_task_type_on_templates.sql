-- Add task_type column to daily_task_definitions for template filtering
ALTER TABLE daily_task_definitions
  ADD COLUMN IF NOT EXISTS task_type TEXT CHECK (task_type IN ('project', 'day_to_day', 'general')) DEFAULT NULL;

COMMENT ON COLUMN daily_task_definitions.task_type IS 'Template task type: project, day_to_day, or general (null = all)';

-- Add time tracking fields to personal_tasks
ALTER TABLE public.personal_tasks
  ADD COLUMN IF NOT EXISTS estimated_hours numeric(6,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS actual_hours    numeric(6,2) DEFAULT NULL;

COMMENT ON COLUMN public.personal_tasks.estimated_hours IS 'Planned effort in hours for this task';
COMMENT ON COLUMN public.personal_tasks.actual_hours    IS 'Actual hours spent on this task (filled in by the assignee)';

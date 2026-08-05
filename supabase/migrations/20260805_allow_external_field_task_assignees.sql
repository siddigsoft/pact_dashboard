-- Allow assigning project external team members (synthetic UUIDs not in profiles).
-- Display name is stored in assigned_to_name; profile join is resolved client-side.
ALTER TABLE public.project_field_tasks
  DROP CONSTRAINT IF EXISTS project_field_tasks_assigned_to_fkey;

CREATE INDEX IF NOT EXISTS idx_project_field_tasks_assigned_to
  ON public.project_field_tasks (assigned_to);

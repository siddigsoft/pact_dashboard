-- Add acknowledgment tracking to personal_tasks.
-- The assignee can explicitly "acknowledge" they've seen a newly-assigned task,
-- which records who saw it and when, and (optionally) auto-advances status.

ALTER TABLE public.personal_tasks
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_personal_tasks_acknowledged_at
  ON public.personal_tasks(acknowledged_at)
  WHERE acknowledged_at IS NULL;

COMMENT ON COLUMN public.personal_tasks.acknowledged_at IS
  'When the assignee first opened/acknowledged this task. NULL = unseen.';
COMMENT ON COLUMN public.personal_tasks.acknowledged_by IS
  'User who acknowledged the task (usually the assignee).';

-- Add started_at / completed_at to personal_tasks for auto time-tracking
ALTER TABLE public.personal_tasks
  ADD COLUMN IF NOT EXISTS started_at   timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.personal_tasks.started_at   IS 'Timestamp auto-set when task status changes to inprogress';
COMMENT ON COLUMN public.personal_tasks.completed_at IS 'Timestamp auto-set when task status changes to done';

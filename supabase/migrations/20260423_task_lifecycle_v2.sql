-- Task Lifecycle v2: Acknowledge → Start (with estimates + dependencies) → Locked → Output
-- Builds on 20260422_personal_tasks_acknowledgment.sql (acknowledged_at / acknowledged_by)
-- and 20260422_personal_tasks_status_timestamps.sql (on_hold_at / rescheduled_at / cancelled_at).

ALTER TABLE public.personal_tasks
  ADD COLUMN IF NOT EXISTS start_estimated_days INTEGER,
  ADD COLUMN IF NOT EXISTS start_requirements   TEXT,
  ADD COLUMN IF NOT EXISTS start_dependencies   JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS output_text          TEXT;

COMMENT ON COLUMN public.personal_tasks.start_estimated_days IS
  'How many days the assignee committed to when clicking Start.';
COMMENT ON COLUMN public.personal_tasks.start_requirements IS
  'Free-text requirements the assignee said they need to complete the task.';
COMMENT ON COLUMN public.personal_tasks.start_dependencies IS
  'JSON array of {label, kind, userId?, deptId?, confirmed, confirmed_at, confirmed_by, confirmed_by_name} captured at Start. Each named owner can flip confirmed=true.';
COMMENT ON COLUMN public.personal_tasks.output_text IS
  'What the assignee actually accomplished. Editable after the task is started.';

-- Helper index so admin queries for "needs ack" / "needs start" are cheap.
CREATE INDEX IF NOT EXISTS idx_personal_tasks_started_at
  ON public.personal_tasks(started_at)
  WHERE started_at IS NULL;

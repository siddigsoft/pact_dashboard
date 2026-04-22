-- Add the missing status-transition timestamp columns that the app already writes.
-- Without these, any status change to On Hold / Rescheduled / Cancelled fails
-- with "column does not exist" and surfaces as a generic "Failed to save task".

ALTER TABLE public.personal_tasks
  ADD COLUMN IF NOT EXISTS on_hold_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rescheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at   TIMESTAMPTZ;

COMMENT ON COLUMN public.personal_tasks.on_hold_at     IS 'Timestamp auto-set when status changes to on_hold';
COMMENT ON COLUMN public.personal_tasks.rescheduled_at IS 'Timestamp auto-set when status changes to rescheduled';
COMMENT ON COLUMN public.personal_tasks.cancelled_at   IS 'Timestamp auto-set when status changes to cancelled';

-- Task date-range + per-day hours allocation
-- Adds planned start_date and hours_per_day so a task can span multiple days
-- (Outlook-calendar style) and the Calendar/Timeline can render it as a band.

ALTER TABLE personal_tasks
  ADD COLUMN IF NOT EXISTS start_date    DATE,
  ADD COLUMN IF NOT EXISTS hours_per_day NUMERIC(5,2);

CREATE INDEX IF NOT EXISTS idx_personal_tasks_date_span
  ON personal_tasks (start_date, due_date)
  WHERE start_date IS NOT NULL;

COMMENT ON COLUMN personal_tasks.start_date    IS 'Planned start date — when work should begin. Range = [start_date, due_date].';
COMMENT ON COLUMN personal_tasks.hours_per_day IS 'Estimated hours allocated per day across the start..due range.';

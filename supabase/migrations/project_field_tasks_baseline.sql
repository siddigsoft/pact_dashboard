-- Idempotent — safe to run multiple times.
-- Adds baseline columns to project_field_tasks so planners can capture original
-- planned values and compare against current values (schedule / hours / cost slippage).

ALTER TABLE public.project_field_tasks
  ADD COLUMN IF NOT EXISTS baseline_start   date,
  ADD COLUMN IF NOT EXISTS baseline_due     date,
  ADD COLUMN IF NOT EXISTS baseline_hours   numeric,
  ADD COLUMN IF NOT EXISTS baseline_cost    numeric,
  ADD COLUMN IF NOT EXISTS baseline_set_at  timestamptz;

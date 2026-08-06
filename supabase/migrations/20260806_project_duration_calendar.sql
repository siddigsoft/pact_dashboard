-- Project Duration & Calendar: adds scheduling fields to checklist items,
-- stage assignees, and projects so PACT can track MS-Project-style durations.

-- ── Checklist item scheduling ──────────────────────────────────────────────
ALTER TABLE public.project_stage_checklist
  ADD COLUMN IF NOT EXISTS planned_start date,
  ADD COLUMN IF NOT EXISTS planned_end   date;

-- ── Stage assignee work period ─────────────────────────────────────────────
ALTER TABLE public.project_stage_assignees
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date   date;

-- ── Project working calendar ───────────────────────────────────────────────
-- working_days: array of JS day-of-week integers (0=Sun … 6=Sat)
--   Default Mon–Fri = {1,2,3,4,5}
-- calendar_exceptions: JSON array of ISO date strings (additional holidays/
--   non-working days beyond the weekly pattern)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS working_days          integer[] DEFAULT ARRAY[1,2,3,4,5],
  ADD COLUMN IF NOT EXISTS calendar_exceptions   jsonb     DEFAULT '[]'::jsonb;

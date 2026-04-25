-- ============================================================================
-- Add hourly_rate to employee_salary_config
-- ============================================================================
-- Why: PayrollAdmin > Salary Configuration save was failing with
--   "Could not find the 'hourly_rate' column of 'employee_salary_config' in the schema cache"
-- Root cause: the timesheet module migration (20260409_timesheet_module.sql)
-- adds this column, but it was never applied in pactdb. This file is a
-- focused, idempotent extract — safe to paste even if the rest of the
-- timesheet module is already applied.
--
-- Pure additive, nullable column. No defaults, no backfill, no PK changes.
-- ============================================================================

ALTER TABLE public.employee_salary_config
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(10,2);

COMMENT ON COLUMN public.employee_salary_config.hourly_rate IS
  'Optional hourly rate (in the same currency as base_salary). Used by
   PayrollAdmin to compute pay for hourly-employment-type workers from
   approved timesheet hours.';

-- Tell PostgREST to reload its schema cache so the new column is visible
-- to the REST API immediately (no Supabase restart required).
NOTIFY pgrst, 'reload schema';

-- Verify (read-only) — should return one row with data_type = 'numeric'
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'employee_salary_config'
  AND column_name = 'hourly_rate';

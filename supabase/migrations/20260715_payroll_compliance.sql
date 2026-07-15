-- ============================================================================
-- Task #86 — Payroll Compliance: Bands, Pre-run Checks & Automation
-- ----------------------------------------------------------------------------
-- 1. hr_compensation_grades  — grade/band master
-- 2. grade_id FK on positions + employee_salary_config
-- 3. hr_payroll_leave_flags  — unpaid leave → payroll deduction queue
-- 4. hr_salary_increment_log — audit log for nightly edge function
-- All sections are idempotent (IF NOT EXISTS / DO $$ EXCEPTION).
-- ============================================================================


-- ── 1. Compensation Grades (Band Master) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_compensation_grades (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,              -- e.g. 'G1', 'G2', 'P3'
  title           text NOT NULL,                     -- e.g. 'Field Officer', 'Manager'
  min_salary      numeric(14,2) NOT NULL,
  midpoint_salary numeric(14,2) NOT NULL,
  max_salary      numeric(14,2) NOT NULL,
  currency        text NOT NULL DEFAULT 'SDG',
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_hcg_active ON public.hr_compensation_grades(is_active);

ALTER TABLE public.hr_compensation_grades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hcg_read ON public.hr_compensation_grades;
CREATE POLICY hcg_read ON public.hr_compensation_grades FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS hcg_write ON public.hr_compensation_grades;
CREATE POLICY hcg_write ON public.hr_compensation_grades FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles WHERE id = auth.uid()
  AND lower(role) IN ('super_admin','superadmin','admin','hr','finance')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.profiles WHERE id = auth.uid()
  AND lower(role) IN ('super_admin','superadmin','admin','hr','finance')
));


-- ── 2. grade_id FK on positions ──────────────────────────────────────────────

ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS grade_id uuid REFERENCES public.hr_compensation_grades(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_positions_grade ON public.positions(grade_id);


-- ── 3. grade_id FK on employee_salary_config ─────────────────────────────────

ALTER TABLE public.employee_salary_config
  ADD COLUMN IF NOT EXISTS grade_id uuid REFERENCES public.hr_compensation_grades(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_esc_grade ON public.employee_salary_config(grade_id);


-- ── 4. hr_payroll_leave_flags — unpaid-leave deduction queue ─────────────────
-- Inserted when an unpaid leave request is fully approved.
-- PayrollAdmin pre-run diff reads these to show planned deductions.
-- 'applied' flips to true once the payroll run saves the deduction line.

CREATE TABLE IF NOT EXISTS public.hr_payroll_leave_flags (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id uuid REFERENCES public.leave_requests(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL,
  start_date       date NOT NULL,
  end_date         date NOT NULL,
  days_count       numeric(6,2) NOT NULL DEFAULT 0,
  daily_rate       numeric(14,2),               -- base_salary / 30 at time of approval
  deduction_amount numeric(14,2),               -- days_count * daily_rate
  pay_period       text,                        -- 'MMMM yyyy' label matching payroll_runs.period_label
  applied          boolean NOT NULL DEFAULT false,
  applied_at       timestamptz,
  applied_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hplf_user    ON public.hr_payroll_leave_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_hplf_period  ON public.hr_payroll_leave_flags(pay_period);
CREATE INDEX IF NOT EXISTS idx_hplf_applied ON public.hr_payroll_leave_flags(applied);

ALTER TABLE public.hr_payroll_leave_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hplf_read ON public.hr_payroll_leave_flags;
CREATE POLICY hplf_read ON public.hr_payroll_leave_flags FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
             AND lower(role) IN ('super_admin','superadmin','admin','finance','hr'))
);

DROP POLICY IF EXISTS hplf_write ON public.hr_payroll_leave_flags;
CREATE POLICY hplf_write ON public.hr_payroll_leave_flags FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles WHERE id = auth.uid()
  AND lower(role) IN ('super_admin','superadmin','admin','finance','hr')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.profiles WHERE id = auth.uid()
  AND lower(role) IN ('super_admin','superadmin','admin','finance','hr')
));


-- ── 5. hr_salary_increment_log — nightly edge function audit ─────────────────

CREATE TABLE IF NOT EXISTS public.hr_salary_increment_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at         timestamptz NOT NULL DEFAULT now(),
  applied_count  int NOT NULL DEFAULT 0,
  skipped_count  int NOT NULL DEFAULT 0,
  error_count    int NOT NULL DEFAULT 0,
  details        jsonb
);

CREATE INDEX IF NOT EXISTS idx_hsil_run_at ON public.hr_salary_increment_log(run_at DESC);

ALTER TABLE public.hr_salary_increment_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hsil_read ON public.hr_salary_increment_log;
CREATE POLICY hsil_read ON public.hr_salary_increment_log FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
          AND lower(role) IN ('super_admin','superadmin','admin','hr','finance'))
);

COMMENT ON TABLE public.hr_salary_increment_log IS
'Task #86: Audit log for the hr-salary-increment-apply nightly Edge Function. One row per nightly run.';
COMMENT ON TABLE public.hr_payroll_leave_flags IS
'Task #86: Queue of unpaid-leave deductions to be applied in the next payroll run. Inserted by the LeaveRequests approval flow.';
COMMENT ON TABLE public.hr_compensation_grades IS
'Task #86: Salary grade/band master table. Positions and employee_salary_config both carry a grade_id FK.';

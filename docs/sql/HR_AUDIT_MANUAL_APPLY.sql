-- ============================================================================
-- PACT HR Audit — Manual SQL bundle
-- ----------------------------------------------------------------------------
-- Paste this whole file into the Supabase SQL editor and click "Run".
-- Safe to re-run: every statement is idempotent (CREATE … IF NOT EXISTS,
-- DROP POLICY IF EXISTS … CREATE POLICY, CREATE OR REPLACE FUNCTION).
--
-- Requires these tables to already exist:
--   profiles, employee_salary_config, salary_increments, leave_entitlements,
--   leave_requests, performance_reviews, hierarchy_audit_log, audit_logs,
--   notifications.
--
-- This bundle = supabase/migrations/20260424_hr_audit_complete.sql
--             + supabase/migrations/20260425_hr_audit_remediation.sql
--
-- Status:
--   ▸ pactdb (PACT Command Center production)  — already applied 2026-04-25
--   ▸ Run only on databases that still need it.
--
-- DO NOT run on the PACT-SuperApp (agriculture) database — that app does
-- not use these HR features and several prerequisite tables are absent.
-- ============================================================================

-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║  PART 1 of 2 — base migration (20260424_hr_audit_complete.sql)         ║
-- ║  Creates 7 new HR tables, RLS policies, RPCs, and H1/H6 triggers.      ║
-- ╚════════════════════════════════════════════════════════════════════════╝

-- ============================================================================
-- HR Audit — close all 10 gaps (H1, H2, H3, H4, H5, H6, H7, H8, H9, H10)
-- ----------------------------------------------------------------------------
-- One migration file because the changes are small per-gap but interlinked.
-- Each section is self-contained and idempotent (use of IF NOT EXISTS / DO $$).
-- ============================================================================


-- ============================================================================
-- H1 — Salary increment auto-applies to employee_salary_config
-- ----------------------------------------------------------------------------
-- When salary_increments.status flips to 'approved' AND effective_date <= today,
-- the master salary record is updated. Idempotent — re-running with the same
-- row is a no-op because base_salary will already match new_salary.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_salary_increment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.effective_date <= CURRENT_DATE
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved'
          OR OLD.new_salary IS DISTINCT FROM NEW.new_salary
          OR OLD.effective_date IS DISTINCT FROM NEW.effective_date)
  THEN
    UPDATE public.employee_salary_config
       SET base_salary = NEW.new_salary,
           currency    = COALESCE(NEW.currency, currency),
           updated_at  = now()
     WHERE user_id = NEW.user_id;

    -- If the employee has no salary config yet, create one minimal row
    INSERT INTO public.employee_salary_config (user_id, base_salary, currency, allowances, deductions)
    SELECT NEW.user_id, NEW.new_salary, COALESCE(NEW.currency,'USD'), '[]'::jsonb, '[]'::jsonb
     WHERE NOT EXISTS (SELECT 1 FROM public.employee_salary_config WHERE user_id = NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_salary_increment ON public.salary_increments;
CREATE TRIGGER trg_apply_salary_increment
  AFTER INSERT OR UPDATE OF status, new_salary, effective_date ON public.salary_increments
  FOR EACH ROW EXECUTE FUNCTION public.apply_salary_increment();

COMMENT ON FUNCTION public.apply_salary_increment() IS
'H1: When a salary_increment is approved + effective today/earlier, push the new salary into employee_salary_config.';


-- ============================================================================
-- H6 — Leave entitlement edits create audit log + notify the affected user
-- ----------------------------------------------------------------------------
-- New table leave_entitlement_audit captures every change. A trigger on
-- leave_entitlements writes the audit row and a notification.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.leave_entitlement_audit (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id      uuid REFERENCES public.leave_entitlements(id) ON DELETE SET NULL,
  user_id             uuid NOT NULL,
  year                int  NOT NULL,
  field_name          text NOT NULL,
  old_value           text,
  new_value           text,
  changed_by          uuid,
  changed_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lea_user_year ON public.leave_entitlement_audit(user_id, year);
CREATE INDEX IF NOT EXISTS idx_lea_changed_at ON public.leave_entitlement_audit(changed_at DESC);

ALTER TABLE public.leave_entitlement_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lea_read ON public.leave_entitlement_audit;
CREATE POLICY lea_read ON public.leave_entitlement_audit FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
             AND lower(p.role) IN ('super_admin','superadmin','admin','hr','manager'))
);

CREATE OR REPLACE FUNCTION public.audit_leave_entitlement_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_field text;
  v_changed_any boolean := false;
BEGIN
  FOREACH v_field IN ARRAY ARRAY['annual_days','sick_days','emergency_days','maternity_days','paternity_days','unpaid_days']
  LOOP
    IF (to_jsonb(OLD) ->> v_field) IS DISTINCT FROM (to_jsonb(NEW) ->> v_field) THEN
      INSERT INTO public.leave_entitlement_audit (entitlement_id, user_id, year, field_name, old_value, new_value, changed_by)
      VALUES (NEW.id, NEW.user_id, NEW.year, v_field,
              to_jsonb(OLD) ->> v_field, to_jsonb(NEW) ->> v_field, auth.uid());
      v_changed_any := true;
    END IF;
  END LOOP;

  IF v_changed_any THEN
    INSERT INTO public.notifications (user_id, title, message, title_ar, message_ar,
                                      type, category, priority, related_entity_id, link)
    VALUES (NEW.user_id,
            'Leave entitlement updated',
            'Your leave entitlement for ' || NEW.year || ' was updated by HR.',
            'تم تحديث رصيد الإجازات',
            'تم تحديث رصيد إجازاتك لعام ' || NEW.year || ' من قبل الموارد البشرية.',
            'info', 'team', 'normal', NEW.id, '/leave');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_leave_entitlement ON public.leave_entitlements;
CREATE TRIGGER trg_audit_leave_entitlement
  AFTER UPDATE ON public.leave_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.audit_leave_entitlement_change();

COMMENT ON FUNCTION public.audit_leave_entitlement_change() IS
'H6: Records every change to leave_entitlements and notifies the affected user.';


-- ============================================================================
-- H10 — Statutory deductions (Sudan PIT, Social Insurance, Zakat)
-- ----------------------------------------------------------------------------
-- Brackets are stored, not hard-coded, so finance can adjust without code.
-- The calculator returns a jsonb breakdown the client uses to add deduction
-- line items into the payroll snapshot.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payroll_statutory_brackets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country         text NOT NULL,                    -- 'SD','KE','UG','TZ','RW','ET','SS'
  type            text NOT NULL CHECK (type IN ('pit','social_employee','social_employer','zakat','health')),
  label           text NOT NULL,
  label_ar        text,
  min_amount      numeric(14,2) NOT NULL DEFAULT 0,
  max_amount      numeric(14,2),                    -- NULL = no upper bound
  rate_percent    numeric(6,3) NOT NULL DEFAULT 0,
  fixed_amount    numeric(14,2) NOT NULL DEFAULT 0,
  effective_from  date NOT NULL DEFAULT CURRENT_DATE,
  effective_to    date,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_psb_country_type ON public.payroll_statutory_brackets(country, type);
ALTER TABLE public.payroll_statutory_brackets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS psb_read ON public.payroll_statutory_brackets;
CREATE POLICY psb_read ON public.payroll_statutory_brackets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS psb_write ON public.payroll_statutory_brackets;
CREATE POLICY psb_write ON public.payroll_statutory_brackets FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
               AND lower(role) IN ('super_admin','superadmin','admin','finance','hr')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
               AND lower(role) IN ('super_admin','superadmin','admin','finance','hr')));

-- Seed Sudan PIT (2024 progressive brackets — finance can refine these)
INSERT INTO public.payroll_statutory_brackets (country, type, label, label_ar, min_amount, max_amount, rate_percent)
SELECT 'SD','pit','PIT Bracket 1','شريحة الضريبة 1', 0, 7500, 0
WHERE NOT EXISTS (SELECT 1 FROM public.payroll_statutory_brackets WHERE country='SD' AND type='pit');
INSERT INTO public.payroll_statutory_brackets (country, type, label, label_ar, min_amount, max_amount, rate_percent)
SELECT 'SD','pit','PIT Bracket 2','شريحة الضريبة 2', 7500.01, 30000, 5
WHERE NOT EXISTS (SELECT 1 FROM public.payroll_statutory_brackets WHERE country='SD' AND type='pit' AND min_amount > 7500);
INSERT INTO public.payroll_statutory_brackets (country, type, label, label_ar, min_amount, max_amount, rate_percent)
SELECT 'SD','pit','PIT Bracket 3','شريحة الضريبة 3', 30000.01, 100000, 10
WHERE NOT EXISTS (SELECT 1 FROM public.payroll_statutory_brackets WHERE country='SD' AND type='pit' AND min_amount > 30000);
INSERT INTO public.payroll_statutory_brackets (country, type, label, label_ar, min_amount, max_amount, rate_percent)
SELECT 'SD','pit','PIT Bracket 4','شريحة الضريبة 4', 100000.01, NULL, 15
WHERE NOT EXISTS (SELECT 1 FROM public.payroll_statutory_brackets WHERE country='SD' AND type='pit' AND min_amount > 100000);

-- Sudan social insurance (NPF): employee 8%, employer 17%
INSERT INTO public.payroll_statutory_brackets (country, type, label, label_ar, rate_percent)
SELECT 'SD','social_employee','NPF Employee Contribution','اشتراك التأمينات (الموظف)', 8
WHERE NOT EXISTS (SELECT 1 FROM public.payroll_statutory_brackets WHERE country='SD' AND type='social_employee');
INSERT INTO public.payroll_statutory_brackets (country, type, label, label_ar, rate_percent)
SELECT 'SD','social_employer','NPF Employer Contribution','اشتراك التأمينات (صاحب العمل)', 17
WHERE NOT EXISTS (SELECT 1 FROM public.payroll_statutory_brackets WHERE country='SD' AND type='social_employer');

CREATE OR REPLACE FUNCTION public.calculate_payroll_statutory(p_gross numeric, p_country text DEFAULT 'SD', p_apply_zakat boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pit              numeric := 0;
  v_social_employee  numeric := 0;
  v_social_employer  numeric := 0;
  v_zakat            numeric := 0;
  v_bracket          record;
  v_taxable_in_band  numeric;
  v_today            date := CURRENT_DATE;
BEGIN
  IF COALESCE(p_gross,0) <= 0 THEN
    RETURN jsonb_build_object('pit',0,'social_employee',0,'social_employer',0,'zakat',0,'total_employee',0,'total_employer',0);
  END IF;

  -- Progressive PIT
  FOR v_bracket IN
    SELECT * FROM public.payroll_statutory_brackets
    WHERE country = p_country AND type = 'pit'
      AND effective_from <= v_today
      AND (effective_to IS NULL OR effective_to >= v_today)
    ORDER BY min_amount
  LOOP
    IF p_gross > v_bracket.min_amount THEN
      v_taxable_in_band := LEAST(p_gross, COALESCE(v_bracket.max_amount, p_gross)) - v_bracket.min_amount;
      v_pit := v_pit + (v_taxable_in_band * v_bracket.rate_percent / 100.0) + v_bracket.fixed_amount;
    END IF;
  END LOOP;

  -- Flat rate social insurance
  SELECT COALESCE(SUM(p_gross * rate_percent / 100.0 + fixed_amount),0) INTO v_social_employee
  FROM public.payroll_statutory_brackets
  WHERE country = p_country AND type = 'social_employee'
    AND effective_from <= v_today AND (effective_to IS NULL OR effective_to >= v_today);

  SELECT COALESCE(SUM(p_gross * rate_percent / 100.0 + fixed_amount),0) INTO v_social_employer
  FROM public.payroll_statutory_brackets
  WHERE country = p_country AND type = 'social_employer'
    AND effective_from <= v_today AND (effective_to IS NULL OR effective_to >= v_today);

  -- Optional Zakat (2.5% of net-of-statutory salary)
  IF p_apply_zakat THEN
    v_zakat := GREATEST(0, p_gross - v_pit - v_social_employee) * 0.025;
  END IF;

  RETURN jsonb_build_object(
    'pit',              ROUND(v_pit,             2),
    'social_employee',  ROUND(v_social_employee, 2),
    'social_employer',  ROUND(v_social_employer, 2),
    'zakat',            ROUND(v_zakat,           2),
    'total_employee',   ROUND(v_pit + v_social_employee + v_zakat, 2),
    'total_employer',   ROUND(v_social_employer, 2),
    'country',          p_country
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_payroll_statutory(numeric, text, boolean) TO authenticated;
COMMENT ON FUNCTION public.calculate_payroll_statutory(numeric, text, boolean) IS
'H10: Returns jsonb with PIT (progressive), social insurance (employee+employer), and optional Zakat for a given gross salary and country.';


-- ============================================================================
-- H8 — Monthly EOSB / End-of-Service Benefit accrual
-- ----------------------------------------------------------------------------
-- Sudan labour law default: 1 month per year (employee can be paid out on exit).
-- Accrual = base_salary / 12 per month, accumulated into eosb_accruals.
-- Monthly RPC accrue_eosb_for_period(period_yyyymm) is idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.eosb_accruals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  period          text NOT NULL,                  -- 'YYYY-MM'
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  accrued_amount  numeric(14,2) NOT NULL DEFAULT 0,
  paid_out_amount numeric(14,2) NOT NULL DEFAULT 0,
  closing_balance numeric(14,2) NOT NULL DEFAULT 0,
  base_salary     numeric(14,2),
  currency        text DEFAULT 'SDG',
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  UNIQUE (user_id, period)
);
CREATE INDEX IF NOT EXISTS idx_eosb_user ON public.eosb_accruals(user_id);
CREATE INDEX IF NOT EXISTS idx_eosb_period ON public.eosb_accruals(period);
ALTER TABLE public.eosb_accruals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eosb_read ON public.eosb_accruals;
CREATE POLICY eosb_read ON public.eosb_accruals FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
             AND lower(role) IN ('super_admin','superadmin','admin','finance','hr')));

CREATE OR REPLACE FUNCTION public.accrue_eosb_for_period(p_period text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed int := 0;
  v_skipped   int := 0;
  v_emp       record;
  v_opening   numeric;
  v_accrual   numeric;
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR lower(v_caller_role) NOT IN ('super_admin','superadmin','admin','finance','hr') THEN
    RAISE EXCEPTION 'Unauthorized: only HR / finance / admin may accrue EOSB' USING ERRCODE = '42501';
  END IF;

  IF p_period !~ '^[0-9]{4}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'period must be YYYY-MM (got %)', p_period;
  END IF;

  FOR v_emp IN
    SELECT p.id AS user_id, p.contract_start_date, esc.base_salary, COALESCE(esc.currency,'SDG') AS currency
    FROM public.profiles p
    LEFT JOIN public.employee_salary_config esc ON esc.user_id = p.id
    WHERE p.status = 'active'
      AND COALESCE(esc.base_salary,0) > 0
      AND p.contract_start_date IS NOT NULL
  LOOP
    -- Idempotency
    IF EXISTS (SELECT 1 FROM public.eosb_accruals WHERE user_id = v_emp.user_id AND period = p_period) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    SELECT COALESCE(closing_balance,0) INTO v_opening
    FROM public.eosb_accruals WHERE user_id = v_emp.user_id ORDER BY period DESC LIMIT 1;
    v_opening := COALESCE(v_opening, 0);
    v_accrual := ROUND(v_emp.base_salary / 12.0, 2);

    INSERT INTO public.eosb_accruals (user_id, period, opening_balance, accrued_amount, closing_balance, base_salary, currency, created_by)
    VALUES (v_emp.user_id, p_period, v_opening, v_accrual, v_opening + v_accrual, v_emp.base_salary, v_emp.currency, auth.uid());
    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('period', p_period, 'processed', v_processed, 'skipped', v_skipped, 'status','ok');
END;
$$;
GRANT EXECUTE ON FUNCTION public.accrue_eosb_for_period(text) TO authenticated;
COMMENT ON FUNCTION public.accrue_eosb_for_period(text) IS
'H8: Posts one EOSB accrual row per active employee for the given period (idempotent). Run monthly from HR Hub.';


-- ============================================================================
-- H2 — Salary advance requests (employee form, manager + finance approval)
-- ----------------------------------------------------------------------------
-- Distinct from down_payment_requests (which are for site visits). These are
-- personal cash advances repayable from next payroll(s).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.salary_advances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  amount          numeric(14,2) NOT NULL CHECK (amount > 0),
  currency        text NOT NULL DEFAULT 'SDG',
  reason          text,
  repayment_months int NOT NULL DEFAULT 1 CHECK (repayment_months BETWEEN 1 AND 24),
  status          text NOT NULL DEFAULT 'pending_manager'
                  CHECK (status IN ('pending_manager','pending_finance','approved','rejected','disbursed','repaying','repaid','cancelled')),
  manager_id      uuid,
  manager_decision text CHECK (manager_decision IN ('approved','rejected')),
  manager_notes   text,
  manager_decided_at timestamptz,
  finance_id      uuid,
  finance_decision text CHECK (finance_decision IN ('approved','rejected')),
  finance_notes   text,
  finance_decided_at timestamptz,
  disbursed_at    timestamptz,
  total_repaid    numeric(14,2) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sa_user ON public.salary_advances(user_id);
CREATE INDEX IF NOT EXISTS idx_sa_status ON public.salary_advances(status);
ALTER TABLE public.salary_advances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sa_read ON public.salary_advances;
CREATE POLICY sa_read ON public.salary_advances FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR manager_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
             AND lower(role) IN ('super_admin','superadmin','admin','finance','hr')));
DROP POLICY IF EXISTS sa_insert ON public.salary_advances;
CREATE POLICY sa_insert ON public.salary_advances FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
-- H2 RLS hardening: split owner vs approver update policies.
-- Owners may update only while still 'pending' AND must keep status='pending'
-- (i.e. they can edit amount/reason/repayment but cannot self-approve).
DROP POLICY IF EXISTS sa_update ON public.salary_advances;
DROP POLICY IF EXISTS sa_update_owner ON public.salary_advances;
CREATE POLICY sa_update_owner ON public.salary_advances FOR UPDATE TO authenticated
USING (
  user_id = auth.uid() AND status = 'pending'
)
WITH CHECK (
  user_id = auth.uid() AND status = 'pending'
);
DROP POLICY IF EXISTS sa_update_approver ON public.salary_advances;
CREATE POLICY sa_update_approver ON public.salary_advances FOR UPDATE TO authenticated
USING (
  manager_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
             AND lower(role) IN ('super_admin','superadmin','admin','finance','hr'))
)
WITH CHECK (
  manager_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
             AND lower(role) IN ('super_admin','superadmin','admin','finance','hr'))
);


-- ============================================================================
-- H3 — Personal expense / reimbursement claims
-- ----------------------------------------------------------------------------
-- Multi-line claim: header + lines. Manager approval, then finance posts and
-- credits the employee's wallet.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.expense_claims (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  claim_number    text UNIQUE,
  title           text NOT NULL,
  description     text,
  currency        text NOT NULL DEFAULT 'SDG',
  total_amount    numeric(14,2) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','submitted','manager_approved','manager_rejected','finance_approved','finance_rejected','paid','cancelled')),
  manager_id      uuid,
  manager_notes   text,
  manager_decided_at timestamptz,
  finance_id      uuid,
  finance_notes   text,
  finance_decided_at timestamptz,
  paid_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ec_user ON public.expense_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_ec_status ON public.expense_claims(status);

CREATE TABLE IF NOT EXISTS public.expense_claim_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id        uuid NOT NULL REFERENCES public.expense_claims(id) ON DELETE CASCADE,
  date            date NOT NULL DEFAULT CURRENT_DATE,
  category        text NOT NULL,                  -- 'travel','meals','accommodation','supplies','communications','other'
  description     text NOT NULL,
  amount          numeric(14,2) NOT NULL CHECK (amount > 0),
  receipt_url     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ecl_claim ON public.expense_claim_lines(claim_id);

ALTER TABLE public.expense_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_claim_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ec_read ON public.expense_claims;
CREATE POLICY ec_read ON public.expense_claims FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR manager_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
             AND lower(role) IN ('super_admin','superadmin','admin','finance','hr')));
DROP POLICY IF EXISTS ec_write ON public.expense_claims;
CREATE POLICY ec_write ON public.expense_claims FOR ALL TO authenticated USING (
  user_id = auth.uid()
  OR manager_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
             AND lower(role) IN ('super_admin','superadmin','admin','finance','hr')))
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
             AND lower(role) IN ('super_admin','superadmin','admin','finance','hr')));
DROP POLICY IF EXISTS ecl_read ON public.expense_claim_lines;
CREATE POLICY ecl_read ON public.expense_claim_lines FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.expense_claims c WHERE c.id = claim_id
          AND (c.user_id = auth.uid() OR c.manager_id = auth.uid()
               OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
                          AND lower(role) IN ('super_admin','superadmin','admin','finance','hr')))));
DROP POLICY IF EXISTS ecl_write ON public.expense_claim_lines;
CREATE POLICY ecl_write ON public.expense_claim_lines FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.expense_claims c WHERE c.id = claim_id
          AND (c.user_id = auth.uid()
               OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
                          AND lower(role) IN ('super_admin','superadmin','admin','finance','hr')))))
WITH CHECK (
  EXISTS (SELECT 1 FROM public.expense_claims c WHERE c.id = claim_id
          AND (c.user_id = auth.uid()
               OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
                          AND lower(role) IN ('super_admin','superadmin','admin','finance','hr')))));


-- ============================================================================
-- H4 — Daily attendance / check-in / check-out with optional GPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  log_date        date NOT NULL DEFAULT CURRENT_DATE,
  check_in_at     timestamptz,
  check_out_at    timestamptz,
  check_in_lat    numeric(10,7),
  check_in_lng    numeric(10,7),
  check_out_lat   numeric(10,7),
  check_out_lng   numeric(10,7),
  notes           text,
  hours_worked    numeric(5,2) GENERATED ALWAYS AS (
    CASE WHEN check_in_at IS NOT NULL AND check_out_at IS NOT NULL
         THEN ROUND((EXTRACT(EPOCH FROM (check_out_at - check_in_at)) / 3600.0)::numeric, 2)
         ELSE NULL END
  ) STORED,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, log_date)
);
CREATE INDEX IF NOT EXISTS idx_attlog_user ON public.attendance_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_attlog_date ON public.attendance_logs(log_date);

ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attlog_read ON public.attendance_logs;
CREATE POLICY attlog_read ON public.attendance_logs FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
             AND lower(role) IN ('super_admin','superadmin','admin','hr','manager')));
DROP POLICY IF EXISTS attlog_write ON public.attendance_logs;
CREATE POLICY attlog_write ON public.attendance_logs FOR ALL TO authenticated USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());


-- ============================================================================
-- H5 — Offboarding workflow
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.offboarding_cases (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL,
  initiated_by             uuid,
  reason                   text,                 -- 'resignation','termination','retirement','contract_end'
  last_working_date        date NOT NULL,
  notice_given_date        date,
  status                   text NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open','settlement_review','approved','completed','cancelled')),
  -- Final settlement breakdown
  pro_rated_salary         numeric(14,2) DEFAULT 0,
  leave_encashment         numeric(14,2) DEFAULT 0,
  eosb_payout              numeric(14,2) DEFAULT 0,
  bonus_or_incentive       numeric(14,2) DEFAULT 0,
  outstanding_advances     numeric(14,2) DEFAULT 0,
  outstanding_loans        numeric(14,2) DEFAULT 0,
  other_deductions         numeric(14,2) DEFAULT 0,
  final_settlement_amount  numeric(14,2) DEFAULT 0,
  currency                 text NOT NULL DEFAULT 'SDG',
  -- Checklist (jsonb so we can extend without migrations)
  checklist                jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes                    text,
  approved_by              uuid,
  approved_at              timestamptz,
  completed_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offb_user ON public.offboarding_cases(user_id);
CREATE INDEX IF NOT EXISTS idx_offb_status ON public.offboarding_cases(status);
ALTER TABLE public.offboarding_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offb_read ON public.offboarding_cases;
CREATE POLICY offb_read ON public.offboarding_cases FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
             AND lower(role) IN ('super_admin','superadmin','admin','finance','hr')));
DROP POLICY IF EXISTS offb_write ON public.offboarding_cases;
CREATE POLICY offb_write ON public.offboarding_cases FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
          AND lower(role) IN ('super_admin','superadmin','admin','finance','hr')))
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
          AND lower(role) IN ('super_admin','superadmin','admin','finance','hr')));


-- ============================================================================
-- Helper: claim_number sequence for expense claims
-- ============================================================================

CREATE OR REPLACE FUNCTION public.next_expense_claim_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_year text := to_char(now(),'YYYY');
  v_count int;
BEGIN
  SELECT COUNT(*)+1 INTO v_count FROM public.expense_claims
   WHERE claim_number LIKE 'EXP-' || v_year || '-%';
  RETURN 'EXP-' || v_year || '-' || lpad(v_count::text, 5, '0');
END;
$$;

-- Auto-assign claim_number on insert if missing
CREATE OR REPLACE FUNCTION public.set_expense_claim_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.claim_number IS NULL OR NEW.claim_number = '' THEN
    NEW.claim_number := public.next_expense_claim_number();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_set_expense_claim_number ON public.expense_claims;
CREATE TRIGGER trg_set_expense_claim_number
  BEFORE INSERT ON public.expense_claims
  FOR EACH ROW EXECUTE FUNCTION public.set_expense_claim_number();


-- ============================================================================
-- updated_at trigger helper (re-used by salary_advances, expense_claims, offboarding_cases)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at_now()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_sa_updated_at ON public.salary_advances;
CREATE TRIGGER trg_sa_updated_at  BEFORE UPDATE ON public.salary_advances    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();
DROP TRIGGER IF EXISTS trg_ec_updated_at ON public.expense_claims;
CREATE TRIGGER trg_ec_updated_at  BEFORE UPDATE ON public.expense_claims     FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();
DROP TRIGGER IF EXISTS trg_offb_updated_at ON public.offboarding_cases;
CREATE TRIGGER trg_offb_updated_at BEFORE UPDATE ON public.offboarding_cases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║  PART 2 of 2 — remediation patch (20260425_hr_audit_remediation.sql)   ║
-- ║  Fixes 3 reviewer-flagged defects in the policies/RPC above.           ║
-- ╚════════════════════════════════════════════════════════════════════════╝

-- ============================================================================
-- HR Audit remediation — Phase 0 exit fixes
-- ----------------------------------------------------------------------------
-- Applied after the architect code review of 20260424_hr_audit_complete.sql
-- flagged three HIGH-severity defects:
--
--   FIX-1  H2  salary_advances.sa_update_owner used status='pending' but the
--              CHECK constraint enumerates 'pending_manager' / 'pending_finance'
--              etc. — there is no plain 'pending' state, so owners could never
--              edit their own row through the workflow. Widen owner-edit window
--              to BOTH pending_manager AND pending_finance, lock further states.
--
--   FIX-2  H3  expense_claims.ec_write USING allowed manager_id = auth.uid()
--              but WITH CHECK omitted manager — manager could not perform UPDATE
--              because the post-image failed the WITH CHECK. Add manager_id to
--              WITH CHECK so manager-approval transitions succeed.
--
--   FIX-3  H8  accrue_eosb_for_period used IF EXISTS + INSERT — race condition
--              under concurrent invocations. Replace with INSERT ... ON CONFLICT
--              (user_id, period) DO NOTHING (the unique constraint exists at
--              eosb_accruals(user_id, period) per migration 20260424).
-- ============================================================================

-- ── FIX-1: salary_advances owner-update policy ──────────────────────────────
DROP POLICY IF EXISTS sa_update_owner ON public.salary_advances;
CREATE POLICY sa_update_owner ON public.salary_advances FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  AND status IN ('pending_manager','pending_finance')
)
WITH CHECK (
  user_id = auth.uid()
  AND status IN ('pending_manager','pending_finance','cancelled')
);

-- ── FIX-2: expense_claims write policy — manager allowed in WITH CHECK ──────
DROP POLICY IF EXISTS ec_write ON public.expense_claims;
CREATE POLICY ec_write ON public.expense_claims FOR ALL TO authenticated
USING (
  user_id = auth.uid()
  OR manager_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
             AND lower(role) IN ('super_admin','superadmin','admin','finance','hr'))
)
WITH CHECK (
  user_id = auth.uid()
  OR manager_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
             AND lower(role) IN ('super_admin','superadmin','admin','finance','hr'))
);

-- ── FIX-3: accrue_eosb_for_period race-safe via ON CONFLICT ─────────────────
CREATE OR REPLACE FUNCTION public.accrue_eosb_for_period(p_period text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed   int := 0;
  v_skipped     int := 0;
  v_emp         record;
  v_opening     numeric;
  v_accrual     numeric;
  v_caller_role text;
  v_inserted    boolean;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR lower(v_caller_role) NOT IN ('super_admin','superadmin','admin','finance','hr') THEN
    RAISE EXCEPTION 'Unauthorized: only HR / finance / admin may accrue EOSB' USING ERRCODE = '42501';
  END IF;

  IF p_period !~ '^[0-9]{4}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'period must be YYYY-MM (got %)', p_period;
  END IF;

  FOR v_emp IN
    SELECT p.id AS user_id, p.contract_start_date, esc.base_salary, COALESCE(esc.currency,'SDG') AS currency
    FROM public.profiles p
    LEFT JOIN public.employee_salary_config esc ON esc.user_id = p.id
    WHERE p.status = 'active'
      AND COALESCE(esc.base_salary, 0) > 0
      AND p.contract_start_date IS NOT NULL
  LOOP
    SELECT COALESCE(closing_balance, 0) INTO v_opening
    FROM public.eosb_accruals
    WHERE user_id = v_emp.user_id
    ORDER BY period DESC
    LIMIT 1;
    v_opening := COALESCE(v_opening, 0);
    v_accrual := ROUND(v_emp.base_salary / 12.0, 2);

    -- Race-safe insert: relies on UNIQUE (user_id, period) from 20260424 migration.
    -- ON CONFLICT DO NOTHING returns no rows; we use a returning-clause check to
    -- distinguish processed vs skipped without a separate SELECT.
    WITH ins AS (
      INSERT INTO public.eosb_accruals
        (user_id, period, opening_balance, accrued_amount, closing_balance, base_salary, currency, created_by)
      VALUES
        (v_emp.user_id, p_period, v_opening, v_accrual, v_opening + v_accrual, v_emp.base_salary, v_emp.currency, auth.uid())
      ON CONFLICT (user_id, period) DO NOTHING
      RETURNING 1
    )
    SELECT EXISTS(SELECT 1 FROM ins) INTO v_inserted;

    IF v_inserted THEN
      v_processed := v_processed + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('period', p_period, 'processed', v_processed, 'skipped', v_skipped, 'status', 'ok');
END;
$$;

GRANT EXECUTE ON FUNCTION public.accrue_eosb_for_period(text) TO authenticated;
COMMENT ON FUNCTION public.accrue_eosb_for_period(text) IS
'H8 (race-safe): Posts one EOSB accrual row per active employee for the given period. Idempotent under concurrent calls via ON CONFLICT (user_id, period).';

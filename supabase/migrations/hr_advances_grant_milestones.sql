-- =====================================================================
-- Migration: Grant Milestones, Grant Expenses, Cost Allocation Targets,
--            Salary Advances & Recoveries
-- Run in Supabase SQL Editor
-- =====================================================================

-- A/B: Grant milestones per grant
CREATE TABLE IF NOT EXISTS acct_grant_milestones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id       UUID NOT NULL REFERENCES acct_grants(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  due_date       DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','in_progress','submitted','accepted','overdue')),
  submitted_date DATE,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE acct_grant_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grant_milestones_all" ON acct_grant_milestones FOR ALL USING (true) WITH CHECK (true);

-- A: Grant expenses (may already exist from phase5 — safe with IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS acct_grant_expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id    UUID NOT NULL REFERENCES acct_grants(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL,
  amount      NUMERIC NOT NULL,
  description TEXT,
  account_id  UUID REFERENCES acct_accounts(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE acct_grant_expenses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'acct_grant_expenses' AND policyname = 'grant_expenses_all'
  ) THEN
    EXECUTE 'CREATE POLICY "grant_expenses_all" ON acct_grant_expenses FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- C: Cost allocation target accounts per rule
CREATE TABLE IF NOT EXISTS acct_cost_allocation_targets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id           UUID NOT NULL REFERENCES acct_cost_allocation_rules(id) ON DELETE CASCADE,
  target_account_id UUID NOT NULL REFERENCES acct_accounts(id),
  weight_pct        NUMERIC NOT NULL DEFAULT 100,
  created_at        TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE acct_cost_allocation_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cost_alloc_targets_all" ON acct_cost_allocation_targets FOR ALL USING (true) WITH CHECK (true);

-- E: Salary advances
CREATE TABLE IF NOT EXISTS hr_salary_advances (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES profiles(id),
  amount           NUMERIC NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'USD',
  issue_date       DATE NOT NULL,
  reason           TEXT,
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','fully_recovered','written_off')),
  monthly_recovery NUMERIC,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE hr_salary_advances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_salary_advances_select" ON hr_salary_advances FOR SELECT USING (true);
CREATE POLICY "hr_salary_advances_insert" ON hr_salary_advances FOR INSERT WITH CHECK (true);
CREATE POLICY "hr_salary_advances_update" ON hr_salary_advances FOR UPDATE USING (true) WITH CHECK (true);

-- E: Salary advance recovery records
CREATE TABLE IF NOT EXISTS hr_salary_advance_recoveries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_id     UUID NOT NULL REFERENCES hr_salary_advances(id) ON DELETE CASCADE,
  recovery_date  DATE NOT NULL,
  amount         NUMERIC NOT NULL,
  payroll_period TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE hr_salary_advance_recoveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_advance_recoveries_all" ON hr_salary_advance_recoveries FOR ALL USING (true) WITH CHECK (true);

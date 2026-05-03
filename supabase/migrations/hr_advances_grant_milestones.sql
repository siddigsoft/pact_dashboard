-- =====================================================================
-- PACT — Complete standalone migration
-- Includes: Phase 5 tables (IF NOT EXISTS) + new tables for
--   Grant Milestones, Cost Allocation Targets, Salary Advances
--
-- Safe to run even if Phase 5 was never applied.
-- Idempotent — use IF NOT EXISTS / ON CONFLICT throughout.
-- Paste this into the Supabase SQL Editor and run.
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- PHASE 5 PREREQUISITES (create only if they don't already exist)
-- ─────────────────────────────────────────────────────────────────────

-- Grant Tracking
CREATE TABLE IF NOT EXISTS acct_grants (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_name           TEXT NOT NULL,
  donor_name           TEXT NOT NULL,
  reference_number     TEXT,
  award_amount         NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency             TEXT NOT NULL DEFAULT 'USD',
  start_date           DATE NOT NULL,
  end_date             DATE NOT NULL,
  reporting_frequency  TEXT NOT NULL DEFAULT 'quarterly'
                         CHECK (reporting_frequency IN ('monthly','quarterly','semi_annual','annual','ad_hoc')),
  status               TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('draft','active','closed','expired')),
  fund_id              UUID,          -- intentionally no FK — acct_funds may not exist yet
  description          TEXT,
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acct_grant_expenses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id         UUID NOT NULL REFERENCES acct_grants(id) ON DELETE CASCADE,
  journal_line_id  UUID,              -- intentionally no FK — safe if acct_journal_lines not yet present
  amount           NUMERIC(18,2) NOT NULL DEFAULT 0,
  expense_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  description      TEXT,
  account_id       UUID,              -- optional link to chart-of-accounts
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acct_grants_status        ON acct_grants(status);
CREATE INDEX IF NOT EXISTS idx_acct_grants_end_date      ON acct_grants(end_date);
CREATE INDEX IF NOT EXISTS idx_acct_grant_expenses_grant ON acct_grant_expenses(grant_id);

ALTER TABLE acct_grants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_grant_expenses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='acct_grants' AND policyname='grants_all') THEN
    EXECUTE 'CREATE POLICY "grants_all" ON acct_grants FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='acct_grant_expenses' AND policyname='grant_expenses_all') THEN
    EXECUTE 'CREATE POLICY "grant_expenses_all" ON acct_grant_expenses FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;


-- Cost Allocation Engine
CREATE TABLE IF NOT EXISTS acct_cost_allocation_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_name           TEXT NOT NULL,
  source_account_id   UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,
  source_account_code TEXT,
  basis_type          TEXT NOT NULL DEFAULT 'equal'
                        CHECK (basis_type IN ('equal','budget_pct','headcount')),
  target_count        INT  NOT NULL DEFAULT 2,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  description         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acct_allocation_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  total_allocated  NUMERIC(18,2) NOT NULL DEFAULT 0,
  rule_count       INT  NOT NULL DEFAULT 0,
  journal_entry_id UUID,              -- soft link — no FK to avoid ordering issues
  status           TEXT NOT NULL DEFAULT 'completed'
                     CHECK (status IN ('pending','completed','reversed','failed')),
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE acct_cost_allocation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_allocation_runs       ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='acct_cost_allocation_rules' AND policyname='alloc_rules_all') THEN
    EXECUTE 'CREATE POLICY "alloc_rules_all" ON acct_cost_allocation_rules FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='acct_allocation_runs' AND policyname='alloc_runs_all') THEN
    EXECUTE 'CREATE POLICY "alloc_runs_all" ON acct_allocation_runs FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;


-- Depreciation Runs (needed by Fixed Assets module)
CREATE TABLE IF NOT EXISTS acct_depreciation_runs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  period_label       TEXT NOT NULL,
  total_depreciation NUMERIC(18,2) NOT NULL DEFAULT 0,
  asset_count        INT  NOT NULL DEFAULT 0,
  journal_entry_id   UUID,            -- soft link
  status             TEXT NOT NULL DEFAULT 'completed'
                       CHECK (status IN ('pending','completed','reversed','failed')),
  notes              TEXT,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE acct_depreciation_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='acct_depreciation_runs' AND policyname='depr_runs_all') THEN
    EXECUTE 'CREATE POLICY "depr_runs_all" ON acct_depreciation_runs FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;


-- Cash Flow Forecast Adjustments
CREATE TABLE IF NOT EXISTS acct_cash_flow_adjustments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key   CHAR(7) NOT NULL,   -- 'YYYY-MM'
  label       TEXT NOT NULL,
  amount      NUMERIC(18,2) NOT NULL,
  note        TEXT,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE acct_cash_flow_adjustments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='acct_cash_flow_adjustments' AND policyname='cf_adj_all') THEN
    EXECUTE 'CREATE POLICY "cf_adj_all" ON acct_cash_flow_adjustments FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;


-- Feature flags (safe upsert — no error if feature_flags table doesn't exist yet)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'feature_flags') THEN
    INSERT INTO feature_flags (key, description, is_enabled, rolled_out_pct)
    VALUES
      ('acct.grants.enabled',          'Enable Grant Tracking module.',                        true,  100),
      ('acct.cost_allocation.enabled', 'Enable Cost Allocation Engine.',                       false, 100),
      ('acct.depreciation_auto',       'Auto-generate depreciation journals on period close.', false, 100)
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────
-- NEW TABLES (this migration's primary additions)
-- ─────────────────────────────────────────────────────────────────────

-- A/B: Reporting milestones per grant
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

CREATE INDEX IF NOT EXISTS idx_acct_grant_milestones_grant ON acct_grant_milestones(grant_id);

ALTER TABLE acct_grant_milestones ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='acct_grant_milestones' AND policyname='grant_milestones_all') THEN
    EXECUTE 'CREATE POLICY "grant_milestones_all" ON acct_grant_milestones FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;


-- C: Target accounts per cost allocation rule (with weight for proportional split)
CREATE TABLE IF NOT EXISTS acct_cost_allocation_targets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id           UUID NOT NULL REFERENCES acct_cost_allocation_rules(id) ON DELETE CASCADE,
  target_account_id UUID NOT NULL REFERENCES acct_accounts(id) ON DELETE CASCADE,
  weight_pct        NUMERIC(8,4) NOT NULL DEFAULT 100,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acct_alloc_targets_rule ON acct_cost_allocation_targets(rule_id);

ALTER TABLE acct_cost_allocation_targets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='acct_cost_allocation_targets' AND policyname='cost_alloc_targets_all') THEN
    EXECUTE 'CREATE POLICY "cost_alloc_targets_all" ON acct_cost_allocation_targets FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;


-- E: Salary advances issued to staff
CREATE TABLE IF NOT EXISTS hr_salary_advances (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount           NUMERIC(18,2) NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'USD',
  issue_date       DATE NOT NULL,
  reason           TEXT,
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','fully_recovered','written_off')),
  monthly_recovery NUMERIC(18,2),
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_salary_advances_user   ON hr_salary_advances(user_id);
CREATE INDEX IF NOT EXISTS idx_hr_salary_advances_status ON hr_salary_advances(status);

ALTER TABLE hr_salary_advances ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hr_salary_advances' AND policyname='hr_salary_advances_all') THEN
    EXECUTE 'CREATE POLICY "hr_salary_advances_all" ON hr_salary_advances FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;


-- E: Recovery instalments against a salary advance
CREATE TABLE IF NOT EXISTS hr_salary_advance_recoveries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_id     UUID NOT NULL REFERENCES hr_salary_advances(id) ON DELETE CASCADE,
  recovery_date  DATE NOT NULL,
  amount         NUMERIC(18,2) NOT NULL,
  payroll_period TEXT,           -- e.g. '2026-05'
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_advance_recoveries_advance ON hr_salary_advance_recoveries(advance_id);

ALTER TABLE hr_salary_advance_recoveries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hr_salary_advance_recoveries' AND policyname='hr_advance_recoveries_all') THEN
    EXECUTE 'CREATE POLICY "hr_advance_recoveries_all" ON hr_salary_advance_recoveries FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────
SELECT 'Migration complete — acct_grants, acct_grant_expenses, acct_cost_allocation_rules, '
    || 'acct_allocation_runs, acct_depreciation_runs, acct_cash_flow_adjustments, '
    || 'acct_grant_milestones, acct_cost_allocation_targets, '
    || 'hr_salary_advances, hr_salary_advance_recoveries' AS result;

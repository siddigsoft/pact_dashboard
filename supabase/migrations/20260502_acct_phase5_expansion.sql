-- ============================================================
-- PACT Accounting Phase 5 — Expansion
-- Adds: Grant Tracking, Cost Allocation, Depreciation Runs,
--       Cash Flow Adjustments
-- Apply manually: paste into Supabase SQL editor
-- Idempotent: uses IF NOT EXISTS throughout
-- ============================================================

-- ── Grant Tracking ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acct_grants (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_name           text NOT NULL,
  donor_name           text NOT NULL,
  reference_number     text,
  award_amount         numeric(18,2) NOT NULL DEFAULT 0,
  currency             text NOT NULL DEFAULT 'USD',
  start_date           date NOT NULL,
  end_date             date NOT NULL,
  reporting_frequency  text NOT NULL DEFAULT 'quarterly'
                         CHECK (reporting_frequency IN ('monthly','quarterly','semi_annual','annual','ad_hoc')),
  status               text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('draft','active','closed','expired')),
  fund_id              uuid REFERENCES accounting_funds(id) ON DELETE SET NULL,
  description          text,
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acct_grant_expenses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id         uuid NOT NULL REFERENCES acct_grants(id) ON DELETE CASCADE,
  journal_line_id  uuid REFERENCES acct_journal_lines(id) ON DELETE SET NULL,
  amount           numeric(18,2) NOT NULL DEFAULT 0,
  expense_date     date NOT NULL DEFAULT CURRENT_DATE,
  description      text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acct_grants_status          ON acct_grants(status);
CREATE INDEX IF NOT EXISTS idx_acct_grants_end_date        ON acct_grants(end_date);
CREATE INDEX IF NOT EXISTS idx_acct_grant_expenses_grant   ON acct_grant_expenses(grant_id);

ALTER TABLE acct_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_grant_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grants_all" ON acct_grants;
DROP POLICY IF EXISTS "grant_expenses_all" ON acct_grant_expenses;
CREATE POLICY "grants_all"         ON acct_grants         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "grant_expenses_all" ON acct_grant_expenses FOR ALL USING (true) WITH CHECK (true);

-- ── Cost Allocation ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acct_cost_allocation_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_name           text NOT NULL,
  source_account_id   uuid REFERENCES acct_accounts(id) ON DELETE SET NULL,
  source_account_code text,
  basis_type          text NOT NULL DEFAULT 'equal'
                        CHECK (basis_type IN ('equal','budget_pct','headcount')),
  target_count        int  NOT NULL DEFAULT 2,
  is_active           boolean NOT NULL DEFAULT true,
  description         text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acct_allocation_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date         date NOT NULL DEFAULT CURRENT_DATE,
  total_allocated  numeric(18,2) NOT NULL DEFAULT 0,
  rule_count       int  NOT NULL DEFAULT 0,
  journal_entry_id uuid REFERENCES acct_journal_entries(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'completed'
                     CHECK (status IN ('pending','completed','reversed','failed')),
  notes            text,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE acct_cost_allocation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_allocation_runs       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alloc_rules_all" ON acct_cost_allocation_rules;
DROP POLICY IF EXISTS "alloc_runs_all"  ON acct_allocation_runs;
CREATE POLICY "alloc_rules_all" ON acct_cost_allocation_rules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "alloc_runs_all"  ON acct_allocation_runs       FOR ALL USING (true) WITH CHECK (true);

-- ── Depreciation Runs ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acct_depreciation_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date           date NOT NULL DEFAULT CURRENT_DATE,
  period_label       text NOT NULL,
  total_depreciation numeric(18,2) NOT NULL DEFAULT 0,
  asset_count        int  NOT NULL DEFAULT 0,
  journal_entry_id   uuid REFERENCES acct_journal_entries(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'completed'
                       CHECK (status IN ('pending','completed','reversed','failed')),
  notes              text,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE acct_depreciation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "depr_runs_all" ON acct_depreciation_runs;
CREATE POLICY "depr_runs_all" ON acct_depreciation_runs FOR ALL USING (true) WITH CHECK (true);

-- ── Cash Flow Forecast Adjustments ──────────────────────────
CREATE TABLE IF NOT EXISTS acct_cash_flow_adjustments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key   char(7) NOT NULL,        -- 'YYYY-MM'
  label       text NOT NULL,
  amount      numeric(18,2) NOT NULL,  -- positive = inflow, negative = outflow
  note        text,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE acct_cash_flow_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cf_adj_all" ON acct_cash_flow_adjustments;
CREATE POLICY "cf_adj_all" ON acct_cash_flow_adjustments FOR ALL USING (true) WITH CHECK (true);

-- ── Phase 5 Feature Flags ────────────────────────────────────
INSERT INTO feature_flags (key, description, is_enabled, rolled_out_pct)
VALUES
  ('acct.grants.enabled',          'Enable Grant Tracking module.',                  true,  100),
  ('acct.cost_allocation.enabled', 'Enable Cost Allocation Engine.',                 false, 100),
  ('acct.depreciation_auto',       'Auto-generate depreciation journals on period close.', false, 100)
ON CONFLICT (key) DO NOTHING;

-- Done
SELECT 'Phase 5 migration complete — acct_grants, acct_grant_expenses, acct_cost_allocation_rules, acct_allocation_runs, acct_depreciation_runs, acct_cash_flow_adjustments' AS result;

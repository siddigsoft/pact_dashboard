-- ============================================================
-- PACT Command Center — Budget Lines
-- Creates acct_budget_lines for Budget vs. Actual reporting
-- Apply in Supabase SQL Editor after core accounting tables exist.
-- SAFE TO RE-RUN: uses IF NOT EXISTS / OR REPLACE.
-- ============================================================

CREATE TABLE IF NOT EXISTS acct_budget_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id  UUID NOT NULL REFERENCES acct_fiscal_years(id)  ON DELETE CASCADE,
  period_id       UUID REFERENCES acct_fiscal_periods(id) ON DELETE CASCADE,  -- NULL = annual budget
  account_id      UUID NOT NULL REFERENCES acct_accounts(id)       ON DELETE CASCADE,
  fund_id         UUID REFERENCES acct_funds(id)                   ON DELETE SET NULL,
  country_id      UUID REFERENCES countries(id)                    ON DELETE SET NULL,
  budget_amount   NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  updated_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One budget line per period+account+fund combination
  UNIQUE NULLS NOT DISTINCT (period_id, account_id, fund_id)
);

CREATE INDEX IF NOT EXISTS idx_acct_budget_year    ON acct_budget_lines(fiscal_year_id);
CREATE INDEX IF NOT EXISTS idx_acct_budget_period  ON acct_budget_lines(period_id);
CREATE INDEX IF NOT EXISTS idx_acct_budget_account ON acct_budget_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_acct_budget_fund    ON acct_budget_lines(fund_id);
CREATE INDEX IF NOT EXISTS idx_acct_budget_country ON acct_budget_lines(country_id);

ALTER TABLE acct_budget_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acct_budget_select" ON acct_budget_lines
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "acct_budget_modify" ON acct_budget_lines
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN (
          'super_admin','admin','financialAdmin','financial_admin','accountant','finance'
        )
    )
  );

CREATE OR REPLACE FUNCTION update_acct_budget_lines_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER acct_budget_lines_updated_at
  BEFORE UPDATE ON acct_budget_lines
  FOR EACH ROW EXECUTE FUNCTION update_acct_budget_lines_updated_at();

-- Instructions:
-- 1. Supabase Dashboard → SQL Editor → New query → Run this file
-- 2. /accounting/budget-variance page will then be active

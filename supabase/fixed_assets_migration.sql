-- ============================================================
-- PACT Command Center — Fixed Assets Register
-- Creates acct_fixed_assets for asset tracking and depreciation
-- Apply in Supabase SQL Editor after core accounting tables exist.
-- SAFE TO RE-RUN: uses IF NOT EXISTS / OR REPLACE.
-- ============================================================

CREATE TABLE IF NOT EXISTS acct_fixed_assets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_tag           TEXT UNIQUE,            -- e.g. FA-2024-001
  name_en             TEXT NOT NULL,
  name_ar             TEXT,
  category            TEXT NOT NULL DEFAULT 'equipment',
  -- furniture | equipment | vehicle | building | it_hardware | software | other
  country_id          UUID REFERENCES countries(id)       ON DELETE SET NULL,
  location            TEXT,                   -- physical location / hub
  acquisition_date    DATE NOT NULL,
  acquisition_cost    NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'USD',
  useful_life_months  INTEGER NOT NULL DEFAULT 60,  -- depreciation period
  salvage_value       NUMERIC(15,2) NOT NULL DEFAULT 0,
  depreciation_method TEXT NOT NULL DEFAULT 'straight_line',
  -- straight_line | declining_balance | units_of_production
  gl_account_id       UUID REFERENCES acct_accounts(id)  ON DELETE SET NULL,  -- asset GL account
  dep_account_id      UUID REFERENCES acct_accounts(id)  ON DELETE SET NULL,  -- accumulated depreciation account
  status              TEXT NOT NULL DEFAULT 'active',
  -- active | disposed | written_off | under_repair | transferred
  disposal_date       DATE,
  disposal_proceeds   NUMERIC(15,2),
  disposal_notes      TEXT,
  fund_id             UUID REFERENCES acct_funds(id)      ON DELETE SET NULL,
  notes               TEXT,
  serial_number       TEXT,
  supplier            TEXT,                   -- free-text or FK to acct_vendors in future
  warranty_expiry     DATE,
  image_url           TEXT,
  created_by          UUID REFERENCES auth.users(id),
  updated_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acct_fa_category   ON acct_fixed_assets(category);
CREATE INDEX IF NOT EXISTS idx_acct_fa_country    ON acct_fixed_assets(country_id);
CREATE INDEX IF NOT EXISTS idx_acct_fa_status     ON acct_fixed_assets(status);
CREATE INDEX IF NOT EXISTS idx_acct_fa_fund       ON acct_fixed_assets(fund_id);

ALTER TABLE acct_fixed_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acct_fa_select" ON acct_fixed_assets
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "acct_fa_modify" ON acct_fixed_assets
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

CREATE SEQUENCE IF NOT EXISTS acct_fa_tag_seq START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION update_acct_fixed_assets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER acct_fixed_assets_updated_at
  BEFORE UPDATE ON acct_fixed_assets
  FOR EACH ROW EXECUTE FUNCTION update_acct_fixed_assets_updated_at();

-- Instructions:
-- 1. Supabase Dashboard → SQL Editor → New query → Run this file
-- 2. /accounting/fixed-assets page will then be active

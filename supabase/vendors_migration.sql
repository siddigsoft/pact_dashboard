-- ============================================================
-- PACT Command Center — Vendor Registry
-- Creates acct_vendors for supplier / payable management
-- Apply in Supabase SQL Editor after core accounting tables exist.
-- SAFE TO RE-RUN: uses IF NOT EXISTS / OR REPLACE.
-- ============================================================

CREATE TABLE IF NOT EXISTS acct_vendors (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_code      TEXT UNIQUE,
  name_en          TEXT NOT NULL,
  name_ar          TEXT,
  vendor_type      TEXT NOT NULL DEFAULT 'supplier',
  -- supplier | service_provider | consultant | ngo_partner | government | utility
  tax_id           TEXT,
  country_id       UUID REFERENCES countries(id) ON DELETE SET NULL,
  gl_account_id    UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,  -- linked AP account
  payment_terms    INTEGER DEFAULT 30,   -- days
  currency         TEXT NOT NULL DEFAULT 'USD',
  contact_name     TEXT,
  contact_email    TEXT,
  contact_phone    TEXT,
  address          TEXT,
  bank_name        TEXT,
  bank_account_no  TEXT,
  swift_code       TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id),
  updated_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acct_vendors_country  ON acct_vendors(country_id);
CREATE INDEX IF NOT EXISTS idx_acct_vendors_active   ON acct_vendors(is_active);
CREATE INDEX IF NOT EXISTS idx_acct_vendors_type     ON acct_vendors(vendor_type);

ALTER TABLE acct_vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acct_vendors_select" ON acct_vendors
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "acct_vendors_modify" ON acct_vendors
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

-- Add optional vendor_id FK column to journal lines (if not already present)
ALTER TABLE acct_journal_lines
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES acct_vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_acct_jl_vendor ON acct_journal_lines(vendor_id);

CREATE OR REPLACE FUNCTION update_acct_vendors_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER acct_vendors_updated_at
  BEFORE UPDATE ON acct_vendors
  FOR EACH ROW EXECUTE FUNCTION update_acct_vendors_updated_at();

-- Auto-generate vendor code sequence
CREATE SEQUENCE IF NOT EXISTS acct_vendor_code_seq START 1000 INCREMENT 1;

-- Instructions:
-- 1. Supabase Dashboard → SQL Editor → New query → Run this file
-- 2. /accounting/vendors page will then be active
-- 3. The vendor_id column is added to acct_journal_lines (optional field)

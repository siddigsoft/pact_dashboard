-- ============================================================
-- PACT Command Center — Bank Reconciliation Tables
--
-- Creates:
--   acct_bank_accounts         — registered bank accounts
--   acct_bank_statement_lines  — uploaded / manually entered statement lines
--
-- Apply in Supabase SQL Editor after core accounting tables exist.
-- ============================================================

-- ── 1. Bank Accounts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acct_bank_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name    TEXT NOT NULL,
  bank_name       TEXT NOT NULL,
  account_number  TEXT,
  swift_code      TEXT,
  currency        TEXT NOT NULL DEFAULT 'USD',
  country_id      UUID REFERENCES countries(id),
  gl_account_id   UUID REFERENCES acct_accounts(id),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acct_bank_accounts_country ON acct_bank_accounts(country_id);
CREATE INDEX IF NOT EXISTS idx_acct_bank_accounts_gl     ON acct_bank_accounts(gl_account_id);

ALTER TABLE acct_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acct_bank_accounts_select" ON acct_bank_accounts
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "acct_bank_accounts_modify" ON acct_bank_accounts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin','admin','financialAdmin','financial_admin','accountant','finance')
    )
  );

-- ── 2. Bank Statement Lines ───────────────────────────────────
CREATE TABLE IF NOT EXISTS acct_bank_statement_lines (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id         UUID NOT NULL REFERENCES acct_bank_accounts(id) ON DELETE CASCADE,
  statement_date          DATE NOT NULL,
  value_date              DATE,
  description             TEXT,
  reference               TEXT,
  -- positive = money IN (deposit/credit), negative = money OUT (withdrawal/debit)
  amount                  NUMERIC(15,2) NOT NULL,
  running_balance         NUMERIC(15,2),
  currency                TEXT NOT NULL DEFAULT 'USD',
  -- Matching
  matched_journal_entry_id UUID REFERENCES acct_journal_entries(id),
  matched_at              TIMESTAMPTZ,
  matched_by              UUID REFERENCES auth.users(id),
  match_note              TEXT,
  is_matched              BOOLEAN NOT NULL DEFAULT FALSE,
  is_excluded             BOOLEAN NOT NULL DEFAULT FALSE,  -- mark as intentionally excluded (e.g. bank fees)
  -- Import tracking
  import_batch_ref        TEXT,
  created_by              UUID REFERENCES auth.users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acct_stmt_bank    ON acct_bank_statement_lines(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_acct_stmt_date    ON acct_bank_statement_lines(statement_date);
CREATE INDEX IF NOT EXISTS idx_acct_stmt_matched ON acct_bank_statement_lines(is_matched);

ALTER TABLE acct_bank_statement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acct_stmt_select" ON acct_bank_statement_lines
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "acct_stmt_modify" ON acct_bank_statement_lines
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin','admin','financialAdmin','financial_admin','accountant','finance')
    )
  );

-- ── 3. Updated_at trigger for bank accounts ───────────────────
CREATE OR REPLACE FUNCTION update_acct_bank_accounts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER acct_bank_accounts_updated_at
  BEFORE UPDATE ON acct_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION update_acct_bank_accounts_updated_at();

-- ── Instructions ──────────────────────────────────────────────
-- 1. Open Supabase Dashboard → SQL Editor → New query
-- 2. Paste and Run this file
-- 3. The /accounting/bank-recon page will then be active

-- ============================================================================
-- PACT Command Center — Pre-Funding Management System
-- Migration: pre_funding_migration.sql
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Apply once. Safe to re-run (uses IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- ============================================================================

-- ─── 1. Period type definitions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pre_fund_period_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  day_count       INTEGER,                   -- NULL = flexible / project-duration
  is_builtin      BOOLEAN NOT NULL DEFAULT false,
  display_order   INTEGER NOT NULL DEFAULT 99,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed built-in period types
INSERT INTO pre_fund_period_types (name, day_count, is_builtin, display_order) VALUES
  ('Weekly',           7,    true, 1),
  ('Bi-weekly',        14,   true, 2),
  ('Monthly',          30,   true, 3),
  ('Quarterly',        90,   true, 4),
  ('Annual',           365,  true, 5),
  ('Project Duration', NULL, true, 6),
  ('Custom',           NULL, true, 7)
ON CONFLICT DO NOTHING;

-- ─── 2. System-wide pre-funding settings ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS pre_fund_settings (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency               TEXT NOT NULL DEFAULT 'USD',
  default_base_currency       TEXT NOT NULL DEFAULT 'USD',
  default_threshold_pct       NUMERIC(5,2) NOT NULL DEFAULT 20,
  default_warning_days        INTEGER NOT NULL DEFAULT 14,
  auto_renewal_grace_hours    INTEGER NOT NULL DEFAULT 24,
  bank_match_tolerance_pct    NUMERIC(5,2) NOT NULL DEFAULT 2,
  bank_api_enabled            BOOLEAN NOT NULL DEFAULT false,
  bank_api_url                TEXT,
  bank_api_key_hint           TEXT,          -- only last 4 chars stored
  integration_bank_recon      BOOLEAN NOT NULL DEFAULT true,
  integration_cashflow         BOOLEAN NOT NULL DEFAULT true,
  integration_encumbrance      BOOLEAN NOT NULL DEFAULT true,
  default_renewal_mode        TEXT NOT NULL DEFAULT 'off'
                              CHECK (default_renewal_mode IN ('off','auto_draft','auto_activate')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure only one row of settings exists
INSERT INTO pre_fund_settings DEFAULT VALUES
ON CONFLICT DO NOTHING;

-- ─── 3. Pre-fund requests (main table) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS pre_fund_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  source                TEXT,                       -- Donor / funding source
  amount                NUMERIC(20,4) NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'USD',
  available_balance     NUMERIC(20,4) NOT NULL DEFAULT 0,
  committed_amount      NUMERIC(20,4) NOT NULL DEFAULT 0,
  paid_amount           NUMERIC(20,4) NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','pending_approval','awaiting_receipt','active','low_balance','closed','period_locked')),
  period_type_id        UUID REFERENCES pre_fund_period_types(id) ON DELETE SET NULL,
  period_type_name      TEXT,                       -- denormalised for display
  start_date            DATE,
  end_date              DATE,
  country_id            TEXT,
  project_id            UUID,
  grant_id              UUID,
  matching_scope        TEXT NOT NULL DEFAULT 'country_project'
                        CHECK (matching_scope IN ('country','project','country_project','country_project_category')),
  threshold_pct         NUMERIC(5,2),               -- low-balance alert threshold %
  threshold_amount      NUMERIC(20,4),              -- fixed threshold amount
  warning_days          INTEGER DEFAULT 14,
  auto_renewal_mode     TEXT NOT NULL DEFAULT 'off'
                        CHECK (auto_renewal_mode IN ('off','auto_draft','auto_activate')),
  auto_renewal_days_before INTEGER,
  low_balance_alert     BOOLEAN NOT NULL DEFAULT false,
  ending_soon_alert     BOOLEAN NOT NULL DEFAULT false,
  receipt_url           TEXT,
  activated_at          TIMESTAMPTZ,
  notes                 TEXT,
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 4. Per-fund approval chain steps ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pre_fund_approval_steps (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_fund_request_id      UUID NOT NULL REFERENCES pre_fund_requests(id) ON DELETE CASCADE,
  step_order               INTEGER NOT NULL DEFAULT 1,
  step_label               TEXT NOT NULL,
  assigned_user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_required              BOOLEAN NOT NULL DEFAULT true,
  status                   TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','approved','rejected','skipped')),
  approved_at              TIMESTAMPTZ,
  approved_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pf_approval_steps_fund ON pre_fund_approval_steps(pre_fund_request_id);
CREATE INDEX IF NOT EXISTS idx_pf_approval_steps_user ON pre_fund_approval_steps(assigned_user_id);

-- ─── 5. Pre-fund transactions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pre_fund_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_fund_request_id   UUID NOT NULL REFERENCES pre_fund_requests(id) ON DELETE CASCADE,
  transaction_type      TEXT NOT NULL DEFAULT 'payment'
                        CHECK (transaction_type IN ('receipt','commitment','payment','reversal','carry_forward','return','adjustment')),
  amount                NUMERIC(20,4) NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'USD',
  reference             TEXT,
  description           TEXT,
  transaction_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  reconciled            BOOLEAN NOT NULL DEFAULT false,
  reconciled_at         TIMESTAMPTZ,
  source_table          TEXT,                       -- e.g. 'cost_submissions', 'down_payments'
  source_id             UUID,
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pf_transactions_fund    ON pre_fund_transactions(pre_fund_request_id);
CREATE INDEX IF NOT EXISTS idx_pf_transactions_date    ON pre_fund_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_pf_transactions_source  ON pre_fund_transactions(source_table, source_id);

-- ─── 6. Period reconciliations ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pre_fund_reconciliations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_fund_request_id      UUID NOT NULL REFERENCES pre_fund_requests(id) ON DELETE CASCADE,
  period_start             DATE,
  period_end               DATE,
  total_funded             NUMERIC(20,4) NOT NULL DEFAULT 0,
  total_paid               NUMERIC(20,4) NOT NULL DEFAULT 0,
  total_committed          NUMERIC(20,4) NOT NULL DEFAULT 0,
  variance                 NUMERIC(20,4) NOT NULL DEFAULT 0,   -- available surplus at close
  surplus_action           TEXT NOT NULL DEFAULT 'carry_forward'
                           CHECK (surplus_action IN ('carry_forward','return','split','reserve')),
  carry_forward_amount     NUMERIC(20,4) NOT NULL DEFAULT 0,
  return_amount            NUMERIC(20,4) NOT NULL DEFAULT 0,
  reserve_amount           NUMERIC(20,4) NOT NULL DEFAULT 0,
  status                   TEXT NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open','closed')),
  closed_at                TIMESTAMPTZ,
  closed_by                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  pdf_url                  TEXT,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pf_recons_fund ON pre_fund_reconciliations(pre_fund_request_id);

-- ─── 7. Row Level Security ────────────────────────────────────────────────────

ALTER TABLE pre_fund_period_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_fund_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_fund_requests          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_fund_approval_steps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_fund_transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_fund_reconciliations   ENABLE ROW LEVEL SECURITY;

-- Policy helper: check role in profiles table
-- Adjust the table/column names to match your actual profiles schema.

-- Period types: everyone can read; only finance/admin can write
CREATE POLICY "pf_period_types_read"  ON pre_fund_period_types FOR SELECT USING (true);
CREATE POLICY "pf_period_types_write" ON pre_fund_period_types FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin','financialAdmin','countryDirector')) );

-- Settings: finance/admin only
CREATE POLICY "pf_settings_finance"   ON pre_fund_settings FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin','financialAdmin')) );

-- Fund requests: finance/admin/countryDirector can see and write
CREATE POLICY "pf_requests_access"    ON pre_fund_requests FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin','financialAdmin','countryDirector')) );

-- Approval steps: same access
CREATE POLICY "pf_steps_access"       ON pre_fund_approval_steps FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin','financialAdmin','countryDirector')) );

-- Transactions: same access
CREATE POLICY "pf_transactions_access" ON pre_fund_transactions FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin','financialAdmin','countryDirector')) );

-- Reconciliations: same access
CREATE POLICY "pf_recons_access"      ON pre_fund_reconciliations FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin','financialAdmin','countryDirector')) );

-- ─── 8. Auto-update updated_at trigger ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_pre_fund_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_pre_fund_requests_updated_at
    BEFORE UPDATE ON pre_fund_requests
    FOR EACH ROW EXECUTE FUNCTION update_pre_fund_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_pre_fund_settings_updated_at
    BEFORE UPDATE ON pre_fund_settings
    FOR EACH ROW EXECUTE FUNCTION update_pre_fund_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 9. GL Bridge account code (add to CoA if not exists) ────────────────────
-- Account 2400 — Pre-Fund Liability (deferred pre-fund liability)
-- Account 2401 — Pre-Fund Liability (Next Period) for carry-forward
-- These are soft-created; skip if your CoA already has them.
INSERT INTO acct_accounts (code, name, type, normal_balance, is_active, description)
VALUES
  ('2400', 'Pre-Fund Liability',             'liability', 'CR', true, 'Deferred liability for incoming pre-funds not yet expended'),
  ('2401', 'Pre-Fund Liability (Next Period)','liability', 'CR', true, 'Carry-forward pre-fund liability for next period')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- Migration complete. Open /pre-funding in the app to get started.
-- Verify by running: SELECT COUNT(*) FROM pre_fund_period_types;
-- Expected: 7 (the built-in period types)
-- ============================================================================

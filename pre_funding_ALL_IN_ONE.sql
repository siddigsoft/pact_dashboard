-- ============================================================================
-- PACT Command Center — Pre-Funding Management System
-- Migration: pre_funding_migration.sql
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Apply once. Safe to re-run (uses IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- ============================================================================

-- ─── 0. Extensions ───────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. Period type definitions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pre_fund_period_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  day_count       INTEGER,                   -- NULL = flexible / project-duration
  is_builtin      BOOLEAN NOT NULL DEFAULT false,
  display_order   INTEGER NOT NULL DEFAULT 99,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint on name — prevents duplicate period types on re-run
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pf_period_types_name_unique'
      AND conrelid = 'pre_fund_period_types'::regclass
  ) THEN
    ALTER TABLE pre_fund_period_types ADD CONSTRAINT pf_period_types_name_unique UNIQUE (name);
  END IF;
END $$;

-- Remove any duplicate rows from previous runs (keep lowest display_order per name)
DELETE FROM pre_fund_period_types
WHERE id NOT IN (
  SELECT DISTINCT ON (name) id
  FROM pre_fund_period_types
  ORDER BY name, display_order, created_at
);

-- Seed built-in period types (idempotent — UNIQUE(name) prevents re-insertion)
INSERT INTO pre_fund_period_types (name, day_count, is_builtin, display_order) VALUES
  ('Weekly',           7,    true, 1),
  ('Bi-weekly',        14,   true, 2),
  ('Monthly',          30,   true, 3),
  ('Quarterly',        90,   true, 4),
  ('Annual',           365,  true, 5),
  ('Project Duration', NULL, true, 6),
  ('Custom',           NULL, true, 7)
ON CONFLICT (name) DO NOTHING;

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
  bank_api_key_hint           TEXT,              -- only last 4 chars, never the full key
  bank_api_key_encrypted      BYTEA,             -- pgcrypto-encrypted full key (server-only)
  integration_bank_recon      BOOLEAN NOT NULL DEFAULT true,
  integration_cashflow         BOOLEAN NOT NULL DEFAULT true,
  integration_encumbrance      BOOLEAN NOT NULL DEFAULT true,
  default_renewal_mode        TEXT NOT NULL DEFAULT 'off'
                              CHECK (default_renewal_mode IN ('off','auto_draft','auto_activate')),
  -- Default GL account codes (pre-populate new fund requests; resolved to IDs by the bridge engine)
  default_gl_receipt_account  TEXT NOT NULL DEFAULT '1200',
  default_gl_liability_account TEXT NOT NULL DEFAULT '2400',
  default_gl_expense_account  TEXT NOT NULL DEFAULT '7000',
  default_gl_cf_account       TEXT NOT NULL DEFAULT '2401',
  -- Default notification recipients (array of profile UUIDs for alerts)
  default_notification_recipients JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- Default matching scope for bank feed matching
  default_matching_scope      TEXT NOT NULL DEFAULT 'global'
                              CHECK (default_matching_scope IN ('global','project','country')),
  -- Reconciliation action toggles
  reconciliation_action_return    BOOLEAN NOT NULL DEFAULT true,
  reconciliation_action_carry_fwd BOOLEAN NOT NULL DEFAULT true,
  reconciliation_action_reserve   BOOLEAN NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure only one settings row ever exists (singleton constraint)
ALTER TABLE pre_fund_settings
  ADD COLUMN IF NOT EXISTS singleton_lock BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE pre_fund_settings
  DROP CONSTRAINT IF EXISTS pre_fund_settings_singleton;
ALTER TABLE pre_fund_settings
  ADD CONSTRAINT pre_fund_settings_singleton UNIQUE (singleton_lock);

INSERT INTO pre_fund_settings (singleton_lock) VALUES (TRUE)
ON CONFLICT (singleton_lock) DO NOTHING;

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
                        CHECK (status IN ('draft','pending_approval','awaiting_receipt','active','low_balance','closed','period_locked','pending_grace')),
  grace_expires_at      TIMESTAMPTZ,               -- set on auto_activate renewals; Finance can cancel before this timestamp
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
  auto_renewal_bypass_approvals BOOLEAN NOT NULL DEFAULT false,
  low_balance_alert     BOOLEAN NOT NULL DEFAULT false,
  ending_soon_alert     BOOLEAN NOT NULL DEFAULT false,
  receipt_url           TEXT,
  activated_at          TIMESTAMPTZ,
  notes                 TEXT,
  -- GL account mapping (COA codes resolved per fund; bridge engine uses these at posting time)
  gl_receipt_account    TEXT NOT NULL DEFAULT '1200',    -- DR on receipt (cash/bank account)
  gl_liability_account  TEXT NOT NULL DEFAULT '2400',    -- CR on receipt, DR on payment (deferred liability)
  gl_expense_account    TEXT NOT NULL DEFAULT '5600',    -- CR on payment (programme expense)
  gl_cf_account         TEXT NOT NULL DEFAULT '2401',    -- CR on carry-forward (next-period liability)
  -- Notification recipients (JSONB array of profile UUIDs for renewal/low-balance alerts)
  notification_recipients JSONB NOT NULL DEFAULT '[]',
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
  assigned_user_ids        UUID[] NOT NULL DEFAULT '{}',   -- multi-user: all assignees for this step
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

-- Add multi-user array column to existing installations
ALTER TABLE pre_fund_approval_steps
  ADD COLUMN IF NOT EXISTS assigned_user_ids UUID[] NOT NULL DEFAULT '{}';

-- Back-fill: copy legacy single assigned_user_id into the array for existing rows
UPDATE pre_fund_approval_steps
  SET assigned_user_ids = ARRAY[assigned_user_id]
WHERE assigned_user_id IS NOT NULL
  AND (assigned_user_ids IS NULL OR assigned_user_ids = '{}');

-- Add quorum column (how many of the assigned users must approve)
ALTER TABLE pre_fund_approval_steps
  ADD COLUMN IF NOT EXISTS required_approvals INTEGER NOT NULL DEFAULT 1;

-- Back-fill: single-user steps get required_approvals = 1
UPDATE pre_fund_approval_steps
  SET required_approvals = 1
WHERE required_approvals IS NULL OR required_approvals < 1;

-- ─── 4b. Per-step individual vote log ─────────────────────────────────────────
-- Tracks each user's vote on a step; enables M-of-N quorum logic.
CREATE TABLE IF NOT EXISTS pre_fund_step_approvals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id     UUID NOT NULL REFERENCES pre_fund_approval_steps(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL CHECK (action IN ('approved', 'rejected')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (step_id, user_id)   -- one vote per user per step (upsert-safe)
);

CREATE INDEX IF NOT EXISTS idx_pf_step_votes_step ON pre_fund_step_approvals(step_id);
CREATE INDEX IF NOT EXISTS idx_pf_step_votes_user ON pre_fund_step_approvals(user_id);

ALTER TABLE IF EXISTS pre_fund_step_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pf_step_votes_read"   ON pre_fund_step_approvals;
DROP POLICY IF EXISTS "pf_step_votes_insert"  ON pre_fund_step_approvals;
DROP POLICY IF EXISTS "pf_step_votes_update"  ON pre_fund_step_approvals;

-- Anyone involved with the fund (creator, assignee, admin) can read votes
CREATE POLICY "pf_step_votes_read" ON pre_fund_step_approvals
  FOR SELECT USING (
    -- The vote belongs to the current user
    user_id = auth.uid()
    OR
    -- The current user is an admin/finance role
    LOWER((auth.jwt() -> 'user_metadata' ->> 'role')) IN (
      'super_admin','superadmin','admin','financialadmin','financial_admin'
    )
    OR
    -- The current user created the fund this step belongs to
    EXISTS (
      SELECT 1 FROM pre_fund_approval_steps s
      JOIN pre_fund_requests r ON r.id = s.pre_fund_request_id
      WHERE s.id = pre_fund_step_approvals.step_id
        AND r.created_by = auth.uid()
    )
    OR
    -- The current user is assigned to the step (single-user or multi-user)
    EXISTS (
      SELECT 1 FROM pre_fund_approval_steps s
      WHERE s.id = pre_fund_step_approvals.step_id
        AND (
          s.assigned_user_id = auth.uid()
          OR s.assigned_user_ids @> ARRAY[auth.uid()]
        )
    )
  );

-- Users can only insert their own vote
CREATE POLICY "pf_step_votes_insert" ON pre_fund_step_approvals
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can only update their own vote
CREATE POLICY "pf_step_votes_update" ON pre_fund_step_approvals
  FOR UPDATE USING (user_id = auth.uid());

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
  -- GL Bridge linkage
  encumbrance_id        UUID,                       -- FK to acct_budget_encumbrances.id (if exists)
  gl_entry_id           UUID,                       -- FK to acct_journal_entries.id (if exists)
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
  pdf_url                  TEXT,                               -- Supabase Storage URL of the donor PDF
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pf_recons_fund ON pre_fund_reconciliations(pre_fund_request_id);

-- ─── 7. Bank feed unmatched queue ─────────────────────────────────────────────
-- Stores incoming bank statement lines that could not be auto-matched to a fund.
-- Finance reviews and manually links or dismisses these.
CREATE TABLE IF NOT EXISTS pre_fund_bank_unmatched (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_reference    TEXT,
  amount           NUMERIC(20,4) NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'USD',
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description      TEXT,
  matched_fund_id  UUID REFERENCES pre_fund_requests(id) ON DELETE SET NULL,
  match_status     TEXT NOT NULL DEFAULT 'unmatched'
                   CHECK (match_status IN ('unmatched','matched','dismissed')),
  reviewed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  source_payload   JSONB,                           -- raw API response for audit
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pf_bank_unmatched_status ON pre_fund_bank_unmatched(match_status);

-- ─── 8. Cross-system FK columns (ALTER existing tables safely) ────────────────
-- These add pre-fund linkage to existing operational tables.
-- Each ALTER uses IF NOT EXISTS to be idempotent.

DO $$ BEGIN
  ALTER TABLE operational_cost_submissions ADD COLUMN IF NOT EXISTS pre_fund_transaction_id UUID REFERENCES pre_fund_transactions(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE down_payment_requests ADD COLUMN IF NOT EXISTS pre_fund_transaction_id UUID REFERENCES pre_fund_transactions(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE acct_budget_encumbrances ADD COLUMN IF NOT EXISTS pre_fund_transaction_id UUID REFERENCES pre_fund_transactions(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE acct_bank_statement_lines ADD COLUMN IF NOT EXISTS pre_fund_request_id UUID REFERENCES pre_fund_requests(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ─── 8b. Add approval/rejection tracking columns to pre_fund_requests ─────────
ALTER TABLE pre_fund_requests
  ADD COLUMN IF NOT EXISTS approved_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Expand status CHECK to include 'rejected' (safe idempotent via DROP IF EXISTS + re-add)
ALTER TABLE pre_fund_requests
  DROP CONSTRAINT IF EXISTS pre_fund_requests_status_check;
ALTER TABLE pre_fund_requests
  ADD CONSTRAINT pre_fund_requests_status_check
  CHECK (status IN ('draft','pending_approval','awaiting_receipt','active','low_balance',
                    'closed','period_locked','pending_grace','rejected'));

-- ─── 9. Row Level Security ────────────────────────────────────────────────────
ALTER TABLE pre_fund_period_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_fund_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_fund_requests          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_fund_approval_steps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_fund_transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_fund_reconciliations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_fund_bank_unmatched    ENABLE ROW LEVEL SECURITY;

-- ── DROP before CREATE so the migration is safely re-runnable ──────────────
DROP POLICY IF EXISTS "pf_period_types_finance"      ON pre_fund_period_types;
DROP POLICY IF EXISTS "pf_settings_finance"           ON pre_fund_settings;
DROP POLICY IF EXISTS "pf_requests_finance"           ON pre_fund_requests;
DROP POLICY IF EXISTS "pf_requests_step_assignee"     ON pre_fund_requests;
DROP POLICY IF EXISTS "pf_steps_finance"              ON pre_fund_approval_steps;
DROP POLICY IF EXISTS "pf_steps_assignee_select"      ON pre_fund_approval_steps;
DROP POLICY IF EXISTS "pf_steps_assignee_update"      ON pre_fund_approval_steps;
DROP POLICY IF EXISTS "pf_transactions_finance"       ON pre_fund_transactions;
DROP POLICY IF EXISTS "pf_transactions_assignee_read" ON pre_fund_transactions;
DROP POLICY IF EXISTS "pf_recons_finance"             ON pre_fund_reconciliations;
DROP POLICY IF EXISTS "pf_bank_unmatched_access"      ON pre_fund_bank_unmatched;

-- ── Helper: is the current user a finance/admin role? ──────────────────────
-- Used inline so we don't need a separate function.
-- Roles: super_admin, superadmin, admin, financialadmin

-- Period types: Finance/Admin/Super Admin ONLY
CREATE POLICY "pf_period_types_finance" ON pre_fund_period_types FOR ALL
  USING ( EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')
  ));

-- Settings: Finance/Admin/Super Admin ONLY — configuration is finance-sensitive
CREATE POLICY "pf_settings_finance" ON pre_fund_settings FOR ALL
  USING ( EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')
  ));

-- Fund requests ─────────────────────────────────────────────────────────────
-- Finance/Admin: full CRUD
CREATE POLICY "pf_requests_finance" ON pre_fund_requests FOR ALL
  USING ( EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')
  ));

-- Step assignees: SELECT only — needed so ApprovalsHub can show fund context
-- Matches both legacy single-user (assigned_user_id) and multi-user (assigned_user_ids[])
CREATE POLICY "pf_requests_step_assignee" ON pre_fund_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pre_fund_approval_steps s
      WHERE s.pre_fund_request_id = pre_fund_requests.id
        AND (
          s.assigned_user_id = auth.uid()
          OR s.assigned_user_ids @> ARRAY[auth.uid()]
        )
    )
  );

-- Approval steps ─────────────────────────────────────────────────────────────
-- Finance/Admin: full CRUD (manage chains, reorder, delete)
CREATE POLICY "pf_steps_finance" ON pre_fund_approval_steps FOR ALL
  USING ( EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')
  ));

-- Step assignees: SELECT — see their own step(s)
CREATE POLICY "pf_steps_assignee_select" ON pre_fund_approval_steps FOR SELECT
  USING (
    assigned_user_id = auth.uid()
    OR assigned_user_ids @> ARRAY[auth.uid()]
  );

-- Step assignees: UPDATE — approve / reject / add notes on their own step(s)
CREATE POLICY "pf_steps_assignee_update" ON pre_fund_approval_steps FOR UPDATE
  USING (
    assigned_user_id = auth.uid()
    OR assigned_user_ids @> ARRAY[auth.uid()]
  );

-- Transactions ────────────────────────────────────────────────────────────────
-- Finance/Admin: full CRUD
CREATE POLICY "pf_transactions_finance" ON pre_fund_transactions FOR ALL
  USING ( EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')
  ));

-- Step assignees: SELECT only (e.g. to verify deductions on their approval step)
CREATE POLICY "pf_transactions_assignee_read" ON pre_fund_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pre_fund_approval_steps s
      WHERE s.pre_fund_request_id = pre_fund_transactions.pre_fund_request_id
        AND (
          s.assigned_user_id = auth.uid()
          OR s.assigned_user_ids @> ARRAY[auth.uid()]
        )
    )
  );

-- Reconciliations: Finance/Admin/Super Admin ONLY
CREATE POLICY "pf_recons_finance" ON pre_fund_reconciliations FOR ALL
  USING ( EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')
  ));

-- Bank unmatched queue: Finance/Admin ONLY
CREATE POLICY "pf_bank_unmatched_access" ON pre_fund_bank_unmatched FOR ALL
  USING ( EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')
  ));

-- ─── 10. Auto-update updated_at trigger ──────────────────────────────────────
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

-- ─── 11. Encrypted bank API key RPC ──────────────────────────────────────────
-- Called from the UI when saving a new bank API key.
-- The key is encrypted with pgp_sym_encrypt using a per-deploy secret.
-- The UI never receives the key back; only the hint is returned by SELECT.
-- IMPORTANT: Replace 'pact_bank_key_passphrase' below with your actual secret,
--            or set it via: ALTER DATABASE postgres SET app.bank_key_passphrase = '...';

CREATE OR REPLACE FUNCTION store_pre_fund_bank_key(
  p_settings_id UUID,
  p_key         TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_passphrase TEXT;
BEGIN
  -- Caller must be Finance/Admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges to store bank API key';
  END IF;

  -- Resolve passphrase from DB setting (set once per deploy via ALTER DATABASE).
  -- Hard-fail if not configured — no fallback to JWT secret or any other secret material.
  -- Key separation is critical: encryption passphrase must be independent of auth secrets.
  v_passphrase := current_setting('app.bank_key_passphrase', true);
  IF v_passphrase IS NULL OR v_passphrase = '' THEN
    RAISE EXCEPTION
      'app.bank_key_passphrase is not configured. '
      'Run: ALTER DATABASE postgres SET app.bank_key_passphrase = ''your-strong-secret''; '
      'Do NOT reuse any JWT secret or auth token as this passphrase.';
  END IF;

  UPDATE pre_fund_settings
  SET bank_api_key_encrypted = pgp_sym_encrypt(p_key, v_passphrase),
      bank_api_key_hint      = '...' || RIGHT(p_key, 4),
      updated_at             = now()
  WHERE id = p_settings_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settings row not found';
  END IF;
END;
$$;

-- Grant execute to authenticated users (RLS inside the function gates by role)
GRANT EXECUTE ON FUNCTION store_pre_fund_bank_key(UUID, TEXT) TO authenticated;

-- ─── 12. GL Bridge account code (add to CoA if not exists) ───────────────────
-- Account 2400 — Pre-Fund Liability (deferred pre-fund liability)
-- Account 2401 — Pre-Fund Liability (Next Period) for carry-forward
-- These are soft-created; skip if your CoA already has them.
INSERT INTO acct_accounts (code, name_en, name_ar, account_type, subtype, is_postable)
SELECT '2400', 'Pre-Fund Liability', 'التزام التمويل المسبق', 'liability', 'current_liability', true
WHERE NOT EXISTS (SELECT 1 FROM acct_accounts WHERE code = '2400');

INSERT INTO acct_accounts (code, name_en, name_ar, account_type, subtype, is_postable)
SELECT '2401', 'Pre-Fund Liability (Next Period)', 'التزام التمويل المسبق (الفترة التالية)', 'liability', 'current_liability', true
WHERE NOT EXISTS (SELECT 1 FROM acct_accounts WHERE code = '2401');

-- ─── 13. Auto-renewal scheduler stub (run via pg_cron or Supabase Edge Function) ──
-- This function is called by a nightly pg_cron job or Supabase Edge Function scheduler.
-- It finds funds within their warning window and sets ending_soon_alert = true.
-- Actual notification delivery uses the existing notification_events table.
CREATE OR REPLACE FUNCTION run_pre_fund_renewal_check()
RETURNS TABLE(fund_id UUID, fund_name TEXT, action TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role        TEXT;
  r                 RECORD;
  v_receipt_acct_id UUID;
  v_liab_acct_id    UUID;
  v_je_id           UUID;
  v_ik              TEXT;
BEGIN
  -- Role guard: only service_role (pg_cron / Edge Function scheduler) or postgres
  -- superuser may call this function.  Blank JWT role and 'authenticated' are
  -- explicitly rejected — no regular user or unauthenticated caller may invoke it.
  v_jwt_role := coalesce(current_setting('request.jwt.claims.role', true), '');
  IF v_jwt_role NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'run_pre_fund_renewal_check: unauthorized caller (role="%"). Must be service_role or postgres.', v_jwt_role;
  END IF;
  -- Mark funds ending within warning_days as ending_soon
  UPDATE pre_fund_requests
  SET ending_soon_alert = true, updated_at = now()
  WHERE status IN ('active','low_balance')
    AND end_date IS NOT NULL
    AND end_date <= (CURRENT_DATE + (warning_days || ' days')::INTERVAL)
    AND ending_soon_alert = false;

  -- Mark funds with available_balance below threshold as low_balance
  UPDATE pre_fund_requests
  SET status = 'low_balance', low_balance_alert = true, updated_at = now()
  WHERE status = 'active'
    AND threshold_pct IS NOT NULL
    AND amount > 0
    AND (available_balance / amount * 100) <= threshold_pct;

  -- Auto-draft renewal for eligible funds (auto_renewal_mode = 'auto_draft')
  -- Creates a new draft fund request copying key fields from the expiring fund
  INSERT INTO pre_fund_requests (
    name, source, amount, currency, period_type_id, period_type_name,
    country_id, project_id, grant_id, matching_scope,
    threshold_pct, threshold_amount, warning_days, auto_renewal_mode, auto_renewal_days_before,
    gl_receipt_account, gl_liability_account, gl_expense_account, gl_cf_account,
    notification_recipients, notes, status, available_balance, committed_amount, paid_amount,
    start_date, end_date
  )
  SELECT
    name || ' (Renewal)', source, amount, currency, period_type_id, period_type_name,
    country_id, project_id, grant_id, matching_scope,
    threshold_pct, threshold_amount, warning_days, auto_renewal_mode, auto_renewal_days_before,
    gl_receipt_account, gl_liability_account, gl_expense_account, gl_cf_account,
    notification_recipients,
    'Auto-renewed from fund id: ' || id::text,
    'draft', 0, 0, 0,
    end_date + 1,
    end_date + 1 + COALESCE(
      (SELECT day_count FROM pre_fund_period_types WHERE id = period_type_id), 30
    )
  FROM pre_fund_requests
  WHERE status IN ('active','low_balance')
    AND auto_renewal_mode = 'auto_draft'
    AND end_date IS NOT NULL
    AND end_date <= (CURRENT_DATE + COALESCE(auto_renewal_days_before, 7))
    AND NOT EXISTS (
      SELECT 1 FROM pre_fund_requests r2
      WHERE r2.notes LIKE '%Auto-renewed from fund id: ' || pre_fund_requests.id::text || '%'
        AND r2.status = 'draft'
    );

  -- ── Auto-activate renewal for eligible funds (auto_renewal_mode = 'auto_activate') ──
  -- When auto_renewal_bypass_approvals = TRUE  → create directly as 'active' (no grace window).
  -- When auto_renewal_bypass_approvals = FALSE → create as 'pending_grace'; Finance can cancel
  --   within the configured grace window before it goes live.
  --
  -- GL side-effect: for funds inserted as 'active' (bypass=true), we post the same
  -- pre_fund_received JE + bridge log that activate_pre_fund_rpc posts on manual activation.
  -- Idempotency key suffix '-autorenewal' prevents double-posting on scheduler re-runs.
  FOR r IN
    INSERT INTO pre_fund_requests (
      name, source, amount, currency, period_type_id, period_type_name,
      country_id, project_id, grant_id, matching_scope,
      threshold_pct, threshold_amount, warning_days, auto_renewal_mode, auto_renewal_days_before,
      auto_renewal_bypass_approvals,
      gl_receipt_account, gl_liability_account, gl_expense_account, gl_cf_account,
      notification_recipients, notes,
      status, available_balance, committed_amount, paid_amount,
      activated_at,
      start_date, end_date, grace_expires_at
    )
    SELECT
      name || ' (Auto-Renewal)', source, amount, currency, period_type_id, period_type_name,
      country_id, project_id, grant_id, matching_scope,
      threshold_pct, threshold_amount, warning_days, auto_renewal_mode, auto_renewal_days_before,
      auto_renewal_bypass_approvals,
      gl_receipt_account, gl_liability_account, gl_expense_account, gl_cf_account,
      notification_recipients,
      'Auto-activated from fund id: ' || id::text || '; actor=system',
      -- Status: bypass=true → active immediately; bypass=false → pending_grace
      CASE WHEN auto_renewal_bypass_approvals THEN 'active' ELSE 'pending_grace' END,
      -- available_balance: pre-set only when activating immediately
      CASE WHEN auto_renewal_bypass_approvals THEN amount ELSE 0 END,
      0, 0,
      -- activated_at: set now only for immediate activation
      CASE WHEN auto_renewal_bypass_approvals THEN now() ELSE NULL END,
      end_date + 1,
      end_date + 1 + COALESCE(
        (SELECT day_count FROM pre_fund_period_types WHERE id = period_type_id), 30
      ),
      -- grace_expires_at: only meaningful for pending_grace path
      CASE WHEN auto_renewal_bypass_approvals THEN NULL
           ELSE now() + ((SELECT COALESCE(auto_renewal_grace_hours, 24) FROM pre_fund_settings LIMIT 1) || ' hours')::INTERVAL
      END
    FROM pre_fund_requests
    WHERE status IN ('active','low_balance')
      AND auto_renewal_mode = 'auto_activate'
      AND end_date IS NOT NULL
      AND end_date <= (CURRENT_DATE + COALESCE(auto_renewal_days_before, 7))
      AND NOT EXISTS (
        SELECT 1 FROM pre_fund_requests r2
        WHERE r2.notes LIKE '%Auto-activated from fund id: ' || pre_fund_requests.id::text || '%'
          AND r2.status IN ('draft','pending_grace','active')
      )
    RETURNING id, name, amount, currency, gl_receipt_account, gl_liability_account, status
  LOOP
    -- Post GL only for funds that were inserted as immediately active (bypass=true)
    IF r.status = 'active' THEN
      SELECT id INTO v_receipt_acct_id FROM acct_accounts WHERE code = r.gl_receipt_account LIMIT 1;
      SELECT id INTO v_liab_acct_id    FROM acct_accounts WHERE code = r.gl_liability_account LIMIT 1;

      IF v_receipt_acct_id IS NOT NULL AND v_liab_acct_id IS NOT NULL THEN
        v_ik := 'pf-received-' || r.id::TEXT || '-autorenewal';

        -- Idempotency guard: skip if already posted (scheduler re-run safety)
        IF NOT EXISTS (SELECT 1 FROM acct_journal_entries WHERE idempotency_key = v_ik) THEN
          INSERT INTO acct_journal_entries (
            description_en, description_ar, posting_date, status,
            source_type, source_id, idempotency_key, created_by
          ) VALUES (
            'Pre-Fund Auto-Renewed — ' || r.name,
            'تجديد التمويل المسبق تلقائياً — ' || r.name,
            CURRENT_DATE, 'draft',
            'pre_fund_requests', r.id, v_ik, NULL
          ) RETURNING id INTO v_je_id;

          INSERT INTO acct_journal_lines (entry_id, line_no, account_id, debit_credit,
            original_amount, original_currency, functional_amount, functional_currency,
            description, function)
          VALUES
            (v_je_id, 1, v_receipt_acct_id, 'DR',
             r.amount, r.currency, r.amount, r.currency,
             'Pre-fund auto-renewal receipt — ' || r.name, 'program'),
            (v_je_id, 2, v_liab_acct_id, 'CR',
             r.amount, r.currency, r.amount, r.currency,
             'Pre-fund auto-renewal liability — ' || r.name, 'program');

          INSERT INTO acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
          VALUES ('pre_fund_requests', r.id, 'pre_fund_received', 'success', v_je_id);
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- Step 2: Activate any pending_grace renewals whose grace window has expired
  --         (grace_expires_at < now() means Finance did not cancel in time).
  -- GL side-effect: post pre_fund_received JE + bridge log for each newly activated fund.
  -- Idempotency key suffix '-grace-activated' prevents double-posting on re-runs.
  FOR r IN
    UPDATE pre_fund_requests
    SET status = 'active',
        available_balance = amount,
        activated_at = now(),
        updated_at = now()
    WHERE status = 'pending_grace'
      AND grace_expires_at IS NOT NULL
      AND grace_expires_at < now()
    RETURNING id, name, amount, currency, gl_receipt_account, gl_liability_account
  LOOP
    SELECT id INTO v_receipt_acct_id FROM acct_accounts WHERE code = r.gl_receipt_account LIMIT 1;
    SELECT id INTO v_liab_acct_id    FROM acct_accounts WHERE code = r.gl_liability_account LIMIT 1;

    IF v_receipt_acct_id IS NOT NULL AND v_liab_acct_id IS NOT NULL THEN
      v_ik := 'pf-received-' || r.id::TEXT || '-grace-activated';

      IF NOT EXISTS (SELECT 1 FROM acct_journal_entries WHERE idempotency_key = v_ik) THEN
        INSERT INTO acct_journal_entries (
          description_en, description_ar, posting_date, status,
          source_type, source_id, idempotency_key, created_by
        ) VALUES (
          'Pre-Fund Activated (Grace Period Expired) — ' || r.name,
          'تفعيل التمويل (انتهاء فترة السماح) — ' || r.name,
          CURRENT_DATE, 'draft',
          'pre_fund_requests', r.id, v_ik, NULL
        ) RETURNING id INTO v_je_id;

        INSERT INTO acct_journal_lines (entry_id, line_no, account_id, debit_credit,
          original_amount, original_currency, functional_amount, functional_currency,
          description, function)
        VALUES
          (v_je_id, 1, v_receipt_acct_id, 'DR',
           r.amount, r.currency, r.amount, r.currency,
           'Pre-fund grace-activation receipt — ' || r.name, 'program'),
          (v_je_id, 2, v_liab_acct_id, 'CR',
           r.amount, r.currency, r.amount, r.currency,
           'Pre-fund grace-activation liability — ' || r.name, 'program');

        INSERT INTO acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
        VALUES ('pre_fund_requests', r.id, 'pre_fund_received', 'success', v_je_id);
      END IF;
    END IF;
  END LOOP;

  -- Notify Finance team of any auto-activations that just fired (immediate bypass OR grace-expired)
  INSERT INTO notification_events (event_type, reference_type, title, message, target_roles, metadata)
  SELECT
    'pre_fund_auto_activated',
    'pre_fund_request',
    'Pre-Fund Auto-Activated',
    CASE
      WHEN auto_renewal_bypass_approvals
        THEN 'Fund "' || name || '" was automatically activated immediately (bypass approvals enabled). Actor: system.'
      ELSE 'Fund "' || name || '" was automatically activated after the grace window expired. Actor: system.'
    END,
    '["super_admin","admin","financialAdmin"]'::JSONB,
    jsonb_build_object(
      'fund_id', id, 'amount', amount, 'currency', currency,
      'actor', 'system',
      'bypass_approvals', auto_renewal_bypass_approvals
    )
  FROM pre_fund_requests
  WHERE status = 'active'
    AND activated_at >= now() - INTERVAL '1 minute'
    AND notes LIKE '%Auto-activated from fund id:%'
    AND notes LIKE '%actor=system%';

  RETURN QUERY
    SELECT id, name, 'ending_soon_check'::TEXT
    FROM pre_fund_requests
    WHERE ending_soon_alert = true AND status IN ('active','low_balance');
END;
$$;

-- Restrict to service_role/pg_cron scheduler ONLY — never callable by regular authenticated users
REVOKE ALL ON FUNCTION run_pre_fund_renewal_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION run_pre_fund_renewal_check() FROM authenticated;
GRANT EXECUTE ON FUNCTION run_pre_fund_renewal_check() TO service_role;

-- ============================================================================
-- Migration complete. Open /pre-funding in the app to get started.
-- Verify by running: SELECT COUNT(*) FROM pre_fund_period_types;
-- Expected: 7 (the built-in period types)
--
-- Post-migration steps:
-- 1. Set the bank key passphrase:
--    ALTER DATABASE postgres SET app.bank_key_passphrase = 'your-strong-secret';
-- 2. Schedule the renewal check (pg_cron example):
--    SELECT cron.schedule('pre-fund-renewal-check', '0 6 * * *', 'SELECT run_pre_fund_renewal_check()');
-- 3. Create the financial-documents storage bucket if not already present.
-- ============================================================================
-- ============================================================================
-- PRE-FUNDING ATOMIC RPCs
--
-- Design principles:
--   1. SECURITY DEFINER — these functions run as the DB owner, bypassing the
--      caller's RLS.  Authorization is enforced EXPLICITLY via _assert_finance_role()
--      inside each function; do NOT rely on RLS policies for access control here.
--   2. Explicit caller-role guard inside every function — raises if the
--      authenticated user is not finance/admin/super-admin.
--   3. SET search_path = public — prevents search-path injection.
--   4. All writes run in a single PL/pgSQL block so Postgres rolls back
--      everything on any exception — no partial state.
--
-- Apply via Supabase SQL editor.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- Shared helper: assert the calling user has a finance/admin role.
-- Raises an exception if the check fails — callers do not need to check the
-- return value.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _assert_finance_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT LOWER(role) INTO v_role
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;

  -- Accept all known role spellings used across RLS policies and UI
  IF v_role IS NULL OR v_role NOT IN (
    'super_admin', 'superadmin', 'admin',
    'financialadmin', 'financial_admin', 'financialadmin',
    'financialAdmin'
  ) THEN
    RAISE EXCEPTION 'Access denied: finance or admin role required (role="%").', v_role;
  END IF;
END;
$$;

-- Not callable directly; only invoked from the sibling RPCs below.
REVOKE ALL ON FUNCTION _assert_finance_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION _assert_finance_role() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC 1: activate_pre_fund_rpc
-- Wraps: GL JE + lines + bridge log + fund status/balance update
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION activate_pre_fund_rpc(
  p_fund_id              UUID,
  p_fund_name            TEXT,
  p_amount               NUMERIC,
  p_currency             TEXT,
  p_gl_receipt_code      TEXT,
  p_gl_liability_code    TEXT,
  p_created_by           UUID    DEFAULT NULL,
  p_receipt_url          TEXT    DEFAULT NULL,
  p_idempotency_suffix   TEXT    DEFAULT ''
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt_acct_id  UUID;
  v_liab_acct_id     UUID;
  v_je_id            UUID;
  v_idempotency_key  TEXT;
  v_period_id        UUID;
  v_acct_fund_id     UUID;
  v_bank_acct_id     UUID;
  v_bank_recon_on    BOOLEAN;
BEGIN
  -- Authorization: finance/admin role required
  PERFORM _assert_finance_role();

  -- Resolve current open fiscal period
  SELECT id INTO v_period_id
  FROM acct_fiscal_periods
  WHERE start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE AND status = 'open'
  ORDER BY start_date DESC LIMIT 1;

  IF v_period_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'No open fiscal period for today — open a period in Accounting → Fiscal Years first.');
  END IF;

  -- Resolve first active donor fund (required by acct_journal_lines.fund_id NOT NULL)
  SELECT id INTO v_acct_fund_id FROM acct_funds WHERE is_active = true LIMIT 1;

  IF v_acct_fund_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'No active fund found in Fund Registry — create a fund in Accounting → Funds first.');
  END IF;

  -- Resolve GL account IDs before writing anything
  SELECT id INTO v_receipt_acct_id FROM acct_accounts WHERE code = p_gl_receipt_code LIMIT 1;
  SELECT id INTO v_liab_acct_id    FROM acct_accounts WHERE code = p_gl_liability_code LIMIT 1;

  IF v_receipt_acct_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'GL account not found for code "' || p_gl_receipt_code || '".');
  END IF;
  IF v_liab_acct_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'GL account not found for code "' || p_gl_liability_code || '".');
  END IF;

  v_idempotency_key := 'pf-received-' || p_fund_id::TEXT ||
    CASE WHEN p_idempotency_suffix <> '' THEN '-' || p_idempotency_suffix ELSE '' END;

  -- All writes in one atomic block
  INSERT INTO acct_journal_entries (
    description_en, description_ar, posting_date, period_id, status,
    source_type, source_id, idempotency_key, created_by
  ) VALUES (
    'Pre-Fund Received — ' || p_fund_name || ' activated',
    'استلام التمويل المسبق — ' || p_fund_name,
    CURRENT_DATE, v_period_id, 'draft',
    'pre_fund_requests', p_fund_id, v_idempotency_key, p_created_by
  ) RETURNING id INTO v_je_id;

  INSERT INTO acct_journal_lines (entry_id, line_no, account_id, fund_id, debit_credit,
    original_amount, original_currency, functional_amount, functional_currency,
    description, function)
  VALUES
    (v_je_id, 1, v_receipt_acct_id, v_acct_fund_id, 'DR',
     p_amount, p_currency, p_amount, p_currency,
     'Pre-fund receipt — ' || p_fund_name, 'program'),
    (v_je_id, 2, v_liab_acct_id, v_acct_fund_id, 'CR',
     p_amount, p_currency, p_amount, p_currency,
     'Pre-fund liability deferred — ' || p_fund_name, 'program');

  INSERT INTO acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
  VALUES ('pre_fund_requests', p_fund_id, 'pre_fund_received', 'success', v_je_id);

  UPDATE pre_fund_requests
  SET status            = 'active',
      available_balance = p_amount,
      activated_at      = NOW(),
      receipt_url       = COALESCE(p_receipt_url, receipt_url)
  WHERE id = p_fund_id;

  -- ── Bank statement line (same transaction — atomic with GL and fund update) ──
  -- Only created when bank reconciliation integration is enabled AND a matching
  -- bank account exists for this currency.  Skipped silently if either is absent.
  SELECT COALESCE((integration_bank_recon)::BOOLEAN, true)
  INTO   v_bank_recon_on
  FROM   pre_fund_settings LIMIT 1;

  IF COALESCE(v_bank_recon_on, true) THEN
    SELECT id INTO v_bank_acct_id
    FROM   acct_bank_accounts
    WHERE  currency = p_currency
    LIMIT  1;

    IF v_bank_acct_id IS NOT NULL THEN
      INSERT INTO acct_bank_statement_lines (
        bank_account_id, statement_date, description,
        reference, amount, currency, pre_fund_request_id
      ) VALUES (
        v_bank_acct_id,
        CURRENT_DATE,
        'Pre-fund received: ' || p_fund_name,
        'PF-' || UPPER(LEFT(p_fund_id::TEXT, 8)),
        p_amount,
        p_currency,
        p_fund_id
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'journal_entry_id', v_je_id);
END;
$$;

REVOKE ALL ON FUNCTION activate_pre_fund_rpc(UUID,TEXT,NUMERIC,TEXT,TEXT,TEXT,UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION activate_pre_fund_rpc(UUID,TEXT,NUMERIC,TEXT,TEXT,TEXT,UUID,TEXT,TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC 2: link_payment_atomically_rpc (canonical 11-arg version)
-- Wraps in ONE transaction:
--   pre_fund_transactions insert (with user_id + receipt_url)
--   available_balance deduction + paid_amount increment
--   source row back-link
--   allocation deduction (when fund is allocation-gated and p_user_id provided)
--   GL journal entry + lines + bridge log
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION link_payment_atomically_rpc(
  p_fund_id       UUID,
  p_amount        NUMERIC,
  p_currency      TEXT,
  p_source_table  TEXT,
  p_source_id     UUID,
  p_reference     TEXT    DEFAULT NULL,
  p_description   TEXT    DEFAULT NULL,
  p_payment_date  DATE    DEFAULT CURRENT_DATE,
  p_created_by    UUID    DEFAULT NULL,
  -- New optional params — callers that omit them continue to work unchanged
  p_user_id       UUID    DEFAULT NULL,
  p_receipt_url   TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
-- SECURITY DEFINER bypasses caller RLS; authorization is enforced explicitly
-- via _assert_finance_role() below — not via RLS policies.
SET search_path = public
AS $$
DECLARE
  v_txn_id          UUID;
  v_new_balance     NUMERIC;
  v_cur_balance     NUMERIC;
  v_gl_liab_code    TEXT;
  v_gl_rcpt_code    TEXT;   -- gl_receipt_account = cash/bank (CR leg for disbursement)
  v_liab_id         UUID;
  v_rcpt_id         UUID;
  v_je_id           UUID;
  v_ik              TEXT;
  v_alloc_rows      INT;
  v_alloc_remaining NUMERIC;
BEGIN
  -- Authorization: only finance/admin roles may call this RPC
  PERFORM _assert_finance_role();

  -- Lock the fund row and read balance + GL account codes in one statement
  -- pre_fund_paid double-entry:
  --   DR gl_liability_account  (pre-fund obligation released)
  --   CR gl_receipt_account    (cash/bank outflow — same account debited at activation)
  SELECT available_balance, gl_liability_account, gl_receipt_account
  INTO   v_cur_balance, v_gl_liab_code, v_gl_rcpt_code
  FROM   pre_fund_requests WHERE id = p_fund_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fund not found.');
  END IF;

  IF v_cur_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient pre-fund balance (' || v_cur_balance::TEXT ||
               ' ' || p_currency || ' available; ' || p_amount::TEXT || ' requested).'
    );
  END IF;

  v_new_balance := v_cur_balance - p_amount;

  -- Insert transaction row (user_id = field staff submitter, receipt_url = attachment)
  INSERT INTO pre_fund_transactions (
    pre_fund_request_id, transaction_type, amount, currency,
    reference, description, transaction_date, reconciled,
    source_table, source_id, created_by,
    user_id, receipt_url
  ) VALUES (
    p_fund_id, 'payment', p_amount, p_currency,
    p_reference,
    COALESCE(p_description, 'Auto-linked from ' || p_source_table),
    p_payment_date, false,
    p_source_table, p_source_id, p_created_by,
    COALESCE(p_user_id, p_created_by),
    p_receipt_url
  ) RETURNING id INTO v_txn_id;

  -- Deduct fund balance and increment paid_amount
  UPDATE pre_fund_requests
  SET available_balance = v_new_balance,
      paid_amount       = COALESCE(paid_amount, 0) + p_amount
  WHERE id = p_fund_id;

  -- Back-link source row to this transaction
  IF p_source_table = 'operational_cost_submissions' THEN
    UPDATE operational_cost_submissions
    SET pre_fund_transaction_id = v_txn_id WHERE id = p_source_id;
  ELSIF p_source_table = 'down_payment_requests' THEN
    UPDATE down_payment_requests
    SET pre_fund_transaction_id = v_txn_id WHERE id = p_source_id;
  END IF;

  -- ── Atomic allocation deduction ─────────────────────────────────────────
  -- Only when p_user_id is supplied AND the fund has allocation rows.
  -- Hard-fail if the submitter has no allocation — prevents silent drift.
  IF p_user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pre_fund_allocations
               WHERE pre_fund_request_id = p_fund_id LIMIT 1) THEN
      SELECT allocated_amount - spent_amount
      INTO   v_alloc_remaining
      FROM   pre_fund_allocations
      WHERE  pre_fund_request_id = p_fund_id AND user_id = p_user_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'User has no allocation for this fund. Allocate budget before linking payments.'
        );
      END IF;

      IF v_alloc_remaining < p_amount THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Insufficient personal allocation (' || v_alloc_remaining::TEXT ||
                   ' remaining; ' || p_amount::TEXT || ' requested).'
        );
      END IF;

      UPDATE pre_fund_allocations
      SET spent_amount = spent_amount + p_amount, updated_at = now()
      WHERE pre_fund_request_id = p_fund_id AND user_id = p_user_id;

      GET DIAGNOSTICS v_alloc_rows = ROW_COUNT;
      IF v_alloc_rows = 0 THEN
        RAISE EXCEPTION 'Allocation row vanished between lock and update — rolling back.';
      END IF;
    END IF;
  END IF;

  -- ── GL posting (pre_fund_paid) ───────────────────────────────────────────
  -- DR: gl_liability_account  — releases the pre-fund obligation
  -- CR: gl_receipt_account    — cash/bank outflow (mirrors the DR at activation)
  -- Idempotency key prevents double-posting on retry.
  -- Only fires when both GL codes are configured on the fund.
  IF v_gl_liab_code IS NOT NULL AND v_gl_rcpt_code IS NOT NULL THEN
    SELECT id INTO v_liab_id FROM acct_accounts WHERE code = v_gl_liab_code LIMIT 1;
    SELECT id INTO v_rcpt_id  FROM acct_accounts WHERE code = v_gl_rcpt_code  LIMIT 1;

    IF v_liab_id IS NOT NULL AND v_rcpt_id IS NOT NULL THEN
      v_ik := 'pf-paid-' || p_source_table || '-' || p_source_id::TEXT;

      IF NOT EXISTS (SELECT 1 FROM acct_journal_entries WHERE idempotency_key = v_ik) THEN
        INSERT INTO acct_journal_entries (
          description_en, description_ar, posting_date, status,
          source_type, source_id, idempotency_key, created_by
        ) VALUES (
          'Pre-Fund Disbursement — ' || COALESCE(p_description, p_source_table),
          'صرف التمويل المسبق — '    || COALESCE(p_description, p_source_table),
          p_payment_date, 'draft',
          p_source_table, p_source_id, v_ik, p_created_by
        ) RETURNING id INTO v_je_id;

        INSERT INTO acct_journal_lines (
          entry_id, line_no, account_id, debit_credit,
          original_amount, original_currency, functional_amount, functional_currency,
          description, function
        ) VALUES
          (v_je_id, 1, v_liab_id, 'DR',
           p_amount, p_currency, p_amount, p_currency,
           'Pre-fund disbursement — liability released', 'program'),
          (v_je_id, 2, v_rcpt_id,  'CR',
           p_amount, p_currency, p_amount, p_currency,
           'Pre-fund disbursement — cash/bank outflow', 'program');

        INSERT INTO acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
        VALUES (p_source_table, p_source_id, 'pre_fund_paid', 'success', v_je_id);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_txn_id,
    'new_balance', v_new_balance
  );
END;
$$;

-- Drop the legacy 9-arg overload so PostgREST has a single unambiguous signature.
-- The 11-arg version handles all existing callers via DEFAULT NULL for new params.
DROP FUNCTION IF EXISTS link_payment_atomically_rpc(UUID,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,DATE,UUID);

REVOKE ALL ON FUNCTION link_payment_atomically_rpc(UUID,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,DATE,UUID,UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_payment_atomically_rpc(UUID,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,DATE,UUID,UUID,TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC 3: add_pre_fund_transaction_rpc
-- Wraps: txn insert + optional GL JE + lines + bridge log
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION add_pre_fund_transaction_rpc(
  p_fund_id          UUID,
  p_fund_name        TEXT,
  p_transaction_type TEXT,
  p_amount           NUMERIC,
  p_currency         TEXT,
  p_reference        TEXT    DEFAULT NULL,
  p_description      TEXT    DEFAULT NULL,
  p_transaction_date DATE    DEFAULT CURRENT_DATE,
  p_created_by       UUID    DEFAULT NULL,
  p_gl_debit_code    TEXT    DEFAULT NULL,
  p_gl_credit_code   TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn_id   UUID;
  v_je_id    UUID;
  v_dr_id    UUID;
  v_cr_id    UUID;
  v_gl_event TEXT;
  v_post_gl  BOOLEAN;
BEGIN
  -- Authorization: finance/admin role required
  PERFORM _assert_finance_role();

  v_gl_event := CASE p_transaction_type
    WHEN 'payment'       THEN 'pre_fund_paid'
    WHEN 'commitment'    THEN 'pre_fund_committed'
    WHEN 'carry_forward' THEN 'pre_fund_carry_forward'
    ELSE NULL
  END;

  v_post_gl := (v_gl_event IS NOT NULL
                AND p_gl_debit_code IS NOT NULL
                AND p_gl_credit_code IS NOT NULL);

  INSERT INTO pre_fund_transactions (
    pre_fund_request_id, transaction_type, amount, currency,
    reference, description, transaction_date, reconciled, created_by
  ) VALUES (
    p_fund_id, p_transaction_type, p_amount, p_currency,
    p_reference, p_description, p_transaction_date, false, p_created_by
  ) RETURNING id INTO v_txn_id;

  IF v_post_gl THEN
    SELECT id INTO v_dr_id FROM acct_accounts WHERE code = p_gl_debit_code  LIMIT 1;
    SELECT id INTO v_cr_id FROM acct_accounts WHERE code = p_gl_credit_code LIMIT 1;

    IF v_dr_id IS NULL OR v_cr_id IS NULL THEN
      RAISE EXCEPTION 'GL account not found (DR: %, CR: %)', p_gl_debit_code, p_gl_credit_code;
    END IF;

    INSERT INTO acct_journal_entries (
      description_en, posting_date, status, source_type, source_id,
      idempotency_key, created_by
    ) VALUES (
      'Pre-Fund ' || p_transaction_type || ' — ' || p_fund_name,
      p_transaction_date, 'draft',
      'pre_fund_transactions', v_txn_id,
      'pf-' || p_transaction_type || '-' || v_txn_id::TEXT,
      p_created_by
    ) RETURNING id INTO v_je_id;

    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, debit_credit,
      original_amount, original_currency, functional_amount, functional_currency,
      description, function)
    VALUES
      (v_je_id, 1, v_dr_id, 'DR', p_amount, p_currency, p_amount, p_currency,
       v_gl_event || ' — ' || p_fund_name, 'program'),
      (v_je_id, 2, v_cr_id, 'CR', p_amount, p_currency, p_amount, p_currency,
       v_gl_event || ' — ' || p_fund_name, 'program');

    INSERT INTO acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
    VALUES ('pre_fund_transactions', v_txn_id, v_gl_event, 'success', v_je_id);
  END IF;

  RETURN jsonb_build_object(
    'success',          true,
    'transaction_id',   v_txn_id,
    'journal_entry_id', v_je_id,
    'gl_posted',        v_post_gl
  );
END;
$$;

REVOKE ALL ON FUNCTION add_pre_fund_transaction_rpc(UUID,TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT,DATE,UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_pre_fund_transaction_rpc(UUID,TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT,DATE,UUID,TEXT,TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC 4: close_pre_fund_period_rpc
-- Wraps: recon insert + fund close + GL JEs + bridge logs + optional carry-fwd JE
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION close_pre_fund_period_rpc(
  p_fund_id             UUID,
  p_fund_name           TEXT,
  p_period_start        DATE,
  p_period_end          DATE,
  p_total_funded        NUMERIC,
  p_total_paid          NUMERIC,
  p_total_committed     NUMERIC,
  p_surplus             NUMERIC,
  p_surplus_action      TEXT,
  p_carry_forward_amt   NUMERIC DEFAULT 0,
  p_return_amt          NUMERIC DEFAULT 0,
  p_reserve_amt         NUMERIC DEFAULT 0,
  p_currency            TEXT    DEFAULT 'USD',
  p_notes               TEXT    DEFAULT NULL,
  p_closed_by           UUID    DEFAULT NULL,
  p_gl_liability_code   TEXT    DEFAULT '2400',
  p_gl_receipt_code     TEXT    DEFAULT '1200',
  p_gl_expense_code     TEXT    DEFAULT '5600',
  p_gl_cf_code          TEXT    DEFAULT '2401'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recon_id   UUID;
  v_je_id      UUID;
  v_cf_je_id   UUID;
  v_liab_id    UUID;
  v_bank_id    UUID;
  v_exp_id     UUID;
  v_cf_id      UUID;
  v_variance   NUMERIC;
  v_posting_dt DATE := CURRENT_DATE;
BEGIN
  -- Authorization: finance/admin role required
  PERFORM _assert_finance_role();

  v_variance := GREATEST(0, p_surplus - p_return_amt - p_carry_forward_amt);

  -- Resolve GL account IDs (missing accounts skip those journal lines — non-fatal)
  SELECT id INTO v_liab_id FROM acct_accounts WHERE code = p_gl_liability_code LIMIT 1;
  SELECT id INTO v_bank_id FROM acct_accounts WHERE code = p_gl_receipt_code   LIMIT 1;
  SELECT id INTO v_exp_id  FROM acct_accounts WHERE code = p_gl_expense_code   LIMIT 1;
  SELECT id INTO v_cf_id   FROM acct_accounts WHERE code = p_gl_cf_code        LIMIT 1;

  -- 1. Reconciliation record
  INSERT INTO pre_fund_reconciliations (
    pre_fund_request_id, period_start, period_end,
    total_funded, total_paid, total_committed, variance,
    surplus_action, carry_forward_amount, return_amount, reserve_amount,
    status, closed_at, closed_by, notes
  ) VALUES (
    p_fund_id, p_period_start, p_period_end,
    p_total_funded, p_total_paid, p_total_committed,
    -- v_variance = unallocated remainder after carry-forward and return;
    -- must match the JE logic below (NOT the raw p_surplus total)
    v_variance,
    p_surplus_action, p_carry_forward_amt, p_return_amt, p_reserve_amt,
    'closed', NOW(), p_closed_by, p_notes
  ) RETURNING id INTO v_recon_id;

  -- 2. Close the fund
  UPDATE pre_fund_requests SET status = 'closed' WHERE id = p_fund_id;

  -- 3. Period-close journal entry
  INSERT INTO acct_journal_entries (
    description_en, description_ar, posting_date, status,
    source_type, source_id, idempotency_key, created_by
  ) VALUES (
    'Pre-Fund Period Close — ' || p_fund_name,
    'إغلاق فترة التمويل المسبق — ' || p_fund_name,
    v_posting_dt, 'draft',
    'pre_fund_reconciliations', v_recon_id,
    'pf-closed-' || p_fund_id::TEXT,
    p_closed_by
  ) RETURNING id INTO v_je_id;

  -- Lines: return portion (Dr liability → Cr bank)
  IF v_liab_id IS NOT NULL AND v_bank_id IS NOT NULL AND p_return_amt > 0 THEN
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, debit_credit,
      original_amount, original_currency, functional_amount, functional_currency,
      description, function)
    VALUES
      (v_je_id, 1, v_liab_id, 'DR', p_return_amt, p_currency, p_return_amt, p_currency,
       'Pre-fund close — return to donor', 'program'),
      (v_je_id, 2, v_bank_id, 'CR', p_return_amt, p_currency, p_return_amt, p_currency,
       'Donor refund — cash out', 'program');
  END IF;

  -- Lines: variance/expense (Dr liability → Cr expense)
  IF v_liab_id IS NOT NULL AND v_exp_id IS NOT NULL AND v_variance > 0 THEN
    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, debit_credit,
      original_amount, original_currency, functional_amount, functional_currency,
      description, function)
    VALUES
      (v_je_id, 3, v_liab_id, 'DR', v_variance, p_currency, v_variance, p_currency,
       'Pre-fund close — variance treated as expense', 'program'),
      (v_je_id, 4, v_exp_id,  'CR', v_variance, p_currency, v_variance, p_currency,
       'Programme expense — residual balance', 'program');
  END IF;

  INSERT INTO acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
  VALUES ('pre_fund_reconciliations', v_recon_id, 'pre_fund_closed', 'success', v_je_id);

  -- 4. Carry-forward GL entry — fires whenever carry amount > 0, regardless of
  --    surplus_action (covers both 'carry_forward' and 'split' with carry portion)
  IF p_carry_forward_amt > 0 AND v_liab_id IS NOT NULL AND v_cf_id IS NOT NULL THEN

    INSERT INTO acct_journal_entries (
      description_en, description_ar, posting_date, status,
      source_type, source_id, idempotency_key, created_by
    ) VALUES (
      'Pre-Fund Carry-Forward — ' || p_fund_name || ' (surplus carried to next period)',
      'ترحيل رصيد التمويل المسبق — ' || p_fund_name,
      v_posting_dt, 'draft',
      'pre_fund_reconciliations', v_recon_id,
      'pf-carry-fwd-' || p_fund_id::TEXT,
      p_closed_by
    ) RETURNING id INTO v_cf_je_id;

    INSERT INTO acct_journal_lines (entry_id, line_no, account_id, debit_credit,
      original_amount, original_currency, functional_amount, functional_currency,
      description, function)
    VALUES
      (v_cf_je_id, 1, v_liab_id, 'DR', p_carry_forward_amt, p_currency, p_carry_forward_amt, p_currency,
       'Carry-forward — close old-period pre-fund liability', 'program'),
      (v_cf_je_id, 2, v_cf_id,   'CR', p_carry_forward_amt, p_currency, p_carry_forward_amt, p_currency,
       'Carry-forward — open next-period pre-fund liability', 'program');

    INSERT INTO acct_gl_bridge_log (source_table, source_id, event_type, status, journal_entry_id)
    VALUES ('pre_fund_reconciliations', v_recon_id, 'pre_fund_carry_forward', 'success', v_cf_je_id);
  END IF;

  RETURN jsonb_build_object(
    'success',             true,
    'reconciliation_id',   v_recon_id,
    'journal_entry_id',    v_je_id,
    'cf_journal_entry_id', v_cf_je_id
  );
END;
$$;

REVOKE ALL ON FUNCTION close_pre_fund_period_rpc(UUID,TEXT,DATE,DATE,NUMERIC,NUMERIC,NUMERIC,NUMERIC,TEXT,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION close_pre_fund_period_rpc(UUID,TEXT,DATE,DATE,NUMERIC,NUMERIC,NUMERIC,NUMERIC,TEXT,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,TEXT,TEXT) TO authenticated;
-- ============================================================
-- Pre-Fund Transactions: schema additions only
-- The link_payment_atomically_rpc function (11-arg, canonical)
-- is defined in pre_funding_atomic_rpcs.sql — NOT here.
--
-- Run AFTER pre_funding_migration.sql AND pre_funding_atomic_rpcs.sql
-- Safe to re-run (IF NOT EXISTS guards throughout).
-- ============================================================

-- 1. Add columns to pre_fund_transactions (safe if already present)
ALTER TABLE pre_fund_transactions
  ADD COLUMN IF NOT EXISTS user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receipt_url TEXT;

CREATE INDEX IF NOT EXISTS idx_pf_transactions_user ON pre_fund_transactions(user_id);

-- 2. RLS: field staff can see their own transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pre_fund_transactions'
      AND policyname = 'pf_txn_self_select'
  ) THEN
    CREATE POLICY "pf_txn_self_select" ON pre_fund_transactions
      FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR created_by = auth.uid());
  END IF;
END$$;

-- 3. Drop the legacy 9-arg overload if it still exists from an older deployment.
-- The canonical 11-arg link_payment_atomically_rpc in pre_funding_atomic_rpcs.sql
-- handles all callers (p_user_id and p_receipt_url default to NULL).
DROP FUNCTION IF EXISTS link_payment_atomically_rpc(UUID,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,DATE,UUID);

NOTIFY pgrst, 'reload schema';
-- ============================================================================
-- PRE-FUND USER ALLOCATIONS
-- Links specific users to a pre-fund with an allocated budget.
-- Only allocated users can have payments auto-linked to a fund.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pre_fund_allocations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_fund_request_id UUID NOT NULL REFERENCES pre_fund_requests(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  allocated_amount  NUMERIC(15,2) NOT NULL CHECK (allocated_amount > 0),
  spent_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'USD',
  notes             TEXT,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pre_fund_request_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pf_alloc_fund ON pre_fund_allocations(pre_fund_request_id);
CREATE INDEX IF NOT EXISTS idx_pf_alloc_user ON pre_fund_allocations(user_id);

ALTER TABLE pre_fund_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pf_alloc_admin_all"   ON pre_fund_allocations;
DROP POLICY IF EXISTS "pf_alloc_self_select" ON pre_fund_allocations;

-- Finance/admin: full access
CREATE POLICY "pf_alloc_admin_all" ON pre_fund_allocations FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
      AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
      AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin'))
  );

-- Users: can see their own allocation
CREATE POLICY "pf_alloc_self_select" ON pre_fund_allocations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Function to deduct from a user's allocation when a payment is linked.
-- SECURITY DEFINER so it can bypass RLS, but ONLY finance/admin roles may call it.
CREATE OR REPLACE FUNCTION deduct_pf_allocation(
  p_fund_id   UUID,
  p_user_id   UUID,
  p_amount    NUMERIC
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_rows INT;
BEGIN
  -- ── Role guard ──────────────────────────────────────────────────────────────
  SELECT LOWER(role) INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN (
    'super_admin','superadmin','admin','financialadmin','financial_admin'
  ) THEN
    RAISE EXCEPTION 'deduct_pf_allocation: caller does not have finance/admin role (uid=%)', auth.uid();
  END IF;

  -- ── Deduct ──────────────────────────────────────────────────────────────────
  UPDATE pre_fund_allocations
  SET spent_amount = spent_amount + p_amount,
      updated_at   = now()
  WHERE pre_fund_request_id = p_fund_id
    AND user_id = p_user_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'deduct_pf_allocation: no allocation row found for fund=% user=% — deduction skipped',
      p_fund_id, p_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION deduct_pf_allocation(UUID, UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION deduct_pf_allocation(UUID, UUID, NUMERIC) TO authenticated;

NOTIFY pgrst, 'reload schema';
-- ============================================================================
-- Pre-Funding RLS  (re-runnable — safe to run multiple times)
-- Access model:
--   Finance / Admin / Super Admin  →  full CRUD on all tables
--   Step assignees                 →  SELECT on requests + SELECT+UPDATE on steps
--                                     + SELECT on transactions for their funds
--   All others                     →  no access
-- ============================================================================

ALTER TABLE IF EXISTS pre_fund_period_types     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_approval_steps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_reconciliations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pre_fund_bank_unmatched   ENABLE ROW LEVEL SECURITY;

-- Drop ALL known policy names so re-runs are clean
DROP POLICY IF EXISTS "pf_period_types_finance"      ON pre_fund_period_types;
DROP POLICY IF EXISTS "pf_settings_finance"           ON pre_fund_settings;
DROP POLICY IF EXISTS "pf_requests_finance"           ON pre_fund_requests;
DROP POLICY IF EXISTS "pf_requests_step_assignee"     ON pre_fund_requests;
DROP POLICY IF EXISTS "pf_steps_finance"              ON pre_fund_approval_steps;
DROP POLICY IF EXISTS "pf_steps_assignee_select"      ON pre_fund_approval_steps;
DROP POLICY IF EXISTS "pf_steps_assignee_update"      ON pre_fund_approval_steps;
DROP POLICY IF EXISTS "pf_transactions_finance"       ON pre_fund_transactions;
DROP POLICY IF EXISTS "pf_transactions_assignee_read" ON pre_fund_transactions;
DROP POLICY IF EXISTS "pf_recons_finance"             ON pre_fund_reconciliations;
DROP POLICY IF EXISTS "pf_bank_unmatched_access"      ON pre_fund_bank_unmatched;

-- ── Period types / Settings: finance/admin ONLY ───────────────────────────────
CREATE POLICY "pf_period_types_finance" ON pre_fund_period_types FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

CREATE POLICY "pf_settings_finance" ON pre_fund_settings FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

-- ── Fund requests ─────────────────────────────────────────────────────────────
-- Finance/Admin: full CRUD
CREATE POLICY "pf_requests_finance" ON pre_fund_requests FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

-- Step assignees: SELECT only (ApprovalsHub must show fund context to approvers)
CREATE POLICY "pf_requests_step_assignee" ON pre_fund_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pre_fund_approval_steps s
      WHERE s.pre_fund_request_id = pre_fund_requests.id
        AND (
          s.assigned_user_id = auth.uid()
          OR s.assigned_user_ids @> ARRAY[auth.uid()]
        )
    )
  );

-- ── Approval steps ────────────────────────────────────────────────────────────
-- Finance/Admin: full CRUD
CREATE POLICY "pf_steps_finance" ON pre_fund_approval_steps FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

-- Step assignees: SELECT — see their own step(s)
CREATE POLICY "pf_steps_assignee_select" ON pre_fund_approval_steps FOR SELECT
  USING (
    assigned_user_id = auth.uid()
    OR assigned_user_ids @> ARRAY[auth.uid()]
  );

-- Step assignees: UPDATE — approve / reject / add notes on their own step(s)
CREATE POLICY "pf_steps_assignee_update" ON pre_fund_approval_steps FOR UPDATE
  USING (
    assigned_user_id = auth.uid()
    OR assigned_user_ids @> ARRAY[auth.uid()]
  );

-- ── Transactions ──────────────────────────────────────────────────────────────
-- Finance/Admin: full CRUD
CREATE POLICY "pf_transactions_finance" ON pre_fund_transactions FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

-- Step assignees: SELECT — verify deductions on their approval step
CREATE POLICY "pf_transactions_assignee_read" ON pre_fund_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pre_fund_approval_steps s
      WHERE s.pre_fund_request_id = pre_fund_transactions.pre_fund_request_id
        AND (
          s.assigned_user_id = auth.uid()
          OR s.assigned_user_ids @> ARRAY[auth.uid()]
        )
    )
  );

-- ── Reconciliations / Bank unmatched: finance/admin ONLY ─────────────────────
CREATE POLICY "pf_recons_finance" ON pre_fund_reconciliations FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

CREATE POLICY "pf_bank_unmatched_access" ON pre_fund_bank_unmatched FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin')) );

-- Verify — should return 11 rows
SELECT tablename, policyname
FROM   pg_policies
WHERE  policyname LIKE 'pf_%'
  AND  tablename LIKE 'pre_fund_%'
ORDER  BY tablename, policyname;


-- ============================================================================
-- Period Type Deduplication (run this if you see duplicate entries in dropdown)
-- ============================================================================

-- Step 1: Add unique constraint so it can never happen again
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pf_period_types_name_unique'
      AND conrelid = 'pre_fund_period_types'::regclass
  ) THEN
    ALTER TABLE pre_fund_period_types ADD CONSTRAINT pf_period_types_name_unique UNIQUE (name);
  END IF;
END $$;

-- Step 2: Delete duplicates — keeps the row with the lowest display_order per name
DELETE FROM pre_fund_period_types
WHERE id NOT IN (
  SELECT DISTINCT ON (name) id
  FROM pre_fund_period_types
  ORDER BY name, display_order, created_at
);

-- Verify — should return exactly 7 rows
SELECT name, day_count, display_order FROM pre_fund_period_types ORDER BY display_order;

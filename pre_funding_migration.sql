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
  -- Role guard: only service_role (pg_cron / Edge Function scheduler) may call this.
  -- Supabase sets request.jwt.claims.role when invoking via service key.
  -- Authenticated users will have role='authenticated', so they are rejected here.
  v_jwt_role := coalesce(current_setting('request.jwt.claims.role', true), '');
  IF v_jwt_role NOT IN ('service_role', 'postgres', '') THEN
    RETURN; -- Silently reject — do not leak information
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

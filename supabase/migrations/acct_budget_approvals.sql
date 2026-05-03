-- ============================================================
-- PACT Accounting: Budget Approval Workflow
-- ============================================================
-- Adds a per-period budget approval workflow table that lets
-- finance officers submit a budget period for review and
-- admins approve or reject it. The Budget Planning UI reads
-- this table (with graceful 42P01 fallback) to show the
-- current approval status banner and action buttons.
--
-- How to apply:
--   Run this script via the Supabase SQL Editor.
-- ============================================================

-- Budget approval status per period (+ optional fund scope)
CREATE TABLE IF NOT EXISTS acct_budget_approvals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id        UUID NOT NULL REFERENCES acct_fiscal_periods(id) ON DELETE CASCADE,
  fund_id          UUID REFERENCES acct_funds(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  submitted_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  submitted_at     TIMESTAMPTZ,
  reviewed_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  reviewer_notes   TEXT,
  total_budget     NUMERIC(18, 2),   -- snapshot at submission time
  line_count       INTEGER,          -- snapshot at submission time
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Budget change audit log (tracks every individual line change)
CREATE TABLE IF NOT EXISTS acct_budget_audit_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_line_id   UUID NOT NULL REFERENCES acct_budget_lines(id) ON DELETE CASCADE,
  period_id        UUID REFERENCES acct_fiscal_periods(id) ON DELETE SET NULL,
  account_id       UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,
  fund_id          UUID REFERENCES acct_funds(id) ON DELETE SET NULL,
  old_amount       NUMERIC(18, 2),
  new_amount       NUMERIC(18, 2) NOT NULL,
  changed_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  changed_by_name  TEXT,
  changed_by_email TEXT,            -- denormalised for fast display
  account_code     TEXT,            -- denormalised for fast display
  account_name_en  TEXT,            -- denormalised for fast display
  action           TEXT NOT NULL DEFAULT 'update' CHECK (action IN ('insert','update','delete')),
  change_note      TEXT,
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one approval record per period per fund.
-- Two partial indexes handle the NULL fund_id case correctly because
-- PostgreSQL UNIQUE treats every NULL as distinct, which would allow
-- duplicate rows when fund_id IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_budget_approvals_period_fund_notnull
  ON acct_budget_approvals(period_id, fund_id)
  WHERE fund_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_budget_approvals_period_fund_null
  ON acct_budget_approvals(period_id)
  WHERE fund_id IS NULL;

-- Index for fast period-level queries
CREATE INDEX IF NOT EXISTS idx_budget_approvals_period
  ON acct_budget_approvals(period_id);

CREATE INDEX IF NOT EXISTS idx_budget_audit_period
  ON acct_budget_audit_log(period_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_budget_audit_line
  ON acct_budget_audit_log(budget_line_id, changed_at DESC);

-- ── Auto-update updated_at on acct_budget_approvals ──────────────────────────
CREATE OR REPLACE FUNCTION _pact_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_budget_approvals_updated_at ON acct_budget_approvals;
CREATE TRIGGER trg_budget_approvals_updated_at
  BEFORE UPDATE ON acct_budget_approvals
  FOR EACH ROW EXECUTE FUNCTION _pact_set_updated_at();

-- ── Audit trigger: write to acct_budget_audit_log on every budget line change ─
CREATE OR REPLACE FUNCTION _pact_audit_budget_line()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_code      TEXT;
  v_name      TEXT;
  v_user_name TEXT;
  v_email     TEXT;
BEGIN
  -- Resolve account details
  SELECT code, name_en
    INTO v_code, v_name
    FROM acct_accounts
   WHERE id = COALESCE(NEW.account_id, OLD.account_id);

  -- Resolve actor details (works because auth context is preserved)
  SELECT full_name, email
    INTO v_user_name, v_email
    FROM profiles
   WHERE id = auth.uid();

  INSERT INTO acct_budget_audit_log (
    budget_line_id,
    period_id,
    account_id,
    fund_id,
    old_amount,
    new_amount,
    changed_by,
    changed_by_name,
    changed_by_email,
    account_code,
    account_name_en,
    action
  ) VALUES (
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.period_id,  OLD.period_id),
    COALESCE(NEW.account_id, OLD.account_id),
    COALESCE(NEW.fund_id,    OLD.fund_id),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.budget_amount ELSE NULL END,
    COALESCE(NEW.budget_amount, 0),
    auth.uid(),
    v_user_name,
    v_email,
    v_code,
    v_name,
    LOWER(TG_OP)   -- 'insert' | 'update' | 'delete'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_budget_line ON acct_budget_lines;
CREATE TRIGGER trg_audit_budget_line
  AFTER INSERT OR UPDATE ON acct_budget_lines
  FOR EACH ROW EXECUTE FUNCTION _pact_audit_budget_line();

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE acct_budget_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_budget_audit_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read approvals
CREATE POLICY "acct_budget_approvals_select"
  ON acct_budget_approvals FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT: WITH CHECK (not USING) is required for inserts to be validated
CREATE POLICY "acct_budget_approvals_insert"
  ON acct_budget_approvals FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- UPDATE/DELETE: USING clause applies to existing rows
CREATE POLICY "acct_budget_approvals_update"
  ON acct_budget_approvals FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "acct_budget_approvals_delete"
  ON acct_budget_approvals FOR DELETE
  USING (auth.role() = 'authenticated');

-- All authenticated users can read the audit log
CREATE POLICY "acct_budget_audit_select"
  ON acct_budget_audit_log FOR SELECT
  USING (auth.role() = 'authenticated');

-- Any authenticated user (trigger runs as SECURITY DEFINER) can insert
CREATE POLICY "acct_budget_audit_insert"
  ON acct_budget_audit_log FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

SELECT 'acct_budget_approvals, acct_budget_audit_log, and audit trigger created successfully' AS result;

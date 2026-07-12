-- ============================================================
-- PACT Accounting Phase 3: Workflow Enhancements
-- Apply in Supabase SQL Editor → Enable RLS option
-- ============================================================

-- ┌─────────────────────────────────────────────────────────────┐
-- │ 1. Expense Report — two-tier approval columns               │
-- └─────────────────────────────────────────────────────────────┘
ALTER TABLE acct_expense_reports
  ADD COLUMN IF NOT EXISTS tier1_approved_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tier1_approved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tier2_approved_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tier2_approved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason   TEXT,
  ADD COLUMN IF NOT EXISTS paid_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_by            UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ┌─────────────────────────────────────────────────────────────┐
-- │ 2. Petty Cash Replenishment Requests                        │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS acct_petty_cash_replenishments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id           UUID NOT NULL REFERENCES acct_petty_cash_boxes(id) ON DELETE CASCADE,
  requested_amount NUMERIC(18,4) NOT NULL,
  current_balance  NUMERIC(18,4) NOT NULL DEFAULT 0,
  requested_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status           TEXT NOT NULL DEFAULT 'pending',
    -- pending | approved | rejected | fulfilled
  approved_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at      TIMESTAMPTZ,
  fulfilled_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE acct_petty_cash_replenishments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_acct_petty_cash_replenishments"  ON acct_petty_cash_replenishments;
DROP POLICY IF EXISTS "auth_write_acct_petty_cash_replenishments" ON acct_petty_cash_replenishments;
CREATE POLICY "auth_read_acct_petty_cash_replenishments"  ON acct_petty_cash_replenishments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_write_acct_petty_cash_replenishments" ON acct_petty_cash_replenishments FOR ALL    USING (auth.role() = 'authenticated');

-- ┌─────────────────────────────────────────────────────────────┐
-- │ 3. Wire Transfers — SWIFT confirmation + timeline fields    │
-- └─────────────────────────────────────────────────────────────┘
ALTER TABLE acct_wire_transfers
  ADD COLUMN IF NOT EXISTS submitted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS swift_confirm_ref TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason  TEXT;

-- ┌─────────────────────────────────────────────────────────────┐
-- │ 4. Customer Invoice AR Aging — overdue_days computed column │
-- └─────────────────────────────────────────────────────────────┘
-- (no schema changes needed — aging computed from existing due_date)
-- Ensure index for aging queries
CREATE INDEX IF NOT EXISTS idx_cust_inv_due_date ON acct_customer_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_cust_inv_status   ON acct_customer_invoices(status);

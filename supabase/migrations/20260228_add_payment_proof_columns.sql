-- ─────────────────────────────────────────────────────────────────────────────
-- Payment proof + fund receipt confirmation columns
-- Covers both operational_cost_submissions and down_payment_requests so that:
--   • Finance/admin can attach a payment receipt when marking as paid (web)
--   • The submitter/enumerator sees the receipt in their mobile wallet and
--     taps "Confirm Receipt" (with signature) to acknowledge funds received
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. operational_cost_submissions ──────────────────────────────────────────
ALTER TABLE operational_cost_submissions
  ADD COLUMN IF NOT EXISTS paid_by                    UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS payment_proof_url          TEXT,
  ADD COLUMN IF NOT EXISTS payment_proof_notes        TEXT,
  ADD COLUMN IF NOT EXISTS payment_proof_uploaded_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fund_receipt_confirmed     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fund_receipt_confirmed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fund_receipt_notes         TEXT;

-- Submitters can confirm their own fund receipt
DROP POLICY IF EXISTS "Submitters can confirm fund receipt" ON operational_cost_submissions;
CREATE POLICY "Submitters can confirm fund receipt"
  ON operational_cost_submissions FOR UPDATE
  USING  (auth.uid() = submitted_by)
  WITH CHECK (auth.uid() = submitted_by);

-- Finance/admin can attach payment proof when marking as paid
DROP POLICY IF EXISTS "Finance can set payment proof" ON operational_cost_submissions;
CREATE POLICY "Finance can set payment proof"
  ON operational_cost_submissions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'admin', 'Admin',
          'SuperAdmin', 'superAdmin', 'super_admin', 'Super Admin',
          'FinancialAdmin', 'financialAdmin'
        )
    )
  );

-- ── 2. down_payment_requests ─────────────────────────────────────────────────
-- These columns are written by the web DownPaymentApprovalPanel when the admin
-- marks an advance as paid (with mandatory receipt upload), and read by the
-- Flutter wallet screen in the Advances tab.
ALTER TABLE down_payment_requests
  ADD COLUMN IF NOT EXISTS approved_amount            NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS payment_proof_url          TEXT,
  ADD COLUMN IF NOT EXISTS payment_proof_notes        TEXT,
  ADD COLUMN IF NOT EXISTS payment_proof_uploaded_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fund_receipt_confirmed     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fund_receipt_confirmed_at  TIMESTAMPTZ;

-- Requester can acknowledge receiving their advance (fund receipt confirmation)
-- The Flutter app saves to metadata JSONB but also updates fund_receipt_confirmed
-- directly for easy filtering in admin dashboards.
DROP POLICY IF EXISTS "Requester can confirm advance receipt" ON down_payment_requests;
CREATE POLICY "Requester can confirm advance receipt"
  ON down_payment_requests FOR UPDATE
  USING  (auth.uid() = requested_by)
  WITH CHECK (auth.uid() = requested_by);

-- Finance/admin can attach proof when marking advance as paid
DROP POLICY IF EXISTS "Finance can set advance payment proof" ON down_payment_requests;
CREATE POLICY "Finance can set advance payment proof"
  ON down_payment_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'admin', 'Admin',
          'SuperAdmin', 'superAdmin', 'super_admin', 'Super Admin',
          'FinancialAdmin', 'financialAdmin'
        )
    )
  );

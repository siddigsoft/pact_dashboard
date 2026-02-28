-- Add payment proof and fund receipt confirmation columns to operational_cost_submissions
-- These columns support mandatory receipt upload when marking a cost as paid,
-- and fund receipt confirmation by the submitter after payment.

ALTER TABLE operational_cost_submissions
  ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS payment_proof_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_proof_notes TEXT,
  ADD COLUMN IF NOT EXISTS payment_proof_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fund_receipt_confirmed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fund_receipt_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fund_receipt_notes TEXT;

-- Allow submitters to confirm fund receipt (update fund_receipt_confirmed on their own records)
DROP POLICY IF EXISTS "Submitters can confirm fund receipt" ON operational_cost_submissions;
CREATE POLICY "Submitters can confirm fund receipt"
  ON operational_cost_submissions FOR UPDATE
  USING (auth.uid() = submitted_by)
  WITH CHECK (auth.uid() = submitted_by);

-- Allow finance/admin to set payment proof when marking as paid
DROP POLICY IF EXISTS "Finance can set payment proof" ON operational_cost_submissions;
CREATE POLICY "Finance can set payment proof"
  ON operational_cost_submissions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'Admin', 'SuperAdmin', 'superAdmin', 'super_admin', 'Super Admin', 'FinancialAdmin', 'financialAdmin')
    )
  );

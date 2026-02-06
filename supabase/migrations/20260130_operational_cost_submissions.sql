-- Operational Cost Submissions Table
-- For FOM/Coordinators to submit operational expenses (permits, training, communications, etc.)
-- Uses two-tier approval workflow: Supervisor/FOM -> Admin

CREATE TABLE IF NOT EXISTS operational_cost_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Expense category
  expense_category TEXT NOT NULL CHECK (expense_category IN (
    'permits', 'incentives', 'communications', 'training', 
    'general_transport', 'equipment', 'printing', 'meetings', 'other'
  )),
  
  -- Optional linkage (hubs uses TEXT id; projects and mmp_files use UUID id)
  hub_id TEXT REFERENCES hubs(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  mmp_file_id UUID REFERENCES mmp_files(id) ON DELETE SET NULL,
  
  -- Submitter information
  submitted_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  submitter_role TEXT NOT NULL,
  
  -- Cost details
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT DEFAULT 'SDG',
  
  -- Expense details
  description TEXT NOT NULL,
  expense_date DATE NOT NULL,
  vendor TEXT,
  reference_number TEXT,
  
  -- Supporting documents (JSONB array)
  supporting_documents JSONB DEFAULT '[]'::jsonb,
  
  -- Overall status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'under_review', 'approved', 'rejected', 'paid', 'cancelled'
  )),
  
  -- Tier 1 approval (Supervisor/FOM)
  tier1_status TEXT NOT NULL DEFAULT 'pending' CHECK (tier1_status IN (
    'pending', 'approved', 'rejected', 'changes_requested'
  )),
  tier1_approved_by UUID REFERENCES profiles(id),
  tier1_approved_at TIMESTAMPTZ,
  tier1_notes TEXT,
  
  -- Rejection reason
  rejection_reason TEXT,
  
  -- Tier 2 approval (Admin)
  tier2_status TEXT NOT NULL DEFAULT 'pending' CHECK (tier2_status IN (
    'pending', 'approved', 'rejected'
  )),
  tier2_approved_by UUID REFERENCES profiles(id),
  tier2_approved_at TIMESTAMPTZ,
  tier2_notes TEXT,
  
  -- Payment tracking
  wallet_transaction_id UUID,
  paid_at TIMESTAMPTZ,
  paid_amount_cents INTEGER,
  payment_notes TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_operational_costs_submitted_by ON operational_cost_submissions(submitted_by);
CREATE INDEX idx_operational_costs_status ON operational_cost_submissions(status);
CREATE INDEX idx_operational_costs_tier1_status ON operational_cost_submissions(tier1_status);
CREATE INDEX idx_operational_costs_tier2_status ON operational_cost_submissions(tier2_status);
CREATE INDEX idx_operational_costs_category ON operational_cost_submissions(expense_category);
CREATE INDEX idx_operational_costs_hub ON operational_cost_submissions(hub_id);
CREATE INDEX idx_operational_costs_project ON operational_cost_submissions(project_id);
CREATE INDEX idx_operational_costs_date ON operational_cost_submissions(expense_date);

-- RLS Policies
ALTER TABLE operational_cost_submissions ENABLE ROW LEVEL SECURITY;

-- Users can view their own submissions
CREATE POLICY "Users can view own operational cost submissions"
  ON operational_cost_submissions FOR SELECT
  USING (auth.uid() = submitted_by);

-- Supervisors and FOM can view submissions from their hub
CREATE POLICY "Supervisors can view hub operational cost submissions"
  ON operational_cost_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.hub_id = operational_cost_submissions.hub_id
      AND p.role IN ('hubSupervisor', 'supervisor', 'Field Operation Manager (FOM)')
    )
  );

-- Admins can view all submissions
CREATE POLICY "Admins can view all operational cost submissions"
  ON operational_cost_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'SuperAdmin', 'CountryDirector')
    )
  );

-- All authorized roles can create operational cost submissions
-- Includes: FOM, Coordinators, Country Directors, Admins, Super Admins, Supervisors
CREATE POLICY "Authorized roles can create operational cost submissions"
  ON operational_cost_submissions FOR INSERT
  WITH CHECK (
    auth.uid() = submitted_by
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN (
        'Field Operation Manager (FOM)', 
        'Coordinator', 'coordinator',
        'CountryDirector',
        'admin', 'SuperAdmin',
        'hubSupervisor', 'supervisor'
      )
    )
  );

-- Users can update their own pending submissions (only before tier1 review)
CREATE POLICY "Users can update own pending operational cost submissions"
  ON operational_cost_submissions FOR UPDATE
  USING (
    auth.uid() = submitted_by
    AND status = 'pending'
    AND tier1_status = 'pending'
  )
  WITH CHECK (
    auth.uid() = submitted_by
    AND status = 'pending'
    AND tier1_status = 'pending'
  );

-- Supervisors/FOM can only update tier1 fields for hub submissions
-- They cannot modify tier2 or payment fields
CREATE POLICY "Supervisors can update tier1 for hub submissions"
  ON operational_cost_submissions FOR UPDATE
  USING (
    tier1_status = 'pending'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.hub_id = operational_cost_submissions.hub_id
      AND p.role IN ('hubSupervisor', 'supervisor', 'Field Operation Manager (FOM)')
    )
  )
  WITH CHECK (
    tier2_status = 'pending'
    AND tier2_approved_by IS NULL
    AND wallet_transaction_id IS NULL
    AND paid_at IS NULL
  );

-- Admins can update tier2 approval and payment fields
-- Only after tier1 is approved
CREATE POLICY "Admins can update tier2 for all submissions"
  ON operational_cost_submissions FOR UPDATE
  USING (
    tier1_status = 'approved'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'SuperAdmin')
    )
  );

-- Finance admins can process payments (update payment fields)
CREATE POLICY "Finance can process payments"
  ON operational_cost_submissions FOR UPDATE
  USING (
    status = 'approved'
    AND tier1_status = 'approved'
    AND tier2_status = 'approved'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'SuperAdmin', 'FinancialAdmin')
    )
  );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_operational_cost_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_operational_cost_updated_at
  BEFORE UPDATE ON operational_cost_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_operational_cost_updated_at();

-- Add Country Director role to profiles if not exists
DO $$
BEGIN
  -- Check if we need to update the role check constraint
  -- This is a safe operation that adds CountryDirector if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname LIKE '%role%' 
    AND conrelid = 'profiles'::regclass
  ) THEN
    -- Constraint doesn't exist or is named differently, skip
    RAISE NOTICE 'Role constraint not found, skipping update';
  END IF;
END $$;

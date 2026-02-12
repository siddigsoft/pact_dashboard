-- Add Tier 3 approval columns to operational_cost_submissions
-- Required for 3-tier approval flow when Coordinators submit requests:
--   Coordinator: Tier1 (Supervisor) → Tier2 (FOM/Country Director) → Tier3 (Admin/Super Admin)
--   Supervisor:  Tier1 (FOM/Country Director) → Tier2 (Admin/Super Admin)
--   Admin/Super Admin: Can bypass all tiers

-- Add tier3 columns
ALTER TABLE operational_cost_submissions 
  ADD COLUMN IF NOT EXISTS tier3_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tier3_approved_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS tier3_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tier3_notes TEXT;

-- Add constraint for tier3_status values (only when not null)
-- We don't add a NOT NULL constraint because tier3 only applies to coordinator submissions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'operational_cost_submissions_tier3_status_check'
  ) THEN
    ALTER TABLE operational_cost_submissions 
      ADD CONSTRAINT operational_cost_submissions_tier3_status_check
      CHECK (tier3_status IS NULL OR tier3_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

-- Add index for tier3 queries
CREATE INDEX IF NOT EXISTS idx_operational_costs_tier3_status ON operational_cost_submissions(tier3_status);

-- Update the status check constraint to include new possible statuses
ALTER TABLE operational_cost_submissions DROP CONSTRAINT IF EXISTS operational_cost_submissions_status_check;
ALTER TABLE operational_cost_submissions ADD CONSTRAINT operational_cost_submissions_status_check
  CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'paid', 'cancelled', 'reconciled'));

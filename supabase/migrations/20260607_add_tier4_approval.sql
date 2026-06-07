-- Add Tier 4 approval fields to operational_cost_submissions
-- Required for the new 4-tier Coordinator approval flow:
--   T1 = Hub Supervisor  →  T2 = FOM  →  T3 = Country Director  →  T4 = Admin/SuperAdmin
ALTER TABLE operational_cost_submissions
  ADD COLUMN IF NOT EXISTS tier4_status      TEXT         DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS tier4_approved_by UUID         REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS tier4_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tier4_notes       TEXT;

-- Index for fast pending-T4 queries
CREATE INDEX IF NOT EXISTS idx_ocs_tier4_status ON operational_cost_submissions (tier4_status)
  WHERE tier4_status = 'pending';

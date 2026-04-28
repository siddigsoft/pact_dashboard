-- Add mmp_id to operational_cost_submissions
-- This links each cost submission to the MMP cycle it belongs to.

ALTER TABLE operational_cost_submissions
  ADD COLUMN IF NOT EXISTS mmp_id uuid REFERENCES mmp_files(id) ON DELETE SET NULL;

-- Index for fast lookups by MMP
CREATE INDEX IF NOT EXISTS idx_ocs_mmp_id
  ON operational_cost_submissions(mmp_id)
  WHERE mmp_id IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN operational_cost_submissions.mmp_id IS
  'The MMP cycle this cost submission is related to. Required when submitting field costs.';

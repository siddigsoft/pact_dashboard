-- Pre-Fund Holder User
-- Adds a designated holder to each pre_fund_requests row.
-- Finance Admin / Super Admin sets this when creating or editing a fund.
-- The holder can then distribute allocations from their fund to other staff.

ALTER TABLE pre_fund_requests
  ADD COLUMN IF NOT EXISTS holder_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN pre_fund_requests.holder_user_id IS
  'Optional user designated as the fund holder. Holder can distribute allocations to staff from this fund.';

-- Index for fast lookup: "which funds is this user the holder of?"
CREATE INDEX IF NOT EXISTS idx_pre_fund_requests_holder_user_id
  ON pre_fund_requests (holder_user_id)
  WHERE holder_user_id IS NOT NULL;

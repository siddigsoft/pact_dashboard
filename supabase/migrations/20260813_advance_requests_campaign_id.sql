-- Migration: add campaign_id FK + approval/payment audit columns to advance_requests
-- Idempotent — safe to run multiple times.

-- 1. campaign_id FK so advances can be reliably attributed to one specific campaign
--    (project_id is NOT unique across campaigns; this column is the authoritative link)
ALTER TABLE advance_requests
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES adhoc_campaigns(id) ON DELETE SET NULL;

-- 2. Audit columns written by the Finance Hub panel when approving / rejecting / paying
ALTER TABLE advance_requests
  ADD COLUMN IF NOT EXISTS approved_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at    timestamptz,
  ADD COLUMN IF NOT EXISTS approval_notes text,
  ADD COLUMN IF NOT EXISTS paid_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_at        timestamptz;

-- 3. Index for the Finance Hub panel query (WHERE campaign_id IS NOT NULL)
CREATE INDEX IF NOT EXISTS idx_advance_requests_campaign_id
  ON advance_requests (campaign_id)
  WHERE campaign_id IS NOT NULL;

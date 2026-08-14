-- Add completed_at timestamp to adhoc_campaigns so the Mark as Complete
-- action can record when the campaign was formally closed.
ALTER TABLE adhoc_campaigns
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

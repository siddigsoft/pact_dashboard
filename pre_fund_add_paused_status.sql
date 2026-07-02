-- Add 'paused' to the pre_fund_requests status check constraint
-- Run this once in the Supabase SQL editor.

ALTER TABLE pre_fund_requests
  DROP CONSTRAINT IF EXISTS pre_fund_requests_status_check;

ALTER TABLE pre_fund_requests
  ADD CONSTRAINT pre_fund_requests_status_check
  CHECK (status IN (
    'draft', 'pending_approval', 'awaiting_receipt',
    'active', 'low_balance', 'paused',
    'closed', 'period_locked', 'pending_grace'
  ));

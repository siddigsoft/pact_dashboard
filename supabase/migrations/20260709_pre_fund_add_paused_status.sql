-- Add 'paused' to pre_fund_requests status check constraint.
--
-- The PreFundingRegistry UI exposes a Paused option but the original canonical
-- migration only included the statuses up to 'rejected'. This migration closes
-- that gap so DB constraints match the UI and application code.
--
-- Safe to run on environments that already applied pre_funding_migration.sql —
-- DROP CONSTRAINT IF EXISTS prevents errors when the old constraint is present.

ALTER TABLE pre_fund_requests
  DROP CONSTRAINT IF EXISTS pre_fund_requests_status_check;

ALTER TABLE pre_fund_requests
  ADD CONSTRAINT pre_fund_requests_status_check
  CHECK (status IN (
    'draft', 'pending_approval', 'awaiting_receipt',
    'active', 'low_balance', 'paused',
    'closed', 'period_locked', 'pending_grace', 'rejected'
  ));

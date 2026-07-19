-- Add partial payment support to operational_cost_submissions
ALTER TABLE operational_cost_submissions
  ADD COLUMN IF NOT EXISTS amount_paid_cents bigint NOT NULL DEFAULT 0;

-- 'partially_paid' is stored in the status column alongside existing values:
-- pending | under_review | approved | rejected | partially_paid | paid | reconciled
-- No enum change needed (status is varchar / text).

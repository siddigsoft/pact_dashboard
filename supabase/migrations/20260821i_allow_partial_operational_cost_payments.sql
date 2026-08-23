-- ============================================================================
-- ALLOW PARTIAL OPERATIONAL-COST PAYMENTS
-- 2026-08-21
-- The controlled Pre-Fund payment RPC records a Cost Submission as
-- `partially_paid` when the payment does not settle the full approved amount.
-- Older deployments still reject that valid state in their status constraint.
-- ============================================================================

ALTER TABLE public.operational_cost_submissions
  DROP CONSTRAINT IF EXISTS operational_cost_submissions_status_check;

ALTER TABLE public.operational_cost_submissions
  ADD CONSTRAINT operational_cost_submissions_status_check
  CHECK (status IN (
    'pending',
    'under_review',
    'approved',
    'rejected',
    'partially_paid',
    'paid',
    'cancelled',
    'reconciled'
  ));
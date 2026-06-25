-- =============================================================================
-- Add pre_fund_transaction_id to down_payment_requests
-- Allows a down payment to be back-linked to the pre_fund_transactions row
-- that was created when the payment was charged against a pre-fund.
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS).
-- =============================================================================

ALTER TABLE public.down_payment_requests
  ADD COLUMN IF NOT EXISTS pre_fund_transaction_id uuid
    REFERENCES public.pre_fund_transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dpr_pre_fund_transaction_id
  ON public.down_payment_requests(pre_fund_transaction_id);

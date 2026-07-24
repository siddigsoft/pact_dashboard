-- Add USD → SDG exchange rate to pre_fund_requests
-- Captured at fund-creation time; used for SDG-equivalent reporting.
-- Withdrawals are recorded in SDG; this rate converts the USD amount to SDG for reports.
ALTER TABLE pre_fund_requests
  ADD COLUMN IF NOT EXISTS usd_to_sdg_rate NUMERIC(12, 4) DEFAULT NULL;

-- Comment for clarity
COMMENT ON COLUMN pre_fund_requests.usd_to_sdg_rate IS
  'Rate of the day at time of fund creation: 1 USD = usd_to_sdg_rate SDG. Used for SDG-equivalent reporting only.';

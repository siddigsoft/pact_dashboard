-- REVERT BAD RECALCULATE: restore pre-funding balances to ledger-correct values
-- Run this in Supabase SQL Editor for the affected fund(s).
--
-- How to find the fund id:
--   SELECT id, name, amount, available_balance, paid_amount FROM pre_fund_requests ORDER BY created_at DESC LIMIT 10;
--
-- Then replace '<FUND_ID>' below with the actual UUID and run.

-- Step 1 — Restore paid_amount to expense-payment transactions only (excludes transfer-outs)
UPDATE pre_fund_requests pfr
SET
  paid_amount = (
    SELECT COALESCE(SUM(pft.amount), 0)
    FROM   pre_fund_transactions pft
    WHERE  pft.pre_fund_request_id = pfr.id
      AND  pft.transaction_type    = 'payment'
  ),
  committed_amount = (
    SELECT COALESCE(SUM(pft.amount), 0)
    FROM   pre_fund_transactions pft
    WHERE  pft.pre_fund_request_id = pfr.id
      AND  pft.transaction_type    = 'commitment'
  ),
  -- Ledger balance = totalIn - totalOut (the formula Recalculate now uses)
  available_balance = GREATEST(0, (
    SELECT COALESCE(SUM(CASE WHEN pft.transaction_type IN ('receipt','carry_forward','reversal') THEN pft.amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN pft.transaction_type IN ('payment','commitment','return')      THEN pft.amount ELSE 0 END), 0)
    FROM   pre_fund_transactions pft
    WHERE  pft.pre_fund_request_id = pfr.id
  ))
-- To fix ALL funds at once, remove the WHERE clause below.
-- To fix only specific funds, replace with their UUIDs:
WHERE pfr.id IN (
  -- '<MAY-FUND-UUID>',
  -- '<JUN-FUND-UUID>'
  -- Tip: run the SELECT above to get the UUIDs, then paste them here.
  SELECT id FROM pre_fund_requests  -- ← remove this line if filtering by UUID
);

-- Verify the result:
SELECT id, name, amount, available_balance, paid_amount, committed_amount
FROM   pre_fund_requests
ORDER  BY created_at DESC
LIMIT  10;

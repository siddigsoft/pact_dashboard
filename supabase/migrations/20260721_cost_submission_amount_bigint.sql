-- ================================================================
-- Fix: amount_cents columns overflow for large SDG amounts
-- INTEGER max = 2,147,483,647 (~SDG 21M at 100x multiplier)
-- SDG 46,330,000 × 100 = 4,633,000,000 → overflows INTEGER
-- Promote to BIGINT (max ~9.2 quintillion) to safely handle any amount
-- Run in Supabase SQL Editor
-- ================================================================

ALTER TABLE operational_cost_submissions
  ALTER COLUMN amount_cents      TYPE BIGINT,
  ALTER COLUMN paid_amount_cents TYPE BIGINT;

-- Also fix the history / audit columns in the same table if present
ALTER TABLE operational_cost_submissions
  ALTER COLUMN amount_cents      SET NOT NULL,
  ALTER COLUMN amount_cents      SET DEFAULT 0;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';

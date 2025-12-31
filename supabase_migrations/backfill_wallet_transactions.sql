-- =============================================================================
-- BACKFILL WALLET TRANSACTIONS FOR COMPLETED SITES
-- Run this in Supabase SQL Editor
-- This creates wallet transactions for completed sites that don't have them yet
-- =============================================================================

-- Step 1: Find completed sites that are missing wallet transactions
-- Updated to check accepted_by, claimed_by, and visit_completed_by
WITH completed_sites AS (
  SELECT 
    mse.id as site_id,
    mse.site_name,
    -- Determine user to pay: accepted_by > claimed_by > visit_completed_by
    -- Handle type mismatch: accepted_by is text, others are uuid
    CASE 
      WHEN mse.accepted_by IS NOT NULL THEN mse.accepted_by
      WHEN mse.claimed_by IS NOT NULL THEN mse.claimed_by::text
      WHEN mse.visit_completed_by IS NOT NULL THEN mse.visit_completed_by::text
      ELSE NULL
    END as user_to_pay,
    mse.accepted_by,
    mse.claimed_by,
    mse.visit_completed_by,
    mse.cost,
    mse.enumerator_fee,
    mse.transport_fee,
    mse.visit_completed_at,
    mse.accepted_at,
    mse.claimed_at,
    COALESCE(mse.cost, 0) + 
    COALESCE(mse.enumerator_fee, 0) + 
    COALESCE(mse.transport_fee, 0) as total_value
  FROM mmp_site_entries mse
  WHERE mse.status IN ('Completed', 'completed', 'Verified', 'verified')
    -- Check if any user field is set
    AND (mse.accepted_by IS NOT NULL OR mse.claimed_by IS NOT NULL OR mse.visit_completed_by IS NOT NULL)
    AND (
      COALESCE(mse.cost, 0) > 0 
      OR COALESCE(mse.enumerator_fee, 0) > 0
    )
),
existing_transactions AS (
  SELECT DISTINCT site_visit_id 
  FROM wallet_transactions 
  WHERE type = 'earning'
),
missing_payments AS (
  SELECT cs.* 
  FROM completed_sites cs
  LEFT JOIN existing_transactions et ON et.site_visit_id = cs.site_id
  WHERE et.site_visit_id IS NULL
)
SELECT 
  site_id,
  site_name,
  user_to_pay,
  accepted_by,
  claimed_by,
  visit_completed_by,
  cost,
  enumerator_fee,
  transport_fee,
  total_value,
  visit_completed_at
FROM missing_payments
ORDER BY visit_completed_at DESC;

-- Step 2: Review the above results first before running the INSERT below!
-- This shows which sites need wallet transactions created

-- Step 3: Create wallets for users who don't have one yet
-- Updated to include users from claimed_by and visit_completed_by
INSERT INTO wallets (user_id, balances, total_earned, total_withdrawn, created_at, updated_at)
SELECT DISTINCT 
  CASE 
    WHEN mse.accepted_by IS NOT NULL THEN mse.accepted_by::uuid
    WHEN mse.claimed_by IS NOT NULL THEN mse.claimed_by
    WHEN mse.visit_completed_by IS NOT NULL THEN mse.visit_completed_by
    ELSE NULL
  END as user_id,
  jsonb_build_object('SDG', 0),
  0,
  0,
  NOW(),
  NOW()
FROM mmp_site_entries mse
WHERE mse.status IN ('Completed', 'completed', 'Verified', 'verified')
  AND (mse.accepted_by IS NOT NULL OR mse.claimed_by IS NOT NULL OR mse.visit_completed_by IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM wallets w 
    WHERE w.user_id = CASE 
      WHEN mse.accepted_by IS NOT NULL THEN mse.accepted_by::uuid
      WHEN mse.claimed_by IS NOT NULL THEN mse.claimed_by
      WHEN mse.visit_completed_by IS NOT NULL THEN mse.visit_completed_by
      ELSE NULL
    END
  )
ON CONFLICT (user_id) DO NOTHING;

-- Step 4: Create wallet transactions for completed sites missing them
-- Updated to check accepted_by, claimed_by, and visit_completed_by
INSERT INTO wallet_transactions (
  wallet_id,
  user_id,
  type,
  amount,
  amount_cents,
  currency,
  site_visit_id,
  description,
  balance_before,
  balance_after,
  created_at
)
SELECT 
  w.id as wallet_id,
  CASE 
    WHEN mse.accepted_by IS NOT NULL THEN mse.accepted_by::uuid
    WHEN mse.claimed_by IS NOT NULL THEN mse.claimed_by
    WHEN mse.visit_completed_by IS NOT NULL THEN mse.visit_completed_by
    ELSE NULL
  END as user_id,
  'earning' as type,  -- Use 'earning' type to match current codebase
  COALESCE(mse.cost, COALESCE(mse.enumerator_fee, 0) + COALESCE(mse.transport_fee, 0)) as amount,
  ROUND(COALESCE(mse.cost, COALESCE(mse.enumerator_fee, 0) + COALESCE(mse.transport_fee, 0)) * 100)::bigint as amount_cents,
  'SDG' as currency,
  mse.id as site_visit_id,
  'Backfill: Site visit completed: ' || COALESCE(mse.site_name, 'Unknown Site') as description,
  0 as balance_before,
  COALESCE(mse.cost, COALESCE(mse.enumerator_fee, 0) + COALESCE(mse.transport_fee, 0)) as balance_after,
  COALESCE(mse.visit_completed_at, mse.claimed_at, mse.accepted_at, NOW()) as created_at
FROM mmp_site_entries mse
JOIN wallets w ON w.user_id = CASE 
  WHEN mse.accepted_by IS NOT NULL THEN mse.accepted_by::uuid
  WHEN mse.claimed_by IS NOT NULL THEN mse.claimed_by
  WHEN mse.visit_completed_by IS NOT NULL THEN mse.visit_completed_by
  ELSE NULL
END
WHERE mse.status IN ('Completed', 'completed', 'Verified', 'verified')
  AND (mse.accepted_by IS NOT NULL OR mse.claimed_by IS NOT NULL OR mse.visit_completed_by IS NOT NULL)
  AND (
    COALESCE(mse.cost, 0) > 0 
    OR COALESCE(mse.enumerator_fee, 0) > 0
  )
  AND NOT EXISTS (
    SELECT 1 FROM wallet_transactions wt 
    WHERE wt.site_visit_id = mse.id 
    AND wt.type = 'earning'  -- Check for existing earning transactions
  );

-- Step 5: Update wallet balances based on all transactions
-- Updated to include both 'earning' and 'site_visit_fee' transaction types
UPDATE wallets
SET 
  balances = jsonb_build_object('SDG', COALESCE(tx_sum.total, 0)),
  total_earned = COALESCE(tx_sum.total, 0),
  updated_at = NOW()
FROM (
  SELECT 
    user_id,
    SUM(amount) as total
  FROM wallet_transactions
  WHERE type = 'earning'  -- Sum all earning transactions
  GROUP BY user_id
) tx_sum
WHERE wallets.user_id = tx_sum.user_id;

-- Step 6: Verify the results
SELECT 
  p.full_name,
  p.email,
  w.balances->>'SDG' as balance_sdg,
  w.total_earned,
  (SELECT COUNT(*) FROM wallet_transactions wt WHERE wt.user_id = w.user_id) as transaction_count
FROM wallets w
JOIN profiles p ON p.id = w.user_id
ORDER BY w.total_earned DESC;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';

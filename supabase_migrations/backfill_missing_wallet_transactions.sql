-- =============================================================================
-- BACKFILL MISSING WALLET TRANSACTIONS FOR COMPLETED SITES
-- This script creates wallet transactions for sites that are already completed
-- but missing wallet transactions.
-- =============================================================================

-- Step 1: Identify sites that need transactions
WITH completed_sites_missing_transactions AS (
  SELECT 
    mse.id as site_id,
    mse.site_name,
    mse.status,
    -- Determine user to pay (priority: accepted_by > claimed_by > visit_completed_by)
    CASE 
      WHEN mse.accepted_by IS NOT NULL AND mse.accepted_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
        THEN mse.accepted_by::uuid
      WHEN mse.claimed_by IS NOT NULL THEN mse.claimed_by
      WHEN mse.visit_completed_by IS NOT NULL THEN mse.visit_completed_by
      ELSE NULL
    END as user_to_pay,
    mse.accepted_by,
    mse.claimed_by,
    mse.visit_completed_by,
    COALESCE(mse.cost, 0) as cost,
    COALESCE(mse.enumerator_fee, 0) as enumerator_fee,
    COALESCE(mse.transport_fee, 0) as transport_fee,
    -- Calculate amount
    COALESCE(
      NULLIF(mse.cost, 0),
      COALESCE(mse.enumerator_fee, 0) + COALESCE(mse.transport_fee, 0),
      0
    ) as amount,
    mse.visit_completed_at
  FROM mmp_site_entries mse
  WHERE LOWER(mse.status) = 'completed'
    -- Must have a user to pay
    AND (
      (mse.accepted_by IS NOT NULL AND mse.accepted_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      OR mse.claimed_by IS NOT NULL
      OR mse.visit_completed_by IS NOT NULL
    )
    -- Must have a fee amount
    AND (
      COALESCE(mse.cost, 0) > 0 
      OR COALESCE(mse.enumerator_fee, 0) > 0
      OR COALESCE(mse.transport_fee, 0) > 0
    )
    -- Must NOT already have a transaction
    AND NOT EXISTS (
      SELECT 1 
      FROM wallet_transactions wt
      WHERE (wt.site_visit_id = mse.id OR wt.related_site_visit_id = mse.id)
        AND wt.type = 'earning'
    )
)
SELECT 
  site_id,
  site_name,
  user_to_pay,
  amount,
  cost,
  enumerator_fee,
  transport_fee,
  visit_completed_at
FROM completed_sites_missing_transactions
WHERE user_to_pay IS NOT NULL
  AND amount > 0
ORDER BY visit_completed_at DESC NULLS LAST;

-- Step 2: Review the above results first!
-- Make sure the sites and amounts look correct before proceeding.

-- Step 3: Create wallets for users who don't have one yet
INSERT INTO wallets (user_id, balances, total_earned, total_earned_cents, balance_cents, created_at, updated_at)
SELECT DISTINCT 
  cs.user_to_pay,
  jsonb_build_object('SDG', 0),
  0,
  0,
  0,
  NOW(),
  NOW()
FROM (
  SELECT DISTINCT
    CASE 
      WHEN mse.accepted_by IS NOT NULL AND mse.accepted_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
        THEN mse.accepted_by::uuid
      WHEN mse.claimed_by IS NOT NULL THEN mse.claimed_by
      WHEN mse.visit_completed_by IS NOT NULL THEN mse.visit_completed_by
      ELSE NULL
    END as user_to_pay
  FROM mmp_site_entries mse
  WHERE LOWER(mse.status) = 'completed'
    AND (
      (mse.accepted_by IS NOT NULL AND mse.accepted_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      OR mse.claimed_by IS NOT NULL
      OR mse.visit_completed_by IS NOT NULL
    )
    AND (
      COALESCE(mse.cost, 0) > 0 
      OR COALESCE(mse.enumerator_fee, 0) > 0
      OR COALESCE(mse.transport_fee, 0) > 0
    )
    AND NOT EXISTS (
      SELECT 1 
      FROM wallet_transactions wt
      WHERE (wt.site_visit_id = mse.id OR wt.related_site_visit_id = mse.id)
        AND wt.type = 'earning'
    )
) cs
WHERE cs.user_to_pay IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM wallets w WHERE w.user_id = cs.user_to_pay
  )
ON CONFLICT (user_id) DO NOTHING;

-- Step 4: Create wallet transactions for missing sites
-- This uses the same logic as the trigger function
WITH completed_sites AS (
  SELECT 
    mse.id as site_id,
    mse.site_name,
    CASE 
      WHEN mse.accepted_by IS NOT NULL AND mse.accepted_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
        THEN mse.accepted_by::uuid
      WHEN mse.claimed_by IS NOT NULL THEN mse.claimed_by
      WHEN mse.visit_completed_by IS NOT NULL THEN mse.visit_completed_by
      ELSE NULL
    END as user_to_pay,
    COALESCE(
      NULLIF(mse.cost, 0),
      COALESCE(mse.enumerator_fee, 0) + COALESCE(mse.transport_fee, 0),
      0
    ) as amount,
    COALESCE(mse.visit_completed_at, mse.updated_at, mse.created_at) as completed_at
  FROM mmp_site_entries mse
  WHERE LOWER(mse.status) = 'completed'
    AND (
      (mse.accepted_by IS NOT NULL AND mse.accepted_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      OR mse.claimed_by IS NOT NULL
      OR mse.visit_completed_by IS NOT NULL
    )
    AND (
      COALESCE(mse.cost, 0) > 0 
      OR COALESCE(mse.enumerator_fee, 0) > 0
      OR COALESCE(mse.transport_fee, 0) > 0
    )
    AND NOT EXISTS (
      SELECT 1 
      FROM wallet_transactions wt
      WHERE (wt.site_visit_id = mse.id OR wt.related_site_visit_id = mse.id)
        AND wt.type = 'earning'
    )
),
wallet_balances AS (
  SELECT 
    w.id as wallet_id,
    w.user_id,
    COALESCE((w.balances->>'SDG')::numeric, COALESCE(w.balance_cents, 0) / 100.0, 0) as current_balance
  FROM wallets w
  INNER JOIN completed_sites cs ON w.user_id = cs.user_to_pay
)
INSERT INTO wallet_transactions (
  wallet_id,
  user_id,
  type,
  amount,
  amount_cents,
  currency,
  site_visit_id,
  related_site_visit_id,
  description,
  balance_before,
  balance_after,
  status,
  created_at
)
SELECT 
  wb.wallet_id,
  cs.user_to_pay,
  'earning'::wallet_tx_type,
  cs.amount,
  ROUND(cs.amount * 100)::bigint,
  'SDG',
  cs.site_id,
  cs.site_id,
  format('Site visit completed: %s', cs.site_name),
  wb.current_balance,
  wb.current_balance + cs.amount,
  'pending'::wallet_tx_status,
  cs.completed_at
FROM completed_sites cs
INNER JOIN wallet_balances wb ON wb.user_id = cs.user_to_pay
WHERE cs.user_to_pay IS NOT NULL
  AND cs.amount > 0
ORDER BY cs.completed_at DESC NULLS LAST;

-- Step 5: Update wallet balances after creating transactions
UPDATE wallets w
SET 
  balances = jsonb_set(
    COALESCE(w.balances, '{"SDG": 0}'::jsonb),
    '{SDG}',
    to_jsonb(
      COALESCE((w.balances->>'SDG')::numeric, COALESCE(w.balance_cents, 0) / 100.0, 0) +
      COALESCE((
        SELECT SUM(wt.amount)
        FROM wallet_transactions wt
        WHERE wt.wallet_id = w.id
          AND wt.type = 'earning'
          AND wt.created_at > w.updated_at
      ), 0)
    )
  ),
  total_earned = COALESCE(w.total_earned, 0) + COALESCE((
    SELECT SUM(wt.amount)
    FROM wallet_transactions wt
    WHERE wt.wallet_id = w.id
      AND wt.type = 'earning'
      AND wt.created_at > w.updated_at
  ), 0),
  total_earned_cents = COALESCE(w.total_earned_cents, 0) + COALESCE((
    SELECT SUM(wt.amount_cents)
    FROM wallet_transactions wt
    WHERE wt.wallet_id = w.id
      AND wt.type = 'earning'
      AND wt.created_at > w.updated_at
  ), 0),
  balance_cents = ROUND((
    COALESCE((w.balances->>'SDG')::numeric, COALESCE(w.balance_cents, 0) / 100.0, 0) +
    COALESCE((
      SELECT SUM(wt.amount)
      FROM wallet_transactions wt
      WHERE wt.wallet_id = w.id
        AND wt.type = 'earning'
        AND wt.created_at > w.updated_at
    ), 0)
  ) * 100)::bigint,
  updated_at = NOW()
WHERE EXISTS (
  SELECT 1
  FROM wallet_transactions wt
  WHERE wt.wallet_id = w.id
    AND wt.type = 'earning'
    AND wt.created_at > w.updated_at
);

-- Step 6: Verify the results
SELECT 
  mse.id,
  mse.site_name,
  mse.status,
  wt.id as transaction_id,
  wt.amount as transaction_amount,
  wt.created_at as transaction_created_at,
  w.balances->>'SDG' as wallet_balance
FROM mmp_site_entries mse
LEFT JOIN wallet_transactions wt ON (
  (wt.site_visit_id = mse.id OR wt.related_site_visit_id = mse.id)
  AND wt.type IN ('earning', 'site_visit_fee')
)
LEFT JOIN wallets w ON w.user_id = COALESCE(
  CASE 
    WHEN mse.accepted_by IS NOT NULL AND mse.accepted_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
      THEN mse.accepted_by::uuid
    ELSE NULL
  END,
  mse.claimed_by,
  mse.visit_completed_by
)
WHERE LOWER(mse.status) = 'completed'
  AND (
    (mse.accepted_by IS NOT NULL AND mse.accepted_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    OR mse.claimed_by IS NOT NULL
    OR mse.visit_completed_by IS NOT NULL
  )
ORDER BY mse.visit_completed_at DESC NULLS LAST
LIMIT 20;


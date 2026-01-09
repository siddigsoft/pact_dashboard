-- =============================================================================
-- TEST SCRIPT: Verify Wallet Transaction Trigger
-- Run this to test if the trigger is working correctly
-- =============================================================================

-- Test 1: Check if trigger exists
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'trigger_create_wallet_transaction_on_completion';

-- Test 2: Find completed sites without wallet transactions
SELECT 
  mse.id,
  mse.site_name,
  mse.status,
  mse.accepted_by,
  mse.claimed_by,
  mse.visit_completed_by,
  mse.cost,
  mse.enumerator_fee,
  mse.transport_fee,
  mse.visit_completed_at,
  CASE 
    WHEN wt.id IS NOT NULL THEN 'Has Transaction'
    ELSE 'Missing Transaction'
  END as transaction_status,
  wt.id as transaction_id,
  wt.amount as transaction_amount
FROM mmp_site_entries mse
LEFT JOIN wallet_transactions wt ON (
  (wt.site_visit_id = mse.id OR wt.related_site_visit_id = mse.id)
  AND wt.type IN ('earning')
)
WHERE LOWER(mse.status) = 'completed'
  AND (mse.accepted_by IS NOT NULL OR mse.claimed_by IS NOT NULL OR mse.visit_completed_by IS NOT NULL)
  AND (COALESCE(mse.cost, 0) > 0 OR COALESCE(mse.enumerator_fee, 0) > 0)
ORDER BY mse.visit_completed_at DESC NULLS LAST
LIMIT 20;

-- Test 3: Manually trigger the function for a test site (replace with actual site ID)
-- Uncomment and replace 'YOUR_SITE_ID' with an actual site ID to test
/*
DO $$
DECLARE
  test_site_id uuid := 'YOUR_SITE_ID'::uuid;
  test_site_record mmp_site_entries%ROWTYPE;
BEGIN
  -- Get the site record
  SELECT * INTO test_site_record
  FROM mmp_site_entries
  WHERE id = test_site_id;
  
  -- Simulate status change to trigger the function
  UPDATE mmp_site_entries
  SET status = 'Completed'
  WHERE id = test_site_id
    AND status != 'Completed';
  
  RAISE NOTICE 'Trigger executed for site %', test_site_id;
END $$;
*/


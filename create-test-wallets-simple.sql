-- ==================================================
-- PACT WALLET TEST DATA - Simple Version
-- Run this in your Supabase SQL Editor
-- ==================================================

-- Step 1: Get 3 existing user IDs
WITH selected_users AS (
  SELECT id, email, full_name, ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM profiles
  LIMIT 3
),
-- Step 2: Delete any existing classifications for these users (to avoid conflicts)
cleanup AS (
  DELETE FROM user_classifications 
  WHERE user_id IN (SELECT id FROM selected_users)
),
-- Step 3: Insert new classifications
new_classifications AS (
  INSERT INTO user_classifications (user_id, classification_level, role_scope, is_active, created_at, updated_at)
  SELECT 
    id,
    CASE rn 
      WHEN 1 THEN 'A'
      WHEN 2 THEN 'B'
      WHEN 3 THEN 'C'
    END as classification_level,
    'dataCollector' as role_scope,
    true as is_active,
    NOW() as created_at,
    NOW() as updated_at
  FROM selected_users
  RETURNING user_id, classification_level
)
-- Step 4: Create/update wallets with balances
INSERT INTO wallets (user_id, balances, total_earned, total_withdrawn, created_at, updated_at)
SELECT 
  su.id,
  CASE su.rn 
    WHEN 1 THEN '{"SDG": 1500}'::jsonb
    WHEN 2 THEN '{"SDG": 875}'::jsonb
    WHEN 3 THEN '{"SDG": 625}'::jsonb
  END as balances,
  CASE su.rn 
    WHEN 1 THEN 1500
    WHEN 2 THEN 875
    WHEN 3 THEN 625
  END as total_earned,
  0 as total_withdrawn,
  NOW() as created_at,
  NOW() as updated_at
FROM selected_users su
ON CONFLICT (user_id) 
DO UPDATE SET 
  balances = EXCLUDED.balances,
  total_earned = EXCLUDED.total_earned,
  updated_at = NOW();

-- Step 5: Verify the results
SELECT 
  p.full_name as "Name",
  p.email as "Email",
  uc.classification_level as "Level",
  w.balances->>'SDG' as "Balance (SDG)",
  w.total_earned as "Total Earned",
  w.updated_at as "Last Updated"
FROM wallets w
JOIN profiles p ON w.user_id = p.id
LEFT JOIN user_classifications uc ON w.user_id = uc.user_id AND uc.is_active = true
WHERE w.total_earned > 0
ORDER BY w.updated_at DESC
LIMIT 10;

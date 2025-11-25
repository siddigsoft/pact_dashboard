-- ==================================================
-- PACT WALLET TEST DATA - Using Existing Users
-- Run this in your Supabase SQL Editor
-- ==================================================

-- Step 1: Get 3 existing users and create wallets for them
DO $$
DECLARE
  user1_id uuid;
  user2_id uuid;
  user3_id uuid;
BEGIN
  -- Get 3 existing user IDs from profiles
  SELECT id INTO user1_id FROM profiles ORDER BY created_at LIMIT 1 OFFSET 0;
  SELECT id INTO user2_id FROM profiles ORDER BY created_at LIMIT 1 OFFSET 1;
  SELECT id INTO user3_id FROM profiles ORDER BY created_at LIMIT 1 OFFSET 2;

  -- Create/update classifications for these users (Level A, B, C)
  INSERT INTO user_classifications (user_id, classification_level, role_scope, is_active, created_at, updated_at)
  VALUES 
    (user1_id, 'A', 'dataCollector', true, NOW(), NOW()),
    (user2_id, 'B', 'dataCollector', true, NOW(), NOW()),
    (user3_id, 'C', 'dataCollector', true, NOW(), NOW())
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    classification_level = EXCLUDED.classification_level, 
    is_active = true,
    updated_at = NOW();

  -- Create/update wallets with test balances
  -- Alice (Level A): 1,500 SDG from 2 completed visits
  INSERT INTO wallets (user_id, balances, total_earned, total_withdrawn, created_at, updated_at)
  VALUES (user1_id, '{"SDG": 1500}', 1500, 0, NOW(), NOW())
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    balances = '{"SDG": 1500}',
    total_earned = 1500,
    updated_at = NOW();

  -- Bob (Level B): 875 SDG from 2 completed visits
  INSERT INTO wallets (user_id, balances, total_earned, total_withdrawn, created_at, updated_at)
  VALUES (user2_id, '{"SDG": 875}', 875, 0, NOW(), NOW())
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    balances = '{"SDG": 875}',
    total_earned = 875,
    updated_at = NOW();

  -- Carol (Level C): 625 SDG from 2 completed visits
  INSERT INTO wallets (user_id, balances, total_earned, total_withdrawn, created_at, updated_at)
  VALUES (user3_id, '{"SDG": 625}', 625, 0, NOW(), NOW())
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    balances = '{"SDG": 625}',
    total_earned = 625,
    updated_at = NOW();

  RAISE NOTICE 'Test wallets created successfully for user IDs: %, %, %', user1_id, user2_id, user3_id;
END $$;

-- Step 2: Verify the test data
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

-- Simple wallet test data creation script
-- Run this in Supabase SQL Editor

-- Step 1: Update 3 wallets with balances
WITH target_wallets AS (
  SELECT id, user_id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM wallets
  ORDER BY created_at
  LIMIT 3
)
UPDATE wallets w
SET 
  balances = CASE tw.rn
    WHEN 1 THEN '{"SDG": 1500}'::jsonb
    WHEN 2 THEN '{"SDG": 875}'::jsonb
    WHEN 3 THEN '{"SDG": 625}'::jsonb
  END,
  total_earned = CASE tw.rn
    WHEN 1 THEN 1500
    WHEN 2 THEN 875
    WHEN 3 THEN 625
  END,
  updated_at = NOW()
FROM target_wallets tw
WHERE w.id = tw.id;

-- Step 2: Create site visits and transactions
DO $$
DECLARE
  w1_id uuid; w2_id uuid; w3_id uuid;
  u1_id uuid; u2_id uuid; u3_id uuid;
  v1_id uuid; v2_id uuid; v3_id uuid;
BEGIN
  -- Get wallets
  SELECT id, user_id INTO w1_id, u1_id FROM wallets ORDER BY created_at LIMIT 1 OFFSET 0;
  SELECT id, user_id INTO w2_id, u2_id FROM wallets ORDER BY created_at LIMIT 1 OFFSET 1;
  SELECT id, user_id INTO w3_id, u3_id FROM wallets ORDER BY created_at LIMIT 1 OFFSET 2;
  
  -- Create site visits
  INSERT INTO site_visits (id, site_name, site_code, locality, state, activity, status, assigned_to, due_date, completed_at, created_at)
  VALUES
    (gen_random_uuid(), 'Hospital Monitoring', 'HOSP-001', 'Khartoum North', 'Khartoum', 'Health Facility', 'completed', u1_id, '2025-11-15', '2025-11-15 16:30:00', NOW()),
    (gen_random_uuid(), 'School Assessment', 'SCH-002', 'Omdurman', 'Khartoum', 'Education Site', 'completed', u2_id, '2025-11-18', '2025-11-18 14:15:00', NOW()),
    (gen_random_uuid(), 'Community Center', 'COM-003', 'Bahri', 'Khartoum', 'Community Program', 'completed', u3_id, '2025-11-20', '2025-11-20 11:45:00', NOW())
  ON CONFLICT DO NOTHING;
  
  -- Get site visit IDs
  SELECT id INTO v1_id FROM site_visits WHERE site_code = 'HOSP-001' LIMIT 1;
  SELECT id INTO v2_id FROM site_visits WHERE site_code = 'SCH-002' LIMIT 1;
  SELECT id INTO v3_id FROM site_visits WHERE site_code = 'COM-003' LIMIT 1;
  
  -- Create transactions
  IF v1_id IS NOT NULL THEN
    INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, currency, site_visit_id, description, balance_before, balance_after, created_at)
    VALUES
      (w1_id, u1_id, 'bonus', 750, 'SDG', NULL, 'Monthly retainer - November 2025', 0, 750, '2025-11-01 09:00:00'),
      (w1_id, u1_id, 'site_visit_fee', 500, 'SDG', v1_id, 'Site visit - Hospital Monitoring', 750, 1250, '2025-11-15 14:30:00'),
      (w1_id, u1_id, 'bonus', 250, 'SDG', NULL, 'Performance bonus', 1250, 1500, '2025-11-16 10:00:00'),
      
      (w2_id, u2_id, 'bonus', 437.5, 'SDG', NULL, 'Monthly retainer - November 2025', 0, 437.5, '2025-11-01 09:00:00'),
      (w2_id, u2_id, 'site_visit_fee', 437.5, 'SDG', v2_id, 'Site visit - School Assessment', 437.5, 875, '2025-11-18 11:15:00'),
      
      (w3_id, u3_id, 'bonus', 312.5, 'SDG', NULL, 'Monthly retainer - November 2025', 0, 312.5, '2025-11-01 09:00:00'),
      (w3_id, u3_id, 'site_visit_fee', 312.5, 'SDG', v3_id, 'Site visit - Community Center', 312.5, 625, '2025-11-20 15:45:00')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Show results
SELECT p.full_name, w.balances, w.total_earned
FROM wallets w
JOIN profiles p ON w.user_id = p.id
WHERE w.total_earned > 0
ORDER BY w.total_earned DESC;

-- ==================================================
-- COMPLETE WALLET TEST DATA WITH SITE VISITS (FIXED)
-- Uses correct site_visits column names
-- ==================================================

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

-- Step 2: Get existing site visits (if any) or we'll use wallet IDs as references
DO $$
DECLARE
  wallet1_id uuid;
  wallet2_id uuid;
  wallet3_id uuid;
  user1_id uuid;
  user2_id uuid;
  user3_id uuid;
  visit1_id uuid;
  visit2_id uuid;
  visit3_id uuid;
BEGIN
  -- Get wallet and user IDs
  SELECT id, user_id INTO wallet1_id, user1_id FROM wallets ORDER BY created_at LIMIT 1 OFFSET 0;
  SELECT id, user_id INTO wallet2_id, user2_id FROM wallets ORDER BY created_at LIMIT 1 OFFSET 1;
  SELECT id, user_id INTO wallet3_id, user3_id FROM wallets ORDER BY created_at LIMIT 1 OFFSET 2;
  
  -- Create sample site visits with correct column names
  INSERT INTO site_visits (
    id, 
    site_name, 
    site_code, 
    locality, 
    state, 
    activity, 
    status, 
    assigned_to, 
    due_date, 
    completed_at,
    created_at
  )
  VALUES
    (gen_random_uuid(), 'Hospital Monitoring', 'HOSP-001', 'Khartoum North', 'Khartoum', 'Health Facility Monitoring', 'completed', user1_id, '2025-11-15', '2025-11-15 16:30:00', NOW()),
    (gen_random_uuid(), 'School Assessment', 'SCH-002', 'Omdurman', 'Khartoum', 'Education Site Visit', 'completed', user2_id, '2025-11-18', '2025-11-18 14:15:00', NOW()),
    (gen_random_uuid(), 'Community Center Inspection', 'COM-003', 'Bahri', 'Khartoum', 'Community Program Review', 'completed', user3_id, '2025-11-20', '2025-11-20 11:45:00', NOW())
  ON CONFLICT DO NOTHING
  RETURNING id INTO visit1_id;
  
  -- Get the created site visit IDs
  SELECT id INTO visit1_id FROM site_visits WHERE site_code = 'HOSP-001' LIMIT 1;
  SELECT id INTO visit2_id FROM site_visits WHERE site_code = 'SCH-002' LIMIT 1;
  SELECT id INTO visit3_id FROM site_visits WHERE site_code = 'COM-003' LIMIT 1;
  
  -- If no site visits were created (conflict), skip transaction creation
  IF visit1_id IS NULL OR visit2_id IS NULL OR visit3_id IS NULL THEN
    RAISE NOTICE 'Site visits already exist or could not be created, creating transactions without site visit links';
    
    -- Create transactions without site visit links
    INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, currency, description, balance_before, balance_after, created_at)
    VALUES
      (wallet1_id, user1_id, 'site_visit_fee', 750, 'SDG', 'Site visit fee - November (Level A)', 0, 750, '2025-11-15 14:30:00'),
      (wallet1_id, user1_id, 'retainer', 750, 'SDG', 'Monthly retainer - November 2025', 750, 1500, '2025-11-01 09:00:00'),
      (wallet2_id, user2_id, 'site_visit_fee', 437.5, 'SDG', 'Site visit fee - November (Level B)', 0, 437.5, '2025-11-18 11:15:00'),
      (wallet2_id, user2_id, 'retainer', 437.5, 'SDG', 'Monthly retainer - November 2025', 437.5, 875, '2025-11-01 09:00:00'),
      (wallet3_id, user3_id, 'site_visit_fee', 312.5, 'SDG', 'Site visit fee - November (Level C)', 0, 312.5, '2025-11-20 15:45:00'),
      (wallet3_id, user3_id, 'retainer', 312.5, 'SDG', 'Monthly retainer - November 2025', 312.5, 625, '2025-11-01 09:00:00')
    ON CONFLICT DO NOTHING;
  ELSE
    -- Create transactions with site visit links
    INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, currency, site_visit_id, description, balance_before, balance_after, created_at)
    VALUES
      (wallet1_id, user1_id, 'site_visit_fee', 750, 'SDG', visit1_id, 'Site visit fee - Hospital Monitoring (Level A)', 0, 750, '2025-11-15 14:30:00'),
      (wallet1_id, user1_id, 'retainer', 750, 'SDG', NULL, 'Monthly retainer - November 2025', 750, 1500, '2025-11-01 09:00:00'),
      (wallet2_id, user2_id, 'site_visit_fee', 437.5, 'SDG', visit2_id, 'Site visit fee - School Assessment (Level B)', 0, 437.5, '2025-11-18 11:15:00'),
      (wallet2_id, user2_id, 'retainer', 437.5, 'SDG', NULL, 'Monthly retainer - November 2025', 437.5, 875, '2025-11-01 09:00:00'),
      (wallet3_id, user3_id, 'site_visit_fee', 312.5, 'SDG', visit3_id, 'Site visit fee - Community Center Inspection (Level C)', 0, 312.5, '2025-11-20 15:45:00'),
      (wallet3_id, user3_id, 'retainer', 312.5, 'SDG', NULL, 'Monthly retainer - November 2025', 312.5, 625, '2025-11-01 09:00:00')
    ON CONFLICT DO NOTHING;
  END IF;

END $$;

-- Step 3: Verify the results
SELECT 
  p.full_name as "User",
  p.email as "Email",
  w.balances->>'SDG' as "Balance (SDG)",
  COUNT(DISTINCT wt.id) as "Transactions",
  COUNT(DISTINCT sv.id) as "Site Visits"
FROM wallets w
JOIN profiles p ON w.user_id = p.id
LEFT JOIN wallet_transactions wt ON w.id = wt.wallet_id
LEFT JOIN site_visits sv ON wt.site_visit_id = sv.id
WHERE w.total_earned > 0
GROUP BY p.full_name, p.email, w.balances
ORDER BY (w.balances->>'SDG')::numeric DESC;

-- Step 4: Show transaction details
SELECT 
  p.full_name as "User",
  wt.type as "Type",
  wt.amount as "Amount",
  sv.site_name as "Site Visit",
  sv.locality as "Location",
  wt.description as "Description",
  wt.created_at as "Date"
FROM wallet_transactions wt
JOIN wallets w ON wt.wallet_id = w.id
JOIN profiles p ON w.user_id = p.id
LEFT JOIN site_visits sv ON wt.site_visit_id = sv.id
WHERE w.total_earned > 0
ORDER BY p.full_name, wt.created_at;

-- Set Ahmed Abbas's secondary hub to Dongola Hub
-- This allows him to see cost submissions, down-payments, and wallet requests from BOTH hubs.
-- Run in Supabase Studio → SQL Editor

UPDATE profiles
SET secondary_hub_id = 'dongola-hub'
WHERE LOWER(full_name) LIKE '%ahmed%abbas%'
  AND role = 'supervisor';

-- Verify:
SELECT id, full_name, hub_id, secondary_hub_id
FROM profiles
WHERE LOWER(full_name) LIKE '%ahmed%abbas%';

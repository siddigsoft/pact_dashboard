-- Add secondary_hub_id column to profiles table for dual-hub supervisor support
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS secondary_hub_id TEXT;

-- Update ahmed.abass profile to have both Country Office + Dongola Hub
UPDATE profiles
SET 
  hub_id = 'country-office',
  secondary_hub_id = 'dongola-hub'
WHERE username = 'ahmed.abass';

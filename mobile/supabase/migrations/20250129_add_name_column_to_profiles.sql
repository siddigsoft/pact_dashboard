-- Add name column to profiles table for WebRTC compatibility
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS name TEXT;

-- Update existing records to set name from full_name if available
UPDATE profiles SET name = full_name WHERE name IS NULL AND full_name IS NOT NULL;

-- Add comment
COMMENT ON COLUMN profiles.name IS 'User display name for calls and notifications';
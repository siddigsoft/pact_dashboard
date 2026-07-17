-- Add new fields to profiles table for enhanced registration (matching React implementation)

-- Add new fields if they don't exist
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS hub_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS state_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended'));

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_hub_id ON profiles(hub_id);
CREATE INDEX IF NOT EXISTS idx_profiles_state_id ON profiles(state_id);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_employee_id ON profiles(employee_id);

-- Add comments for documentation
COMMENT ON COLUMN profiles.status IS 'User account status: active (approved), pending (awaiting approval), or suspended (access revoked)';
COMMENT ON COLUMN profiles.hub_id IS 'Hub office location identifier (khartoum, darfur, kordofan)';
COMMENT ON COLUMN profiles.state_id IS 'State location identifier for field team members';
COMMENT ON COLUMN profiles.employee_id IS 'Optional employee identification number';
COMMENT ON COLUMN profiles.phone IS 'User contact phone number (required for field team roles)';

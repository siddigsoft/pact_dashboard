-- MINIMAL Push Notification Setup for PACT Mobile
-- Run this in Supabase SQL Editor - Simplified to avoid schema conflicts

-- ============================================================================
-- STEP 1: Add fcm_tokens column to profiles table
-- ============================================================================

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS fcm_tokens TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_profiles_fcm_tokens ON profiles USING gin(fcm_tokens);

-- ============================================================================
-- STEP 2: Create notification_logs table
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  notification_type VARCHAR(50),
  recipient_user_id UUID,
  sender_user_id UUID,
  call_id VARCHAR,
  message_id UUID,
  chat_id UUID,
  site_id UUID,
  payment_id UUID,
  title VARCHAR(255),
  body VARCHAR(500),
  fcm_message_id VARCHAR,
  status VARCHAR(20) DEFAULT 'sent',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- STEP 3: Create indexes for faster queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_notification_logs_user ON notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_type ON notification_logs(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created ON notification_logs(created_at DESC);

-- ============================================================================
-- STEP 4: Drop table if it has issues and recreate
-- ============================================================================

-- Drop table if it exists with problematic constraints
DROP TABLE IF EXISTS notification_logs CASCADE;

-- Recreate without any foreign key constraints
CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  notification_type VARCHAR(50),
  recipient_user_id UUID,
  sender_user_id UUID,
  call_id VARCHAR,
  message_id UUID,
  chat_id UUID,
  site_id UUID,
  payment_id UUID,
  title VARCHAR(255),
  body VARCHAR(500),
  fcm_message_id VARCHAR,
  status VARCHAR(20) DEFAULT 'sent',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- STEP 5: Recreate indexes after table recreation
-- ============================================================================

CREATE INDEX idx_notification_logs_user ON notification_logs(user_id);
CREATE INDEX idx_notification_logs_type ON notification_logs(notification_type);
CREATE INDEX idx_notification_logs_status ON notification_logs(status);
CREATE INDEX idx_notification_logs_created ON notification_logs(created_at DESC);

-- ============================================================================
-- STEP 6: Enable RLS and create permissive policy
-- ============================================================================

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role (Edge Functions) full access
CREATE POLICY "service_role_access" ON notification_logs
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- ============================================================================
-- VERIFICATION QUERIES (Run these separately to verify setup)
-- ============================================================================

-- Check 1: Verify fcm_tokens column exists
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'fcm_tokens';

-- Check 2: Verify notification_logs table exists  
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'notification_logs';

-- Check 3: Count users with FCM tokens
-- SELECT COUNT(*) as users_with_tokens FROM profiles WHERE ARRAY_LENGTH(fcm_tokens, 1) > 0;

-- Check 4: View recent notifications
-- SELECT * FROM notification_logs ORDER BY created_at DESC LIMIT 20;

-- ============================================================================
-- TROUBLESHOOTING
-- ============================================================================

-- Check notification status summary
-- SELECT notification_type, status, COUNT(*) FROM notification_logs GROUP BY notification_type, status;

-- Check failed notifications
-- SELECT * FROM notification_logs WHERE status IN ('failed', 'no_token') ORDER BY created_at DESC;

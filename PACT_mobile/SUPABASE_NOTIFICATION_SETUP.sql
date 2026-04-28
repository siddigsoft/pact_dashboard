-- Complete Push Notification Setup for PACT Mobile
-- Run this in Supabase SQL Editor

-- ============================================================================
-- 1. ALTER profiles TABLE TO STORE FCM TOKENS
-- ============================================================================

-- Add fcm_tokens column if it doesn't exist
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS fcm_tokens TEXT[] DEFAULT '{}';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_fcm_tokens ON profiles USING gin(fcm_tokens);

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS firebase_device_token VARCHAR DEFAULT NULL;

-- ============================================================================
-- 2. CREATE notification_logs TABLE (for audit trail)
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

-- Create indexes for notification_logs
CREATE INDEX IF NOT EXISTS idx_notification_logs_user ON notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_type ON notification_logs(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created ON notification_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_recipient ON notification_logs(recipient_user_id);

-- ============================================================================
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications" ON notification_logs
  FOR SELECT USING (user_id = auth.uid());

-- Service role can insert/update (for Edge Functions)
CREATE POLICY "Service role can manage notifications" ON notification_logs
  USING (auth.role() = 'service_role');

-- Allow anonymous insert for backward compatibility
CREATE POLICY "Anyone can insert notifications" ON notification_logs
  FOR INSERT WITH CHECK (true);

-- ============================================================================
-- 4. CREATE TABLES FOR SITE CLAIMS & PAYMENTS (if not exist)
-- ============================================================================

CREATE TABLE IF NOT EXISTS site_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  claimed_by VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_site_claims_user ON site_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_site_claims_site ON site_claims(site_id);

CREATE TABLE IF NOT EXISTS site_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  amount DECIMAL(12, 2),
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed', 'failed'
  payment_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_payments_user ON site_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_site_payments_status ON site_payments(status);

-- ============================================================================
-- 5-8. TRIGGER FUNCTIONS (OPTIONAL - Currently Disabled)
-- ============================================================================
-- Triggers are commented out because table schemas may vary
-- The app and Edge Functions will create entries in notification_logs directly
-- Uncomment these after verifying your table column names match

-- CREATE OR REPLACE FUNCTION notify_missed_call()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   IF (NEW.status = 'missed' OR NEW.status = 'unreachable') THEN
--     INSERT INTO notification_logs (user_id, notification_type, call_id, title, body, status)
--     VALUES (NEW.user_id, 'missed_call', NEW.id::VARCHAR, 'Missed Call', 'You have a missed call', 'pending');
--   END IF;
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. FIREBASE CREDENTIALS
-- ============================================================================

-- To enable push notifications, you MUST add your Firebase service account:
-- 1. Go to Supabase Dashboard → Settings → Edge Functions  
-- 2. Add new secret named: FIREBASE_SERVICE_ACCOUNT_JSON
-- 3. Paste your Firebase service account JSON (from Firebase Console → Settings → Service Accounts)

-- Verify it's set with:
-- SELECT name FROM vault.decrypted_secrets WHERE name = 'FIREBASE_SERVICE_ACCOUNT_JSON';

-- If FIREBASE_SERVICE_ACCOUNT_JSON is missing:
-- 1. Go to Supabase Dashboard → Project Settings → Secrets
-- 2. Create new secret: FIREBASE_SERVICE_ACCOUNT_JSON
-- 3. Paste your Firebase service account JSON (from Firebase Console → Settings → Service Accounts)

-- ============================================================================
-- 10. VERIFY EDGE FUNCTIONS ARE DEPLOYED
-- ============================================================================

-- Check this via Supabase Dashboard:
-- Functions → send-missed-call-notification → Status should be ACTIVE
-- Functions → send-message-notification → Status should be ACTIVE

-- ============================================================================
-- 11. VERIFY FCM TOKENS ARE BEING SAVED
-- ============================================================================

-- Check if tokens exist:
SELECT id, fcm_tokens, ARRAY_LENGTH(fcm_tokens, 1) as token_count
FROM profiles
WHERE fcm_tokens IS NOT NULL AND ARRAY_LENGTH(fcm_tokens, 1) > 0
LIMIT 10;

-- ============================================================================
-- 12. CREATE A MONITORING VIEW
-- ============================================================================

CREATE OR REPLACE VIEW notification_summary AS
SELECT 
  DATE(created_at) as date,
  notification_type,
  status,
  COUNT(*) as count,
  COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
  COUNT(CASE WHEN status = 'no_token' THEN 1 END) as no_token
FROM notification_logs
GROUP BY DATE(created_at), notification_type, status
ORDER BY date DESC, notification_type;

-- ============================================================================
-- 13. GENERATE TEST DATA (Optional)
-- ============================================================================

-- Test if a user has FCM tokens
-- SELECT id, full_name, fcm_tokens FROM profiles WHERE id = 'YOUR_USER_ID';

-- View recent notifications
-- SELECT * FROM notification_logs ORDER BY created_at DESC LIMIT 20;

-- ============================================================================
-- 14. TROUBLESHOOTING
-- ============================================================================

-- Check if Edge Functions can access profiles fcm_tokens:
-- SELECT COUNT(*) FROM profiles WHERE ARRAY_LENGTH(fcm_tokens, 1) > 0;

-- Check recent notification attempts:
-- SELECT notification_type, status, COUNT(*) FROM notification_logs GROUP BY notification_type, status;

-- Check failed notifications:
-- SELECT * FROM notification_logs WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10;

-- Simplified notification system - core tables and functions only
-- Created: 2026-03-22

-- Create notification_logs table for tracking all notifications
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type TEXT NOT NULL, -- 'missed_call', 'message'
  recipient_user_id UUID,
  sender_user_id UUID,
  call_id UUID,
  message_id UUID,
  chat_id UUID,
  fcm_message_id TEXT,
  status TEXT NOT NULL, -- 'sent', 'failed', 'no_token'
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_notification_logs_recipient ON notification_logs(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_type ON notification_logs(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created ON notification_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_call_id ON notification_logs(call_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_message_id ON notification_logs(message_id);

-- Enable RLS for notification_logs
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own notification logs
DROP POLICY IF EXISTS "Users can view their own notification logs" ON notification_logs;
CREATE POLICY "Users can view their own notification logs"
  ON notification_logs FOR SELECT
  USING (auth.uid() = recipient_user_id OR auth.uid() = sender_user_id);

-- Create a view for monitoring notification statistics
CREATE OR REPLACE VIEW notification_hourly_stats AS
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  notification_type,
  status,
  COUNT(*) as count,
  COUNT(CASE WHEN error_message IS NOT NULL THEN 1 END) as errors
FROM notification_logs
GROUP BY DATE_TRUNC('hour', created_at), notification_type, status
ORDER BY hour DESC;

-- Grant permissions to see the view
GRANT SELECT ON notification_hourly_stats TO authenticated;

-- Add RLS policies for service role access to profiles (required for FCM token lookup)
DROP POLICY IF EXISTS "Service role can read all profiles" ON profiles;
CREATE POLICY "Service role can read all profiles"
  ON profiles FOR SELECT
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can update profiles" ON profiles;
CREATE POLICY "Service role can update profiles"  
  ON profiles FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

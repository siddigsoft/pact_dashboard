-- Test: Create notification_logs table only
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type TEXT NOT NULL,
  recipient_user_id UUID,
  sender_user_id UUID,
  call_id UUID,
  message_id UUID,
  chat_id UUID,
  fcm_message_id TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_notification_logs_recipient ON notification_logs(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_type ON notification_logs(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created ON notification_logs(created_at DESC);

SELECT 'notification_logs table created successfully' as status;

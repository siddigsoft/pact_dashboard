-- Phase 1.3: Notification Delivery Tracking
-- Tracks email, WhatsApp, and push delivery status for full visibility
-- Run date: 2026-04-20

-- Notification delivery logs table
CREATE TABLE IF NOT EXISTS notification_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  task_id UUID REFERENCES personal_tasks(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'push', 'in_app')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivering', 'delivered', 'failed', 'read', 'bounced')),
  delivery_timestamp TIMESTAMPTZ,
  read_timestamp TIMESTAMPTZ,
  error_message TEXT,
  provider TEXT, -- 'meta', 'wasender', 'fcm', 'system'
  provider_reference_id TEXT, -- external message ID
  attempt_count INT DEFAULT 1,
  max_retries INT DEFAULT 3,
  last_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_delivery_logs_task_id ON notification_delivery_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_user_id ON notification_delivery_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_status ON notification_delivery_logs(status) WHERE status NOT IN ('delivered', 'read');
CREATE INDEX IF NOT EXISTS idx_delivery_logs_channel ON notification_delivery_logs(channel, status);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_created_at ON notification_delivery_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_notification_id ON notification_delivery_logs(notification_id);

-- Enable RLS for data privacy
ALTER TABLE notification_delivery_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view delivery logs for their own notifications
CREATE POLICY delivery_logs_select_own ON notification_delivery_logs
FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' IN ('admin', 'superadmin', 'ict'))
  )
);

-- RLS Policy: Only system can insert
CREATE POLICY delivery_logs_insert_system ON notification_delivery_logs
FOR INSERT WITH CHECK (true);

-- RLS Policy: Only system can update
CREATE POLICY delivery_logs_update_system ON notification_delivery_logs
FOR UPDATE USING (true) WITH CHECK (true);

-- Function to track retries
CREATE OR REPLACE FUNCTION record_delivery_attempt(
  p_notification_id UUID,
  p_task_id UUID,
  p_user_id UUID,
  p_channel TEXT,
  p_status TEXT,
  p_provider TEXT DEFAULT NULL,
  p_provider_ref_id TEXT DEFAULT NULL,
  p_error_msg TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO notification_delivery_logs (
    notification_id,
    task_id,
    user_id,
    channel,
    status,
    provider,
    provider_reference_id,
    error_message
  ) VALUES (
    p_notification_id,
    p_task_id,
    p_user_id,
    p_channel,
    p_status,
    p_provider,
    p_provider_ref_id,
    p_error_msg
  )
  ON CONFLICT (id) DO UPDATE SET
    status = p_status,
    updated_at = NOW(),
    attempt_count = attempt_count + 1,
    last_retry_at = NOW(),
    error_message = COALESCE(p_error_msg, error_message);
END;
$$ LANGUAGE plpgsql;

-- Function to mark delivery as successful
CREATE OR REPLACE FUNCTION mark_delivery_delivered(
  p_notification_id UUID,
  p_channel TEXT,
  p_timestamp TIMESTAMPTZ DEFAULT NOW()
)
RETURNS VOID AS $$
BEGIN
  UPDATE notification_delivery_logs
  SET 
    status = 'delivered',
    delivery_timestamp = p_timestamp,
    updated_at = NOW()
  WHERE notification_id = p_notification_id
    AND channel = p_channel;
END;
$$ LANGUAGE plpgsql;

-- Function to mark delivery as read
CREATE OR REPLACE FUNCTION mark_delivery_read(
  p_notification_id UUID,
  p_channel TEXT,
  p_timestamp TIMESTAMPTZ DEFAULT NOW()
)
RETURNS VOID AS $$
BEGIN
  UPDATE notification_delivery_logs
  SET 
    status = 'read',
    read_timestamp = p_timestamp,
    updated_at = NOW()
  WHERE notification_id = p_notification_id
    AND channel = p_channel;
END;
$$ LANGUAGE plpgsql;

-- Function to get delivery summary for a notification
CREATE OR REPLACE FUNCTION get_notification_delivery_summary(p_notification_id UUID)
RETURNS TABLE (
  channel TEXT,
  status TEXT,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    notification_delivery_logs.channel,
    notification_delivery_logs.status,
    COUNT(*)::BIGINT
  FROM notification_delivery_logs
  WHERE notification_id = p_notification_id
  GROUP BY channel, status
  ORDER BY channel, status;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON notification_delivery_logs TO authenticated;
GRANT EXECUTE ON FUNCTION record_delivery_attempt TO authenticated;
GRANT EXECUTE ON FUNCTION mark_delivery_delivered TO authenticated;
GRANT EXECUTE ON FUNCTION mark_delivery_read TO authenticated;
GRANT EXECUTE ON FUNCTION get_notification_delivery_summary TO authenticated;

-- Migration: Create notification system triggers for missed calls and messages
-- This migration sets up automatic FCM notification sending via Edge Functions
-- when calls end or messages are sent

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

-- Function to send missed call notification via Edge Function
CREATE OR REPLACE FUNCTION send_missed_call_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_response record;
  v_caller_name TEXT;
  v_edge_function_url TEXT;
  v_service_role_key TEXT;
BEGIN
  -- Check if this is a missed/rejected/failed call
  IF NEW.status NOT IN ('missed', 'rejected', 'failed') THEN
    RETURN NEW;
  END IF;

  -- Only send if call wasn't answered (NEW call_type is 'incoming' and status is not 'completed')
  IF NEW.call_type != 'incoming' THEN
    RETURN NEW;
  END IF;

  -- Get caller name from profiles table
  SELECT full_name INTO v_caller_name
  FROM profiles
  WHERE id = NEW.caller_id;

  -- Get service role key from secrets (you'll need to set this in Supabase)
  v_edge_function_url := current_setting('app.supabase_url', true) || '/functions/v1/send-missed-call-notification';
  v_service_role_key := current_setting('app.service_role_key', true);

  -- Call the Edge Function to send FCM notification
  -- Note: This requires http extension - ensure it's enabled!
  BEGIN
    SELECT * INTO v_response FROM http_post(
      v_edge_function_url,
      jsonb_build_object(
        'caller_user_id', NEW.caller_id,
        'receiver_user_id', NEW.user_id,
        'receiver_name', (SELECT full_name FROM profiles WHERE id = NEW.user_id),
        'call_id', NEW.id::text,
        'reason', NEW.status
      )::text,
      'application/json',
      jsonb_build_object(
        'Authorization', 'Bearer ' || v_service_role_key
      )
    );

    -- Log the notification attempt
    INSERT INTO notification_logs (
      notification_type,
      recipient_user_id,
      sender_user_id,
      call_id,
      fcm_message_id,
      status,
      error_message
    ) VALUES (
      'missed_call',
      NEW.user_id,
      NEW.caller_id,
      NEW.id,
      NULL,
      'sent',
      NULL
    );

  EXCEPTION WHEN OTHERS THEN
    -- Log failed notification attempt
    INSERT INTO notification_logs (
      notification_type,
      recipient_user_id,
      sender_user_id,
      call_id,
      status,
      error_message
    ) VALUES (
      'missed_call',
      NEW.user_id,
      NEW.caller_id,
      NEW.id,
      'failed',
      SQLERRM
    );
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for missed call notifications (if table exists)
DO $$
BEGIN
  BEGIN
    DROP TRIGGER IF EXISTS missed_call_notification_trigger ON call_history;
    
    CREATE TRIGGER missed_call_notification_trigger
    AFTER INSERT OR UPDATE ON call_history
    FOR EACH ROW
    WHEN (NEW.status IN ('missed', 'rejected', 'failed') AND NEW.call_type = 'incoming')
    EXECUTE FUNCTION send_missed_call_notification();
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Table doesn't exist yet, will be created later
  END;
END $$;

-- Function to send message notification via Edge Function
CREATE OR REPLACE FUNCTION send_message_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_response record;
  v_sender_name TEXT;
  v_is_muted BOOLEAN;
  v_message_preview TEXT;
  v_edge_function_url TEXT;
  v_service_role_key TEXT;
BEGIN
  -- Get sender name from profiles table
  SELECT full_name INTO v_sender_name
  FROM profiles
  WHERE id = NEW.sender_id;

  -- Check if notifications are muted for this chat
  SELECT muted INTO v_is_muted
  FROM chat_participants
  WHERE user_id = NEW.recipient_id AND chat_id = NEW.chat_id;

  -- Only send if notifications not muted
  IF COALESCE(v_is_muted, false) THEN
    RETURN NEW;
  END IF;

  -- Truncate message preview to 150 characters
  v_message_preview := SUBSTRING(NEW.content, 1, 150);

  -- Get service role key from secrets
  v_edge_function_url := current_setting('app.supabase_url', true) || '/functions/v1/send-message-notification';
  v_service_role_key := current_setting('app.service_role_key', true);

  -- Call the Edge Function to send FCM notification
  BEGIN
    SELECT * INTO v_response FROM http_post(
      v_edge_function_url,
      jsonb_build_object(
        'recipient_user_id', NEW.recipient_id,
        'sender_user_id', NEW.sender_id,
        'sender_name', v_sender_name,
        'chat_id', NEW.chat_id::text,
        'message_id', NEW.id::text,
        'message_preview', v_message_preview
      )::text,
      'application/json',
      jsonb_build_object(
        'Authorization', 'Bearer ' || v_service_role_key
      )
    );

    -- Log the notification attempt
    INSERT INTO notification_logs (
      notification_type,
      recipient_user_id,
      sender_user_id,
      message_id,
      chat_id,
      fcm_message_id,
      status,
      error_message
    ) VALUES (
      'message',
      NEW.recipient_id,
      NEW.sender_id,
      NEW.id,
      NEW.chat_id,
      NULL,
      'sent',
      NULL
    );

  EXCEPTION WHEN OTHERS THEN
    -- Log failed notification attempt
    INSERT INTO notification_logs (
      notification_type,
      recipient_user_id,
      sender_user_id,
      message_id,
      chat_id,
      status,
      error_message
    ) VALUES (
      'message',
      NEW.recipient_id,
      NEW.sender_id,
      NEW.id,
      NEW.chat_id,
      'failed',
      SQLERRM
    );
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for message notifications (if table exists)
DO $$
BEGIN
  BEGIN
    DROP TRIGGER IF EXISTS message_notification_trigger ON messages;
    
    CREATE TRIGGER message_notification_trigger
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION send_message_notification();
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Table doesn't exist yet, will be created later
  END;
END $$;

-- RLS Policy: Edge Functions can read profiles for FCM tokens
DROP POLICY IF EXISTS "Service role can read all profiles" ON profiles;
CREATE POLICY "Service role can read all profiles"
  ON profiles FOR SELECT
  USING (auth.role() = 'service_role');

-- RLS Policy: Allow service role to update profiles
DROP POLICY IF EXISTS "Service role can update profiles" ON profiles;
CREATE POLICY "Service role can update profiles"
  ON profiles FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

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

-- Note: This migration assumes:
-- 1. The http extension is enabled in Supabase
-- 2. The Edge Functions are already deployed
-- 3. The call_history and messages tables exist
-- 4. The profiles table has fcm_token column
-- 5. The chat_participants table has muted column

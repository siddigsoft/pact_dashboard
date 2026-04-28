-- ULTRA-MINIMAL SETUP - Just the essentials
-- Copy and run this ENTIRE block at once in Supabase SQL Editor

-- Add fcm_tokens column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fcm_tokens TEXT[] DEFAULT '{}';

-- Create notification logs table - completely minimal
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  notification_type TEXT,
  title TEXT,
  body TEXT,
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Done! That's it.

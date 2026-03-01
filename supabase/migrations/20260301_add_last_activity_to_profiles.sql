-- Add last_activity column to profiles
-- Written by web GlobalPresenceContext (every 5 min) and Flutter PresenceService heartbeat.
-- Used to show online/away status in Staff Directory without requiring a shared WebSocket channel.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.last_activity IS
  'Updated by web GlobalPresenceContext (every 5 min) and Flutter PresenceService heartbeat. '
  'Used to show online/away status in Staff Directory.';

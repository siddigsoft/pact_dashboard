-- Add FCM token columns to profiles
-- Safe to re-run with IF NOT EXISTS guards
BEGIN;

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS fcm_token text,
  ADD COLUMN IF NOT EXISTS fcm_token_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_fcm_token_updated_at
  ON public.profiles (fcm_token_updated_at DESC);

COMMIT;

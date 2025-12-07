-- Add last_active_at column to profiles table for accurate activity tracking
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_active_at timestamp with time zone DEFAULT now();

-- Create index for efficient queries on last_active_at
CREATE INDEX IF NOT EXISTS idx_profiles_last_active_at 
ON public.profiles (last_active_at DESC);

-- Update trigger to also update last_active_at when availability changes
CREATE OR REPLACE FUNCTION update_last_active_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_active_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update last_active_at on any profile update
CREATE TRIGGER update_profiles_last_active_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION update_last_active_at();

-- Initial migration: set last_active_at for existing users
UPDATE public.profiles
SET last_active_at = COALESCE(updated_at, created_at, now())
WHERE last_active_at IS NULL;

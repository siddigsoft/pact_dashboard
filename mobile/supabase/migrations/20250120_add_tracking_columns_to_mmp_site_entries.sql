-- Migration: Add tracking columns to mmp_site_entries table
-- Description: Adds columns for better tracking of verification and dispatch information
-- Date: 2025-01-20

BEGIN;

-- Add verified_by column (text to store username/identifier)
ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS verified_by text;

-- Add verified_at column (timestamp for when verification occurred)
ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS verified_at timestamp with time zone;

-- Add dispatched_by column (text to store username/identifier of who dispatched)
ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS dispatched_by text;

-- Add dispatched_at column (timestamp for when dispatch occurred)
ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS dispatched_at timestamp with time zone;

-- Add updated_at column (timestamp for tracking last update)
ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_mmp_site_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at on row updates
DROP TRIGGER IF EXISTS mmp_site_entries_updated_at_trigger ON public.mmp_site_entries;
CREATE TRIGGER mmp_site_entries_updated_at_trigger
  BEFORE UPDATE ON public.mmp_site_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_mmp_site_entries_updated_at();

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_verified_by ON public.mmp_site_entries(verified_by);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_verified_at ON public.mmp_site_entries(verified_at);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_dispatched_by ON public.mmp_site_entries(dispatched_by);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_dispatched_at ON public.mmp_site_entries(dispatched_at);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_status ON public.mmp_site_entries(status);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_updated_at ON public.mmp_site_entries(updated_at);

-- Add comments to columns for documentation
COMMENT ON COLUMN public.mmp_site_entries.verified_by IS 'Username or identifier of the user who verified this site entry';
COMMENT ON COLUMN public.mmp_site_entries.verified_at IS 'Timestamp when the site entry was verified';
COMMENT ON COLUMN public.mmp_site_entries.dispatched_by IS 'Username or identifier of the user who dispatched this site entry';
COMMENT ON COLUMN public.mmp_site_entries.dispatched_at IS 'Timestamp when the site entry was dispatched to data collectors';
COMMENT ON COLUMN public.mmp_site_entries.updated_at IS 'Timestamp when the site entry was last updated (automatically maintained)';

COMMIT;

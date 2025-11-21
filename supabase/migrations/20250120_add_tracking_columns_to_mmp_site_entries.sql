-- Migration: Add tracking columns to mmp_site_entries table
-- Description: Adds columns for better tracking of verification and dispatch information
-- Date: 2025-01-20

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

-- Migrate existing data from additional_data JSONB to new columns
-- This will extract verified_by, verified_at, dispatched_by, dispatched_at from additional_data
UPDATE public.mmp_site_entries
SET 
  verified_by = COALESCE(
    verified_by,
    CASE 
      WHEN additional_data->>'Verified By' IS NOT NULL THEN additional_data->>'Verified By'
      WHEN additional_data->>'verified_by' IS NOT NULL THEN additional_data->>'verified_by'
      ELSE NULL
    END
  ),
  verified_at = COALESCE(
    verified_at,
    CASE 
      WHEN additional_data->>'Verified At' IS NOT NULL THEN (additional_data->>'Verified At')::timestamptz
      WHEN additional_data->>'verified_at' IS NOT NULL THEN (additional_data->>'verified_at')::timestamptz
      ELSE NULL
    END
  ),
  dispatched_by = COALESCE(
    dispatched_by,
    CASE 
      WHEN additional_data->>'Dispatched By' IS NOT NULL THEN additional_data->>'Dispatched By'
      WHEN additional_data->>'dispatched_by' IS NOT NULL THEN additional_data->>'dispatched_by'
      ELSE NULL
    END
  ),
  dispatched_at = COALESCE(
    dispatched_at,
    CASE 
      WHEN additional_data->>'Dispatched At' IS NOT NULL THEN (additional_data->>'Dispatched At')::timestamptz
      WHEN additional_data->>'dispatched_at' IS NOT NULL THEN (additional_data->>'dispatched_at')::timestamptz
      ELSE NULL
    END
  ),
  updated_at = COALESCE(updated_at, created_at, now())
WHERE additional_data IS NOT NULL 
  AND (
    additional_data->>'Verified By' IS NOT NULL 
    OR additional_data->>'verified_by' IS NOT NULL
    OR additional_data->>'Verified At' IS NOT NULL
    OR additional_data->>'verified_at' IS NOT NULL
    OR additional_data->>'Dispatched By' IS NOT NULL
    OR additional_data->>'dispatched_by' IS NOT NULL
    OR additional_data->>'Dispatched At' IS NOT NULL
    OR additional_data->>'dispatched_at' IS NOT NULL
  );

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


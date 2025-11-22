-- Migration: Add accepted_by and accepted_at columns to mmp_site_entries table
-- Description: Adds columns to track which data collector accepted each site entry
-- Date: 2025-01-25

-- Add accepted_by column (text to store user ID or identifier of the data collector who accepted)
ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS accepted_by text;

-- Add accepted_at column (timestamp for when acceptance occurred)
ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS accepted_at timestamp with time zone;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_accepted_by ON public.mmp_site_entries(accepted_by);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_accepted_at ON public.mmp_site_entries(accepted_at);

-- Add comments to columns for documentation
COMMENT ON COLUMN public.mmp_site_entries.accepted_by IS 'User ID or identifier of the data collector who accepted this site entry (one entry, one data collector)';
COMMENT ON COLUMN public.mmp_site_entries.accepted_at IS 'Timestamp when the site entry was accepted by a data collector';

-- Migrate existing data from additional_data JSONB to new columns if present
UPDATE public.mmp_site_entries
SET 
  accepted_by = COALESCE(
    accepted_by,
    CASE 
      WHEN additional_data->>'Accepted By' IS NOT NULL THEN additional_data->>'Accepted By'
      WHEN additional_data->>'accepted_by' IS NOT NULL THEN additional_data->>'accepted_by'
      ELSE NULL
    END
  ),
  accepted_at = COALESCE(
    accepted_at,
    CASE 
      WHEN additional_data->>'Accepted At' IS NOT NULL THEN (additional_data->>'Accepted At')::timestamptz
      WHEN additional_data->>'accepted_at' IS NOT NULL THEN (additional_data->>'accepted_at')::timestamptz
      ELSE NULL
    END
  )
WHERE additional_data IS NOT NULL;


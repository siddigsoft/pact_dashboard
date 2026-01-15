-- Migration: Add accepted_by and accepted_at columns to mmp_site_entries table
-- Description: Adds columns to track which data collector accepted each site entry
-- Date: 2025-01-25

BEGIN;

-- Add accepted_by column (uuid to store user ID of the data collector who accepted)
ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS accepted_by uuid;

-- Add accepted_at column (timestamp for when acceptance occurred)
ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS accepted_at timestamp with time zone;

-- Add claimed_by column (uuid to store user ID of the data collector who claimed)
ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS claimed_by uuid;

-- Add claimed_at column (timestamp for when claim occurred)
ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS claimed_at timestamp with time zone;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_accepted_by ON public.mmp_site_entries(accepted_by);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_accepted_at ON public.mmp_site_entries(accepted_at);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_claimed_by ON public.mmp_site_entries(claimed_by);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_claimed_at ON public.mmp_site_entries(claimed_at);

-- Add comments to columns for documentation
COMMENT ON COLUMN public.mmp_site_entries.accepted_by IS 'User ID of the data collector who accepted this site entry (one entry, one data collector)';
COMMENT ON COLUMN public.mmp_site_entries.accepted_at IS 'Timestamp when the site entry was accepted by a data collector';
COMMENT ON COLUMN public.mmp_site_entries.claimed_by IS 'User ID of the enumerator who claimed this site';
COMMENT ON COLUMN public.mmp_site_entries.claimed_at IS 'Timestamp when the site was claimed by an enumerator';

-- Migrate existing data from additional_data JSONB to new columns if present
UPDATE public.mmp_site_entries
SET 
  accepted_by = COALESCE(
    accepted_by,
    CASE 
      WHEN additional_data->>'Accepted By' IS NOT NULL THEN (additional_data->>'Accepted By')::uuid
      WHEN additional_data->>'accepted_by' IS NOT NULL THEN (additional_data->>'accepted_by')::uuid
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
  ),
  claimed_by = COALESCE(
    claimed_by,
    CASE 
      WHEN additional_data->>'Claimed By' IS NOT NULL THEN (additional_data->>'Claimed By')::uuid
      WHEN additional_data->>'claimed_by' IS NOT NULL THEN (additional_data->>'claimed_by')::uuid
      ELSE NULL
    END
  ),
  claimed_at = COALESCE(
    claimed_at,
    CASE 
      WHEN additional_data->>'Claimed At' IS NOT NULL THEN (additional_data->>'Claimed At')::timestamptz
      WHEN additional_data->>'claimed_at' IS NOT NULL THEN (additional_data->>'claimed_at')::timestamptz
      ELSE NULL
    END
  )
WHERE additional_data IS NOT NULL;

COMMIT;

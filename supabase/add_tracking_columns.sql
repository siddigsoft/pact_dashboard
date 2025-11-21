-- SQL Query to Add Tracking Columns to mmp_site_entries Table
-- Run this query in your Supabase SQL editor or via psql

-- Step 1: Add new columns
ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS verified_by text,
ADD COLUMN IF NOT EXISTS verified_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS dispatched_by text,
ADD COLUMN IF NOT EXISTS dispatched_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Step 2: Create function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_mmp_site_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS mmp_site_entries_updated_at_trigger ON public.mmp_site_entries;
CREATE TRIGGER mmp_site_entries_updated_at_trigger
  BEFORE UPDATE ON public.mmp_site_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_mmp_site_entries_updated_at();

-- Step 4: Migrate existing data from additional_data to new columns
UPDATE public.mmp_site_entries
SET 
  verified_by = COALESCE(
    verified_by,
    additional_data->>'Verified By',
    additional_data->>'verified_by'
  ),
  verified_at = COALESCE(
    verified_at,
    CASE 
      WHEN additional_data->>'Verified At' IS NOT NULL 
        THEN (additional_data->>'Verified At')::timestamptz
      WHEN additional_data->>'verified_at' IS NOT NULL 
        THEN (additional_data->>'verified_at')::timestamptz
      ELSE NULL
    END
  ),
  dispatched_by = COALESCE(
    dispatched_by,
    additional_data->>'Dispatched By',
    additional_data->>'dispatched_by'
  ),
  dispatched_at = COALESCE(
    dispatched_at,
    CASE 
      WHEN additional_data->>'Dispatched At' IS NOT NULL 
        THEN (additional_data->>'Dispatched At')::timestamptz
      WHEN additional_data->>'dispatched_at' IS NOT NULL 
        THEN (additional_data->>'dispatched_at')::timestamptz
      ELSE NULL
    END
  ),
  updated_at = COALESCE(updated_at, created_at, now())
WHERE additional_data IS NOT NULL;

-- Step 5: Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_verified_by 
  ON public.mmp_site_entries(verified_by);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_verified_at 
  ON public.mmp_site_entries(verified_at);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_dispatched_by 
  ON public.mmp_site_entries(dispatched_by);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_dispatched_at 
  ON public.mmp_site_entries(dispatched_at);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_status 
  ON public.mmp_site_entries(status);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_updated_at 
  ON public.mmp_site_entries(updated_at);

-- Step 6: Add column comments for documentation
COMMENT ON COLUMN public.mmp_site_entries.verified_by IS 
  'Username or identifier of the user who verified this site entry';
COMMENT ON COLUMN public.mmp_site_entries.verified_at IS 
  'Timestamp when the site entry was verified';
COMMENT ON COLUMN public.mmp_site_entries.dispatched_by IS 
  'Username or identifier of the user who dispatched this site entry';
COMMENT ON COLUMN public.mmp_site_entries.dispatched_at IS 
  'Timestamp when the site entry was dispatched to data collectors';
COMMENT ON COLUMN public.mmp_site_entries.updated_at IS 
  'Timestamp when the site entry was last updated (automatically maintained)';

-- Verification: Check the new columns
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'mmp_site_entries'
  AND column_name IN ('verified_by', 'verified_at', 'dispatched_by', 'dispatched_at', 'updated_at')
ORDER BY column_name;


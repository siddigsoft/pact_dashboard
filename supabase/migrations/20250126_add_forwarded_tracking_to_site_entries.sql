-- Migration: Add forwarded tracking columns to mmp_site_entries
-- Description: Adds proper foreign key columns for tracking who forwarded sites to coordinators
--              and when they were forwarded, with proper indexing
-- Date: 2025-01-26

-- Step 1: Add new UUID columns for foreign key relationships
ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS forwarded_by_user_id uuid;

ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS forwarded_to_user_id uuid;

ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS forwarded_at timestamp with time zone;

-- Step 2: Migrate existing data from text fields and additional_data
-- Migrate dispatched_by text to forwarded_by_user_id UUID
UPDATE public.mmp_site_entries mse
SET forwarded_by_user_id = (
  SELECT p.id 
  FROM public.profiles p
  WHERE mse.dispatched_by IS NOT NULL
    AND (
      -- Direct UUID match
      mse.dispatched_by::text = p.id::text
      -- Email match
      OR LOWER(TRIM(mse.dispatched_by)) = LOWER(TRIM(p.email))
      -- Username match
      OR LOWER(TRIM(mse.dispatched_by)) = LOWER(TRIM(p.username))
      -- Full name match
      OR LOWER(TRIM(mse.dispatched_by)) = LOWER(TRIM(p.full_name))
    )
  LIMIT 1
)
WHERE mse.dispatched_by IS NOT NULL 
  AND mse.forwarded_by_user_id IS NULL;

-- Migrate dispatched_at to forwarded_at
UPDATE public.mmp_site_entries
SET forwarded_at = dispatched_at
WHERE dispatched_at IS NOT NULL 
  AND forwarded_at IS NULL;

-- Migrate assigned_to from additional_data to forwarded_to_user_id
UPDATE public.mmp_site_entries mse
SET forwarded_to_user_id = (
  SELECT p.id 
  FROM public.profiles p
  WHERE mse.additional_data->>'assigned_to' IS NOT NULL
    AND (
      -- Direct UUID match
      mse.additional_data->>'assigned_to' = p.id::text
      -- Email match
      OR LOWER(TRIM(mse.additional_data->>'assigned_to')) = LOWER(TRIM(p.email))
      -- Username match
      OR LOWER(TRIM(mse.additional_data->>'assigned_to')) = LOWER(TRIM(p.username))
      -- Full name match
      OR LOWER(TRIM(mse.additional_data->>'assigned_to')) = LOWER(TRIM(p.full_name))
    )
  LIMIT 1
)
WHERE mse.additional_data->>'assigned_to' IS NOT NULL 
  AND mse.forwarded_to_user_id IS NULL;

-- Step 3: Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_forwarded_by_user_id 
ON public.mmp_site_entries(forwarded_by_user_id);

CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_forwarded_to_user_id 
ON public.mmp_site_entries(forwarded_to_user_id);

CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_forwarded_at 
ON public.mmp_site_entries(forwarded_at);

-- Composite index for common queries (sites forwarded by a user)
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_forwarded_by_at 
ON public.mmp_site_entries(forwarded_by_user_id, forwarded_at);

-- Composite index for common queries (sites forwarded to a coordinator)
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_forwarded_to_at 
ON public.mmp_site_entries(forwarded_to_user_id, forwarded_at);

-- Index for checking if site is forwarded (forwarded_at IS NOT NULL)
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_forwarded_status 
ON public.mmp_site_entries(forwarded_at) 
WHERE forwarded_at IS NOT NULL;

-- Step 4: Add foreign key constraints
ALTER TABLE public.mmp_site_entries
ADD CONSTRAINT mmp_site_entries_forwarded_by_user_id_fkey 
FOREIGN KEY (forwarded_by_user_id) 
REFERENCES public.profiles(id) 
ON DELETE SET NULL;

ALTER TABLE public.mmp_site_entries
ADD CONSTRAINT mmp_site_entries_forwarded_to_user_id_fkey 
FOREIGN KEY (forwarded_to_user_id) 
REFERENCES public.profiles(id) 
ON DELETE SET NULL;

-- Step 5: Add comments for documentation
COMMENT ON COLUMN public.mmp_site_entries.forwarded_by_user_id IS 
'Foreign key to profiles.id - The user who forwarded this site entry to a coordinator. Use this for proper relational queries.';

COMMENT ON COLUMN public.mmp_site_entries.forwarded_to_user_id IS 
'Foreign key to profiles.id - The coordinator user this site entry was forwarded to. Use this for proper relational queries.';

COMMENT ON COLUMN public.mmp_site_entries.forwarded_at IS 
'Timestamp when the site entry was forwarded to a coordinator. NULL means not yet forwarded.';

-- Step 6: Create a helper function to check if site is forwarded
CREATE OR REPLACE FUNCTION public.is_site_forwarded(site_entry_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.mmp_site_entries 
    WHERE id = site_entry_id 
      AND forwarded_at IS NOT NULL
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_site_forwarded(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_site_forwarded(uuid) IS 
'Helper function to check if a site entry has been forwarded to a coordinator';

-- Step 7: Create a helper function to get forwarded site details
CREATE OR REPLACE FUNCTION public.get_site_forwarded_details(site_entry_id uuid)
RETURNS TABLE (
  id uuid,
  site_name text,
  forwarded_by_user_id uuid,
  forwarded_by_name text,
  forwarded_by_email text,
  forwarded_to_user_id uuid,
  forwarded_to_name text,
  forwarded_to_email text,
  forwarded_at timestamptz
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mse.id,
    mse.site_name,
    mse.forwarded_by_user_id,
    forwarder.full_name as forwarded_by_name,
    forwarder.email as forwarded_by_email,
    mse.forwarded_to_user_id,
    coordinator.full_name as forwarded_to_name,
    coordinator.email as forwarded_to_email,
    mse.forwarded_at
  FROM public.mmp_site_entries mse
  LEFT JOIN public.profiles forwarder ON mse.forwarded_by_user_id = forwarder.id
  LEFT JOIN public.profiles coordinator ON mse.forwarded_to_user_id = coordinator.id
  WHERE mse.id = site_entry_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_site_forwarded_details(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_site_forwarded_details(uuid) IS 
'Helper function to retrieve site entry with forwarded user details (who forwarded and to whom)';


-- Migration: Add user foreign key relationships to mmp_site_entries
-- Description: Adds UUID foreign key columns for verified_by and completed_by (accepted_by) 
--              to properly link site entries with profiles table
-- Date: 2025-01-26

-- Step 1: Add new UUID columns for foreign key relationships
ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS verified_by_user_id uuid;

ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS completed_by_user_id uuid;

-- Step 2: Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_verified_by_user_id 
ON public.mmp_site_entries(verified_by_user_id);

CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_completed_by_user_id 
ON public.mmp_site_entries(completed_by_user_id);

-- Step 3: Migrate existing text data to UUIDs where possible
-- This attempts to match verified_by text to profiles by:
-- 1. Direct UUID match (if verified_by is already a UUID)
-- 2. Email match
-- 3. Username match
-- 4. Full name match

UPDATE public.mmp_site_entries mse
SET verified_by_user_id = (
  SELECT p.id 
  FROM public.profiles p
  WHERE mse.verified_by IS NOT NULL
    AND (
      -- Direct UUID match
      mse.verified_by::text = p.id::text
      -- Email match
      OR LOWER(TRIM(mse.verified_by)) = LOWER(TRIM(p.email))
      -- Username match
      OR LOWER(TRIM(mse.verified_by)) = LOWER(TRIM(p.username))
      -- Full name match
      OR LOWER(TRIM(mse.verified_by)) = LOWER(TRIM(p.full_name))
    )
  LIMIT 1
)
WHERE mse.verified_by IS NOT NULL 
  AND mse.verified_by_user_id IS NULL;

-- Migrate accepted_by to completed_by_user_id
-- Note: accepted_by represents who completed/accepted the site entry
UPDATE public.mmp_site_entries mse
SET completed_by_user_id = (
  SELECT p.id 
  FROM public.profiles p
  WHERE mse.accepted_by IS NOT NULL
    AND (
      -- Direct UUID match
      mse.accepted_by::text = p.id::text
      -- Email match
      OR LOWER(TRIM(mse.accepted_by)) = LOWER(TRIM(p.email))
      -- Username match
      OR LOWER(TRIM(mse.accepted_by)) = LOWER(TRIM(p.username))
      -- Full name match
      OR LOWER(TRIM(mse.accepted_by)) = LOWER(TRIM(p.full_name))
    )
  LIMIT 1
)
WHERE mse.accepted_by IS NOT NULL 
  AND mse.completed_by_user_id IS NULL;

-- Step 4: Add foreign key constraints
ALTER TABLE public.mmp_site_entries
ADD CONSTRAINT mmp_site_entries_verified_by_user_id_fkey 
FOREIGN KEY (verified_by_user_id) 
REFERENCES public.profiles(id) 
ON DELETE SET NULL;

ALTER TABLE public.mmp_site_entries
ADD CONSTRAINT mmp_site_entries_completed_by_user_id_fkey 
FOREIGN KEY (completed_by_user_id) 
REFERENCES public.profiles(id) 
ON DELETE SET NULL;

-- Step 5: Add comments for documentation
COMMENT ON COLUMN public.mmp_site_entries.verified_by_user_id IS 
'Foreign key to profiles.id - The user who verified this site entry. Use this for proper relational queries.';

COMMENT ON COLUMN public.mmp_site_entries.completed_by_user_id IS 
'Foreign key to profiles.id - The user who completed/accepted this site entry. Use this for proper relational queries.';

-- Step 6: Create a helper function to get site entry with user details
-- This function can be used to easily query site entries with verifier and completer information
CREATE OR REPLACE FUNCTION public.get_site_entry_with_users(site_entry_id uuid)
RETURNS TABLE (
  id uuid,
  site_name text,
  status text,
  verified_by_user_id uuid,
  verified_by_name text,
  verified_by_email text,
  verified_at timestamptz,
  completed_by_user_id uuid,
  completed_by_name text,
  completed_by_email text,
  accepted_at timestamptz
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mse.id,
    mse.site_name,
    mse.status,
    mse.verified_by_user_id,
    verifier.full_name as verified_by_name,
    verifier.email as verified_by_email,
    mse.verified_at,
    mse.completed_by_user_id,
    completer.full_name as completed_by_name,
    completer.email as completed_by_email,
    mse.accepted_at
  FROM public.mmp_site_entries mse
  LEFT JOIN public.profiles verifier ON mse.verified_by_user_id = verifier.id
  LEFT JOIN public.profiles completer ON mse.completed_by_user_id = completer.id
  WHERE mse.id = site_entry_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_site_entry_with_users(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_site_entry_with_users(uuid) IS 
'Helper function to retrieve site entry with verifier and completer user details in a single query';


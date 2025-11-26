-- Migration: Add RLS policy for data collectors to send back sites to coordinators
-- Description: Allows data collectors to update mmp_site_entries to set rejection status
-- Date: 2025-01-26

-- Ensure RLS is enabled on mmp_site_entries
ALTER TABLE public.mmp_site_entries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "mmp_site_entries_update_authenticated" ON public.mmp_site_entries;
DROP POLICY IF EXISTS "mmp_site_entries_select_authenticated" ON public.mmp_site_entries;

-- Create policy for authenticated users to update mmp_site_entries
-- This allows data collectors and other authenticated users to update sites
-- Note: More granular policies can be added later for specific role-based restrictions
CREATE POLICY "mmp_site_entries_update_authenticated" 
ON public.mmp_site_entries
FOR UPDATE
USING (
  -- User must be authenticated
  auth.role() = 'authenticated'
)
WITH CHECK (
  -- After update, user must still be authenticated
  auth.role() = 'authenticated'
);

-- Also ensure there's a general read policy for authenticated users
DROP POLICY IF EXISTS "mmp_site_entries_select_authenticated" ON public.mmp_site_entries;
CREATE POLICY "mmp_site_entries_select_authenticated" 
ON public.mmp_site_entries
FOR SELECT
USING (auth.role() = 'authenticated');

-- Add comments
COMMENT ON POLICY "mmp_site_entries_update_authenticated" ON public.mmp_site_entries IS 
  'Allows authenticated users to update mmp_site_entries (enables data collectors to send back sites)';
COMMENT ON POLICY "mmp_site_entries_select_authenticated" ON public.mmp_site_entries IS 
  'Allows authenticated users to select/read mmp_site_entries';


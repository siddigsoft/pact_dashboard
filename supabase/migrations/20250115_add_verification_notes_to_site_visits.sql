-- Add verification_notes column to site_visits table
ALTER TABLE public.site_visits 
ADD COLUMN IF NOT EXISTS verification_notes text;

-- Add verified_at and verified_by columns if they don't exist
-- Using text for verified_by to match mmp_files table structure
ALTER TABLE public.site_visits 
ADD COLUMN IF NOT EXISTS verified_at timestamptz,
ADD COLUMN IF NOT EXISTS verified_by text;

-- Add verification_notes column to mmp_site_entries table
ALTER TABLE public.mmp_site_entries 
ADD COLUMN IF NOT EXISTS verification_notes text;


-- Add registry_site_id column to mmp_site_entries table
-- This column links MMP site entries to the sites_registry table

ALTER TABLE public.mmp_site_entries
ADD COLUMN registry_site_id text REFERENCES public.sites_registry(id);

-- Add index for performance on foreign key lookups
CREATE INDEX idx_mmp_site_entries_registry_site_id ON public.mmp_site_entries(registry_site_id);

-- Add comment for documentation
COMMENT ON COLUMN public.mmp_site_entries.registry_site_id IS 'Foreign key reference to sites_registry.id for unified site management';
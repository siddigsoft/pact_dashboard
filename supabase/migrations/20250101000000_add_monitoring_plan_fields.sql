-- Add monitoring plan fields to site_visits table
ALTER TABLE public.site_visits 
ADD COLUMN IF NOT EXISTS hub_office text,
ADD COLUMN IF NOT EXISTS activity_at_site text,
ADD COLUMN IF NOT EXISTS monitoring_by text,
ADD COLUMN IF NOT EXISTS survey_tool text,
ADD COLUMN IF NOT EXISTS use_market_diversion boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS use_warehouse_monitoring boolean DEFAULT false;

-- Add monitoring plan fields to mmp_files table
ALTER TABLE public.mmp_files 
ADD COLUMN IF NOT EXISTS activities jsonb,
ADD COLUMN IF NOT EXISTS verified_by text,
ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_site_visits_hub_office ON public.site_visits(hub_office);
CREATE INDEX IF NOT EXISTS idx_site_visits_monitoring_by ON public.site_visits(monitoring_by);
CREATE INDEX IF NOT EXISTS idx_site_visits_survey_tool ON public.site_visits(survey_tool);
CREATE INDEX IF NOT EXISTS idx_site_visits_locality ON public.site_visits(locality);
CREATE INDEX IF NOT EXISTS idx_site_visits_state ON public.site_visits(state);


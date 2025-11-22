-- Migration: Add missing tables for PACT application compatibility
-- Created: 2025-01-22
-- Description: Adds site_visits, archive_settings, and field_team_settings tables

-- =============================================================================
-- SITE_VISITS TABLE
-- =============================================================================
-- Primary table for tracking site visit assignments and status
-- Separates visit tracking from MMP site entries for cleaner data model
CREATE TABLE IF NOT EXISTS public.site_visits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  
  -- Basic Information
  site_name text,
  site_code text,
  locality text,
  state text,
  hub text,
  
  -- Status and Assignment
  status text DEFAULT 'pending' CHECK (status IN (
    'pending', 'assigned', 'inProgress', 'completed', 
    'cancelled', 'canceled', 'permitVerified', 'verified'
  )),
  assigned_to uuid,
  assigned_by uuid,
  assigned_at timestamp with time zone,
  
  -- Scheduling
  due_date timestamp with time zone,
  scheduled_date timestamp with time zone,
  completed_at timestamp with time zone,
  
  -- MMP Association
  mmp_id text,
  mmp_file_id uuid,
  mmp_site_entry_id uuid,
  
  -- Activity Details
  main_activity text,
  activity text,
  project_activities text[],
  visit_type text,
  visit_type_raw text,
  monitoring_type text,
  complexity text CHECK (complexity IN ('low', 'medium', 'high')),
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  
  -- Location Data
  location jsonb DEFAULT '{}'::jsonb,
  coordinates jsonb DEFAULT '{}'::jsonb,
  arrival_latitude double precision,
  arrival_longitude double precision,
  arrival_timestamp timestamp with time zone,
  arrival_recorded boolean DEFAULT false,
  journey_path jsonb,
  
  -- Financial Information
  fees jsonb DEFAULT '{}'::jsonb,
  cost numeric,
  enumerator_fee numeric,
  transport_fee numeric,
  
  -- Permit Details
  permit_details jsonb DEFAULT '{}'::jsonb,
  
  -- Team Information
  team jsonb DEFAULT '{}'::jsonb,
  cp_name text,
  
  -- Monitoring Plan Fields
  hub_office text,
  site_activity text,
  monitoring_by text,
  survey_tool text,
  use_market_diversion boolean DEFAULT false,
  use_warehouse_monitoring boolean DEFAULT false,
  
  -- Additional Data
  description text,
  notes text,
  comments text,
  attachments text[],
  resources text[],
  risks text,
  tasks text[],
  
  -- Visit Data
  visit_data jsonb DEFAULT '{}'::jsonb,
  mmp_details jsonb DEFAULT '{}'::jsonb,
  visit_history jsonb[],
  
  -- Quality Metrics
  rating integer CHECK (rating >= 1 AND rating <= 5),
  rating_notes text,
  estimated_duration text,
  
  -- Verification
  verified_by text,
  verified_at timestamp with time zone,
  verification_notes text,
  
  -- Dispatch
  dispatched_by text,
  dispatched_at timestamp with time zone,
  
  -- Acceptance
  accepted_by text,
  accepted_at timestamp with time zone,
  
  -- Timestamps
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  -- Constraints
  CONSTRAINT site_visits_pkey PRIMARY KEY (id),
  CONSTRAINT site_visits_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id),
  CONSTRAINT site_visits_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id),
  CONSTRAINT site_visits_mmp_file_id_fkey FOREIGN KEY (mmp_file_id) REFERENCES public.mmp_files(id) ON DELETE SET NULL,
  CONSTRAINT site_visits_mmp_site_entry_id_fkey FOREIGN KEY (mmp_site_entry_id) REFERENCES public.mmp_site_entries(id) ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_site_visits_status ON public.site_visits(status);
CREATE INDEX IF NOT EXISTS idx_site_visits_assigned_to ON public.site_visits(assigned_to);
CREATE INDEX IF NOT EXISTS idx_site_visits_mmp_id ON public.site_visits(mmp_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_mmp_file_id ON public.site_visits(mmp_file_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_mmp_site_entry_id ON public.site_visits(mmp_site_entry_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_site_code ON public.site_visits(site_code);
CREATE INDEX IF NOT EXISTS idx_site_visits_created_at ON public.site_visits(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

-- RLS Policies for site_visits
CREATE POLICY "Users can view site visits they have access to"
  ON public.site_visits FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE status = 'active'
    )
  );

CREATE POLICY "Users can create site visits if authorized"
  ON public.site_visits FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM public.user_roles 
      WHERE role IN ('admin', 'ict', 'fom', 'supervisor')
    )
  );

CREATE POLICY "Users can update site visits they're assigned to or authorized"
  ON public.site_visits FOR UPDATE
  USING (
    auth.uid() = assigned_to OR
    auth.uid() IN (
      SELECT user_id FROM public.user_roles 
      WHERE role IN ('admin', 'ict', 'fom', 'supervisor')
    )
  );

-- =============================================================================
-- ARCHIVE_SETTINGS TABLE
-- =============================================================================
-- User preferences for archive functionality
CREATE TABLE IF NOT EXISTS public.archive_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  preferences jsonb DEFAULT '{}'::jsonb,
  last_updated timestamp with time zone DEFAULT now(),
  
  CONSTRAINT archive_settings_pkey PRIMARY KEY (id),
  CONSTRAINT archive_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- Create index for user lookup
CREATE INDEX IF NOT EXISTS idx_archive_settings_user_id ON public.archive_settings(user_id);

-- Enable Row Level Security
ALTER TABLE public.archive_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for archive_settings
CREATE POLICY "Users can view their own archive settings"
  ON public.archive_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own archive settings"
  ON public.archive_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own archive settings"
  ON public.archive_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- =============================================================================
-- FIELD_TEAM_SETTINGS TABLE
-- =============================================================================
-- Team-specific preferences and settings for field operations
CREATE TABLE IF NOT EXISTS public.field_team_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id text,
  coordinator_id uuid,
  preferences jsonb DEFAULT '{}'::jsonb,
  last_updated timestamp with time zone DEFAULT now(),
  
  CONSTRAINT field_team_settings_pkey PRIMARY KEY (id),
  CONSTRAINT field_team_settings_coordinator_id_fkey FOREIGN KEY (coordinator_id) REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_field_team_settings_team_id ON public.field_team_settings(team_id);
CREATE INDEX IF NOT EXISTS idx_field_team_settings_coordinator_id ON public.field_team_settings(coordinator_id);

-- Enable Row Level Security
ALTER TABLE public.field_team_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for field_team_settings
CREATE POLICY "Users can view field team settings"
  ON public.field_team_settings FOR SELECT
  USING (
    auth.uid() = coordinator_id OR
    auth.uid() IN (
      SELECT user_id FROM public.user_roles 
      WHERE role IN ('admin', 'ict', 'fom')
    )
  );

CREATE POLICY "Coordinators and admins can manage field team settings"
  ON public.field_team_settings FOR ALL
  USING (
    auth.uid() = coordinator_id OR
    auth.uid() IN (
      SELECT user_id FROM public.user_roles 
      WHERE role IN ('admin', 'ict', 'fom')
    )
  );

-- =============================================================================
-- TRIGGER FUNCTIONS
-- =============================================================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to site_visits
DROP TRIGGER IF EXISTS update_site_visits_updated_at ON public.site_visits;
CREATE TRIGGER update_site_visits_updated_at
  BEFORE UPDATE ON public.site_visits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add trigger to archive_settings
DROP TRIGGER IF EXISTS update_archive_settings_updated_at ON public.archive_settings;
CREATE TRIGGER update_archive_settings_updated_at
  BEFORE UPDATE ON public.archive_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add trigger to field_team_settings
DROP TRIGGER IF EXISTS update_field_team_settings_updated_at ON public.field_team_settings;
CREATE TRIGGER update_field_team_settings_updated_at
  BEFORE UPDATE ON public.field_team_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE public.site_visits IS 'Site visit assignments and tracking, separate from MMP site entries';
COMMENT ON TABLE public.archive_settings IS 'User preferences for archive functionality';
COMMENT ON TABLE public.field_team_settings IS 'Team-specific settings for field operations';

COMMENT ON COLUMN public.site_visits.mmp_site_entry_id IS 'Links to the detailed MMP site entry if created from MMP import';
COMMENT ON COLUMN public.site_visits.visit_data IS 'Additional structured data from site visit';
COMMENT ON COLUMN public.site_visits.journey_path IS 'GPS coordinates array tracking journey to site';

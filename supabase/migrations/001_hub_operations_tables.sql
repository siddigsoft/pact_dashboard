-- Hub Operations Tables Migration
-- Run this in Supabase SQL Editor to create the required tables

-- Create hubs table
CREATE TABLE IF NOT EXISTS public.hubs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    description TEXT,
    states TEXT[] NOT NULL DEFAULT '{}',
    coordinates JSONB DEFAULT '{"latitude": 0, "longitude": 0}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT,
    updated_at TIMESTAMPTZ
);

-- Create sites_registry table
CREATE TABLE IF NOT EXISTS public.sites_registry (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    site_code TEXT NOT NULL UNIQUE,
    site_name TEXT NOT NULL,
    state_id TEXT NOT NULL,
    state_name TEXT NOT NULL,
    locality_id TEXT NOT NULL,
    locality_name TEXT NOT NULL,
    hub_id TEXT REFERENCES public.hubs(id) ON DELETE SET NULL,
    hub_name TEXT,
    gps_latitude DOUBLE PRECISION,
    gps_longitude DOUBLE PRECISION,
    gps_captured_by TEXT,
    gps_captured_at TIMESTAMPTZ,
    activity_type TEXT DEFAULT 'TPM',
    status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'active', 'inactive', 'archived')),
    mmp_count INTEGER DEFAULT 0,
    last_mmp_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT,
    updated_at TIMESTAMPTZ
);

-- Create project_scopes table
CREATE TABLE IF NOT EXISTS public.project_scopes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    project_id TEXT NOT NULL,
    project_name TEXT NOT NULL,
    hub_id TEXT REFERENCES public.hubs(id) ON DELETE SET NULL,
    hub_name TEXT,
    state_ids TEXT[] NOT NULL DEFAULT '{}',
    locality_ids TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sites_registry_state ON public.sites_registry(state_id);
CREATE INDEX IF NOT EXISTS idx_sites_registry_locality ON public.sites_registry(locality_id);
CREATE INDEX IF NOT EXISTS idx_sites_registry_hub ON public.sites_registry(hub_id);
CREATE INDEX IF NOT EXISTS idx_sites_registry_site_code ON public.sites_registry(site_code);
CREATE INDEX IF NOT EXISTS idx_project_scopes_project ON public.project_scopes(project_id);
CREATE INDEX IF NOT EXISTS idx_project_scopes_hub ON public.project_scopes(hub_id);

-- Enable Row Level Security
ALTER TABLE public.hubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_scopes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for hubs (read: all authenticated, write: admin/superAdmin)
CREATE POLICY "Allow read access to hubs for authenticated users" 
    ON public.hubs FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Allow insert to hubs for admins" 
    ON public.hubs FOR INSERT 
    TO authenticated 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role IN ('admin', 'superAdmin')
        )
    );

CREATE POLICY "Allow update to hubs for admins" 
    ON public.hubs FOR UPDATE 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role IN ('admin', 'superAdmin')
        )
    );

CREATE POLICY "Allow delete from hubs for admins" 
    ON public.hubs FOR DELETE 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role IN ('admin', 'superAdmin')
        )
    );

-- RLS Policies for sites_registry
CREATE POLICY "Allow read access to sites_registry for authenticated users" 
    ON public.sites_registry FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Allow insert to sites_registry for admins" 
    ON public.sites_registry FOR INSERT 
    TO authenticated 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role IN ('admin', 'superAdmin')
        )
    );

CREATE POLICY "Allow update to sites_registry for admins" 
    ON public.sites_registry FOR UPDATE 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role IN ('admin', 'superAdmin')
        )
    );

CREATE POLICY "Allow delete from sites_registry for admins" 
    ON public.sites_registry FOR DELETE 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role IN ('admin', 'superAdmin')
        )
    );

-- RLS Policies for project_scopes
CREATE POLICY "Allow read access to project_scopes for authenticated users" 
    ON public.project_scopes FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Allow insert to project_scopes for admins" 
    ON public.project_scopes FOR INSERT 
    TO authenticated 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role IN ('admin', 'superAdmin')
        )
    );

CREATE POLICY "Allow update to project_scopes for admins" 
    ON public.project_scopes FOR UPDATE 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role IN ('admin', 'superAdmin')
        )
    );

CREATE POLICY "Allow delete from project_scopes for admins" 
    ON public.project_scopes FOR DELETE 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role IN ('admin', 'superAdmin')
        )
    );

-- Grant permissions
GRANT ALL ON public.hubs TO authenticated;
GRANT ALL ON public.sites_registry TO authenticated;
GRANT ALL ON public.project_scopes TO authenticated;

-- Hub Operations Tables Migration
-- Creates tables for hubs, sites_registry, and project_scopes
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. HUBS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS hubs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(10) NOT NULL UNIQUE,
    description TEXT,
    states TEXT[] NOT NULL DEFAULT '{}',
    manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_hubs_code ON hubs(code);
CREATE INDEX IF NOT EXISTS idx_hubs_manager ON hubs(manager_id);
CREATE INDEX IF NOT EXISTS idx_hubs_active ON hubs(is_active);

-- ============================================
-- 2. SITES REGISTRY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS sites_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    state_code VARCHAR(5) NOT NULL,
    state_name VARCHAR(100) NOT NULL,
    locality_code VARCHAR(10) NOT NULL,
    locality_name VARCHAR(100) NOT NULL,
    activity_type VARCHAR(20) NOT NULL CHECK (activity_type IN ('TPM', 'PDM', 'CFM', 'FCS', 'OTHER')),
    coordinates JSONB,
    hub_id UUID REFERENCES hubs(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Indexes for sites_registry
CREATE INDEX IF NOT EXISTS idx_sites_code ON sites_registry(site_code);
CREATE INDEX IF NOT EXISTS idx_sites_state ON sites_registry(state_code);
CREATE INDEX IF NOT EXISTS idx_sites_locality ON sites_registry(locality_code);
CREATE INDEX IF NOT EXISTS idx_sites_hub ON sites_registry(hub_id);
CREATE INDEX IF NOT EXISTS idx_sites_status ON sites_registry(status);
CREATE INDEX IF NOT EXISTS idx_sites_activity ON sites_registry(activity_type);

-- ============================================
-- 3. PROJECT SCOPES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS project_scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    hub_id UUID REFERENCES hubs(id) ON DELETE SET NULL,
    states TEXT[] DEFAULT '{}',
    localities JSONB DEFAULT '{}',
    site_ids UUID[] DEFAULT '{}',
    scope_type VARCHAR(20) DEFAULT 'hub' CHECK (scope_type IN ('hub', 'state', 'locality', 'site')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    UNIQUE(project_id, hub_id)
);

-- Indexes for project_scopes
CREATE INDEX IF NOT EXISTS idx_project_scopes_project ON project_scopes(project_id);
CREATE INDEX IF NOT EXISTS idx_project_scopes_hub ON project_scopes(hub_id);
CREATE INDEX IF NOT EXISTS idx_project_scopes_active ON project_scopes(is_active);

-- ============================================
-- 4. UPDATED_AT TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_hubs_updated_at ON hubs;
CREATE TRIGGER update_hubs_updated_at
    BEFORE UPDATE ON hubs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sites_registry_updated_at ON sites_registry;
CREATE TRIGGER update_sites_registry_updated_at
    BEFORE UPDATE ON sites_registry
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_scopes_updated_at ON project_scopes;
CREATE TRIGGER update_project_scopes_updated_at
    BEFORE UPDATE ON project_scopes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE hubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_scopes ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is admin or super_admin
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid()
        AND r.name IN ('admin', 'super_admin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- HUBS POLICIES
DROP POLICY IF EXISTS "Authenticated users can view active hubs" ON hubs;
CREATE POLICY "Authenticated users can view active hubs"
    ON hubs FOR SELECT
    TO authenticated
    USING (is_active = true);

DROP POLICY IF EXISTS "Admins can view all hubs" ON hubs;
CREATE POLICY "Admins can view all hubs"
    ON hubs FOR SELECT
    TO authenticated
    USING (is_admin_user());

DROP POLICY IF EXISTS "Admins can insert hubs" ON hubs;
CREATE POLICY "Admins can insert hubs"
    ON hubs FOR INSERT
    TO authenticated
    WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "Admins can update hubs" ON hubs;
CREATE POLICY "Admins can update hubs"
    ON hubs FOR UPDATE
    TO authenticated
    USING (is_admin_user())
    WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "Admins can delete hubs" ON hubs;
CREATE POLICY "Admins can delete hubs"
    ON hubs FOR DELETE
    TO authenticated
    USING (is_admin_user());

-- SITES_REGISTRY POLICIES
DROP POLICY IF EXISTS "Authenticated users can view active sites" ON sites_registry;
CREATE POLICY "Authenticated users can view active sites"
    ON sites_registry FOR SELECT
    TO authenticated
    USING (status = 'active');

DROP POLICY IF EXISTS "Admins can view all sites" ON sites_registry;
CREATE POLICY "Admins can view all sites"
    ON sites_registry FOR SELECT
    TO authenticated
    USING (is_admin_user());

DROP POLICY IF EXISTS "Admins can insert sites" ON sites_registry;
CREATE POLICY "Admins can insert sites"
    ON sites_registry FOR INSERT
    TO authenticated
    WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "Admins can update sites" ON sites_registry;
CREATE POLICY "Admins can update sites"
    ON sites_registry FOR UPDATE
    TO authenticated
    USING (is_admin_user())
    WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "Admins can delete sites" ON sites_registry;
CREATE POLICY "Admins can delete sites"
    ON sites_registry FOR DELETE
    TO authenticated
    USING (is_admin_user());

-- PROJECT_SCOPES POLICIES
DROP POLICY IF EXISTS "Authenticated users can view active project scopes" ON project_scopes;
CREATE POLICY "Authenticated users can view active project scopes"
    ON project_scopes FOR SELECT
    TO authenticated
    USING (is_active = true);

DROP POLICY IF EXISTS "Admins can view all project scopes" ON project_scopes;
CREATE POLICY "Admins can view all project scopes"
    ON project_scopes FOR SELECT
    TO authenticated
    USING (is_admin_user());

DROP POLICY IF EXISTS "Admins can insert project scopes" ON project_scopes;
CREATE POLICY "Admins can insert project scopes"
    ON project_scopes FOR INSERT
    TO authenticated
    WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "Admins can update project scopes" ON project_scopes;
CREATE POLICY "Admins can update project scopes"
    ON project_scopes FOR UPDATE
    TO authenticated
    USING (is_admin_user())
    WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "Admins can delete project scopes" ON project_scopes;
CREATE POLICY "Admins can delete project scopes"
    ON project_scopes FOR DELETE
    TO authenticated
    USING (is_admin_user());

-- ============================================
-- 6. INSERT DEFAULT WFP HUB STRUCTURE
-- ============================================
INSERT INTO hubs (name, code, description, states, is_active)
VALUES 
    ('Port Sudan Hub', 'PTS', 'Eastern Sudan operations hub', ARRAY['RS', 'KS', 'GZ'], true),
    ('Khartoum Hub', 'KHT', 'Central Sudan operations hub', ARRAY['KH', 'GD', 'RN', 'WN', 'NR', 'SN'], true),
    ('El Fasher Hub', 'ELF', 'Darfur region operations hub', ARRAY['ND', 'WD', 'SD', 'CD', 'ED'], true),
    ('Kadugli Hub', 'KDG', 'Kordofan region operations hub', ARRAY['NK', 'SK', 'WK'], true),
    ('El Obeid Hub', 'OBD', 'Central Kordofan operations hub', ARRAY['NK', 'WK'], true)
ON CONFLICT (code) DO NOTHING;

-- Grant usage on sequences if any
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Hub Operations tables created successfully!';
    RAISE NOTICE 'Tables: hubs, sites_registry, project_scopes';
    RAISE NOTICE 'RLS policies enabled with admin-only write access';
END $$;

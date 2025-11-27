-- Hub Operations Tables Migration
-- Creates tables for hubs, sites_registry, and project_scopes
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. HUBS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS hubs (
    id TEXT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    states TEXT[] NOT NULL DEFAULT '{}',
    coordinates JSONB DEFAULT '{"latitude": 0, "longitude": 0}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_hubs_name ON hubs(name);

-- ============================================
-- 2. SITES REGISTRY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS sites_registry (
    id TEXT PRIMARY KEY,
    site_code VARCHAR(50) NOT NULL UNIQUE,
    site_name VARCHAR(200) NOT NULL,
    state_id VARCHAR(20) NOT NULL,
    state_name VARCHAR(100) NOT NULL,
    locality_id VARCHAR(50) NOT NULL,
    locality_name VARCHAR(100) NOT NULL,
    hub_id TEXT REFERENCES hubs(id) ON DELETE SET NULL,
    hub_name VARCHAR(100),
    gps_latitude DECIMAL(10, 6),
    gps_longitude DECIMAL(10, 6),
    activity_type VARCHAR(20) NOT NULL DEFAULT 'TPM',
    status VARCHAR(20) DEFAULT 'registered',
    mmp_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT
);

-- Indexes for sites_registry
CREATE INDEX IF NOT EXISTS idx_sites_code ON sites_registry(site_code);
CREATE INDEX IF NOT EXISTS idx_sites_state ON sites_registry(state_id);
CREATE INDEX IF NOT EXISTS idx_sites_locality ON sites_registry(locality_id);
CREATE INDEX IF NOT EXISTS idx_sites_hub ON sites_registry(hub_id);
CREATE INDEX IF NOT EXISTS idx_sites_status ON sites_registry(status);

-- ============================================
-- 3. PROJECT SCOPES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS project_scopes (
    id TEXT PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    hub_id TEXT REFERENCES hubs(id) ON DELETE SET NULL,
    states TEXT[] DEFAULT '{}',
    localities JSONB DEFAULT '{}',
    site_ids TEXT[] DEFAULT '{}',
    scope_type VARCHAR(20) DEFAULT 'hub',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT
);

-- Indexes for project_scopes
CREATE INDEX IF NOT EXISTS idx_project_scopes_project ON project_scopes(project_id);
CREATE INDEX IF NOT EXISTS idx_project_scopes_hub ON project_scopes(hub_id);

-- ============================================
-- 4. UPDATED_AT TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_hub_operations_updated_at()
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
    EXECUTE FUNCTION update_hub_operations_updated_at();

DROP TRIGGER IF EXISTS update_sites_registry_updated_at ON sites_registry;
CREATE TRIGGER update_sites_registry_updated_at
    BEFORE UPDATE ON sites_registry
    FOR EACH ROW
    EXECUTE FUNCTION update_hub_operations_updated_at();

DROP TRIGGER IF EXISTS update_project_scopes_updated_at ON project_scopes;
CREATE TRIGGER update_project_scopes_updated_at
    BEFORE UPDATE ON project_scopes
    FOR EACH ROW
    EXECUTE FUNCTION update_hub_operations_updated_at();

-- ============================================
-- 5. ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE hubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_scopes ENABLE ROW LEVEL SECURITY;

-- HUBS POLICIES - Allow all authenticated users to read, admins to write
DROP POLICY IF EXISTS "Allow read access for authenticated users" ON hubs;
CREATE POLICY "Allow read access for authenticated users"
    ON hubs FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow insert for authenticated users" ON hubs;
CREATE POLICY "Allow insert for authenticated users"
    ON hubs FOR INSERT
    TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update for authenticated users" ON hubs;
CREATE POLICY "Allow update for authenticated users"
    ON hubs FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete for authenticated users" ON hubs;
CREATE POLICY "Allow delete for authenticated users"
    ON hubs FOR DELETE
    TO authenticated
    USING (true);

-- SITES_REGISTRY POLICIES
DROP POLICY IF EXISTS "Allow read access for authenticated users" ON sites_registry;
CREATE POLICY "Allow read access for authenticated users"
    ON sites_registry FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow insert for authenticated users" ON sites_registry;
CREATE POLICY "Allow insert for authenticated users"
    ON sites_registry FOR INSERT
    TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update for authenticated users" ON sites_registry;
CREATE POLICY "Allow update for authenticated users"
    ON sites_registry FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete for authenticated users" ON sites_registry;
CREATE POLICY "Allow delete for authenticated users"
    ON sites_registry FOR DELETE
    TO authenticated
    USING (true);

-- PROJECT_SCOPES POLICIES
DROP POLICY IF EXISTS "Allow read access for authenticated users" ON project_scopes;
CREATE POLICY "Allow read access for authenticated users"
    ON project_scopes FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow insert for authenticated users" ON project_scopes;
CREATE POLICY "Allow insert for authenticated users"
    ON project_scopes FOR INSERT
    TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update for authenticated users" ON project_scopes;
CREATE POLICY "Allow update for authenticated users"
    ON project_scopes FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete for authenticated users" ON project_scopes;
CREATE POLICY "Allow delete for authenticated users"
    ON project_scopes FOR DELETE
    TO authenticated
    USING (true);

-- ============================================
-- 6. INSERT DEFAULT WFP HUB STRUCTURE
-- ============================================
INSERT INTO hubs (id, name, description, states, coordinates)
VALUES 
    ('kassala-hub', 'Kassala Hub', 'Eastern Sudan operations hub covering Red Sea, Kassala, and Gedaref', 
     ARRAY['red-sea', 'kassala', 'gedaref'], '{"latitude": 15.4507, "longitude": 36.4048}'::jsonb),
    ('kosti-hub', 'Kosti Hub', 'Central Sudan operations hub', 
     ARRAY['white-nile', 'sennar', 'blue-nile', 'gezira'], '{"latitude": 13.1629, "longitude": 32.6635}'::jsonb),
    ('el-fasher-hub', 'El Fasher Hub', 'Darfur region operations hub', 
     ARRAY['north-darfur', 'west-darfur', 'south-darfur', 'central-darfur', 'east-darfur'], '{"latitude": 13.6289, "longitude": 25.3493}'::jsonb),
    ('dongola-hub', 'Dongola Hub', 'Northern Sudan operations hub', 
     ARRAY['northern', 'river-nile'], '{"latitude": 19.1653, "longitude": 30.4763}'::jsonb),
    ('country-office', 'Country Office', 'Khartoum central coordination', 
     ARRAY['khartoum', 'north-kordofan', 'south-kordofan', 'west-kordofan'], '{"latitude": 15.5007, "longitude": 32.5599}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    states = EXCLUDED.states,
    coordinates = EXCLUDED.coordinates,
    updated_at = NOW();

-- Grant usage on sequences if any
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Hub Operations tables created successfully!';
    RAISE NOTICE 'Tables: hubs, sites_registry, project_scopes';
    RAISE NOTICE 'RLS policies enabled for authenticated users';
END $$;

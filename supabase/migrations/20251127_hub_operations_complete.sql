-- ============================================
-- HUB OPERATIONS COMPLETE DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. HUBS TABLE (Main operational centers)
-- ============================================
DROP TABLE IF EXISTS project_scopes CASCADE;
DROP TABLE IF EXISTS sites_registry CASCADE;
DROP TABLE IF EXISTS hub_states CASCADE;
DROP TABLE IF EXISTS hubs CASCADE;

CREATE TABLE hubs (
    id TEXT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    coordinates JSONB DEFAULT '{"latitude": 0, "longitude": 0}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT
);

CREATE INDEX idx_hubs_name ON hubs(name);
CREATE INDEX idx_hubs_active ON hubs(is_active);

-- ============================================
-- 2. HUB_STATES TABLE (Links Hubs to States)
-- ============================================
CREATE TABLE hub_states (
    id SERIAL PRIMARY KEY,
    hub_id TEXT NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
    state_id TEXT NOT NULL,
    state_name VARCHAR(100) NOT NULL,
    state_code VARCHAR(5) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(hub_id, state_id)
);

CREATE INDEX idx_hub_states_hub ON hub_states(hub_id);
CREATE INDEX idx_hub_states_state ON hub_states(state_id);

-- ============================================
-- 3. SITES REGISTRY TABLE (Sites within localities)
-- ============================================
CREATE TABLE sites_registry (
    id TEXT PRIMARY KEY,
    site_code VARCHAR(50) NOT NULL UNIQUE,
    site_name VARCHAR(200) NOT NULL,
    state_id TEXT NOT NULL,
    state_name VARCHAR(100) NOT NULL,
    locality_id TEXT NOT NULL,
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

CREATE INDEX idx_sites_code ON sites_registry(site_code);
CREATE INDEX idx_sites_state ON sites_registry(state_id);
CREATE INDEX idx_sites_locality ON sites_registry(locality_id);
CREATE INDEX idx_sites_hub ON sites_registry(hub_id);
CREATE INDEX idx_sites_status ON sites_registry(status);

-- ============================================
-- 4. PROJECT SCOPES TABLE
-- ============================================
CREATE TABLE project_scopes (
    id TEXT PRIMARY KEY,
    project_id UUID,
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

CREATE INDEX idx_project_scopes_hub ON project_scopes(hub_id);

-- ============================================
-- 5. UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_hub_ops_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_hubs_timestamp
    BEFORE UPDATE ON hubs
    FOR EACH ROW EXECUTE FUNCTION update_hub_ops_timestamp();

CREATE TRIGGER update_sites_timestamp
    BEFORE UPDATE ON sites_registry
    FOR EACH ROW EXECUTE FUNCTION update_hub_ops_timestamp();

CREATE TRIGGER update_scopes_timestamp
    BEFORE UPDATE ON project_scopes
    FOR EACH ROW EXECUTE FUNCTION update_hub_ops_timestamp();

-- ============================================
-- 6. ROW LEVEL SECURITY
-- ============================================
ALTER TABLE hubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_scopes ENABLE ROW LEVEL SECURITY;

-- Hubs policies
CREATE POLICY "hubs_select" ON hubs FOR SELECT TO authenticated USING (true);
CREATE POLICY "hubs_insert" ON hubs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "hubs_update" ON hubs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "hubs_delete" ON hubs FOR DELETE TO authenticated USING (true);

-- Hub_states policies
CREATE POLICY "hub_states_select" ON hub_states FOR SELECT TO authenticated USING (true);
CREATE POLICY "hub_states_insert" ON hub_states FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "hub_states_update" ON hub_states FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "hub_states_delete" ON hub_states FOR DELETE TO authenticated USING (true);

-- Sites_registry policies
CREATE POLICY "sites_select" ON sites_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "sites_insert" ON sites_registry FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sites_update" ON sites_registry FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sites_delete" ON sites_registry FOR DELETE TO authenticated USING (true);

-- Project_scopes policies
CREATE POLICY "scopes_select" ON project_scopes FOR SELECT TO authenticated USING (true);
CREATE POLICY "scopes_insert" ON project_scopes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "scopes_update" ON project_scopes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "scopes_delete" ON project_scopes FOR DELETE TO authenticated USING (true);

-- ============================================
-- 7. INSERT DEFAULT WFP HUBS WITH STATE LINKS
-- ============================================

-- Insert Hubs
INSERT INTO hubs (id, name, description, coordinates, is_active) VALUES
('kassala-hub', 'Kassala Hub', 'Eastern Sudan operations hub covering Red Sea, Kassala, and Gedaref', 
 '{"latitude": 15.4507, "longitude": 36.4048}', true),
('kosti-hub', 'Kosti Hub', 'Central Sudan operations hub covering White Nile, Sennar, Blue Nile, and Gezira', 
 '{"latitude": 13.1629, "longitude": 32.6635}', true),
('el-fasher-hub', 'El Fasher Hub', 'Darfur region operations hub covering all five Darfur states', 
 '{"latitude": 13.6289, "longitude": 25.3493}', true),
('dongola-hub', 'Dongola Hub', 'Northern Sudan operations hub covering Northern and River Nile', 
 '{"latitude": 19.1653, "longitude": 30.4763}', true),
('country-office', 'Country Office (Khartoum)', 'Central coordination office covering Khartoum and Kordofan states', 
 '{"latitude": 15.5007, "longitude": 32.5599}', true);

-- Link Kassala Hub to States
INSERT INTO hub_states (hub_id, state_id, state_name, state_code) VALUES
('kassala-hub', 'red-sea', 'Red Sea', 'RS'),
('kassala-hub', 'kassala', 'Kassala', 'KS'),
('kassala-hub', 'gedaref', 'Gedaref', 'GD');

-- Link Kosti Hub to States
INSERT INTO hub_states (hub_id, state_id, state_name, state_code) VALUES
('kosti-hub', 'white-nile', 'White Nile', 'WN'),
('kosti-hub', 'sennar', 'Sennar', 'SN'),
('kosti-hub', 'blue-nile', 'Blue Nile', 'BN'),
('kosti-hub', 'gezira', 'Gezira', 'GZ');

-- Link El Fasher Hub to States
INSERT INTO hub_states (hub_id, state_id, state_name, state_code) VALUES
('el-fasher-hub', 'north-darfur', 'North Darfur', 'ND'),
('el-fasher-hub', 'west-darfur', 'West Darfur', 'WD'),
('el-fasher-hub', 'south-darfur', 'South Darfur', 'SD'),
('el-fasher-hub', 'central-darfur', 'Central Darfur', 'CD'),
('el-fasher-hub', 'east-darfur', 'East Darfur', 'ED');

-- Link Dongola Hub to States
INSERT INTO hub_states (hub_id, state_id, state_name, state_code) VALUES
('dongola-hub', 'northern', 'Northern', 'NO'),
('dongola-hub', 'river-nile', 'River Nile', 'RN');

-- Link Country Office to States
INSERT INTO hub_states (hub_id, state_id, state_name, state_code) VALUES
('country-office', 'khartoum', 'Khartoum', 'KH'),
('country-office', 'north-kordofan', 'North Kordofan', 'NK'),
('country-office', 'south-kordofan', 'South Kordofan', 'SK'),
('country-office', 'west-kordofan', 'West Kordofan', 'WK');

-- Success notification
DO $$
BEGIN
    RAISE NOTICE '=== Hub Operations Database Created Successfully ===';
    RAISE NOTICE 'Tables created: hubs, hub_states, sites_registry, project_scopes';
    RAISE NOTICE 'Default hubs inserted: 5 WFP operational hubs';
    RAISE NOTICE 'Hub-State links created: 18 state assignments';
END $$;

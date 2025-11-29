-- Create coordinator_locality_permits table
-- This table tracks local permits uploaded by coordinators for specific localities
-- One permit per locality covers all sites in that locality for that coordinator

CREATE TABLE IF NOT EXISTS coordinator_locality_permits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  state_id TEXT NOT NULL,
  locality_id TEXT NOT NULL,
  permit_file_name TEXT NOT NULL,
  permit_file_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES profiles(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one permit per coordinator per locality
  UNIQUE(coordinator_id, state_id, locality_id)
);

-- Add RLS policies
ALTER TABLE coordinator_locality_permits ENABLE ROW LEVEL SECURITY;

-- Coordinators can view their own permits
CREATE POLICY "coordinator_locality_permits_select_own" ON coordinator_locality_permits
  FOR SELECT USING (auth.uid() = coordinator_id);

-- Coordinators can insert their own permits
CREATE POLICY "coordinator_locality_permits_insert_own" ON coordinator_locality_permits
  FOR INSERT WITH CHECK (auth.uid() = coordinator_id);

-- Admins and FOMs can view all permits
CREATE POLICY "coordinator_locality_permits_select_admin" ON coordinator_locality_permits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'fom', 'fieldOpManager')
    )
  );

-- Admins and FOMs can update permits (for verification)
CREATE POLICY "coordinator_locality_permits_update_admin" ON coordinator_locality_permits
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'fom', 'fieldOpManager')
    )
  );

-- Create index for performance
CREATE INDEX idx_coordinator_locality_permits_coordinator ON coordinator_locality_permits(coordinator_id);
CREATE INDEX idx_coordinator_locality_permits_locality ON coordinator_locality_permits(state_id, locality_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_coordinator_locality_permits_updated_at
  BEFORE UPDATE ON coordinator_locality_permits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
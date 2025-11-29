-- Script to apply the coordinator_locality_permits migration
-- Run this in the Supabase SQL editor or database console

-- Create mmp-files storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('mmp-files', 'mmp-files', false)
ON CONFLICT (id) DO NOTHING;

-- Create coordinator_locality_permits table
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

-- Storage policies for mmp-files bucket
DROP POLICY IF EXISTS "mmp_files_insert_auth" ON storage.objects;
DROP POLICY IF EXISTS "mmp_files_select_auth" ON storage.objects;
DROP POLICY IF EXISTS "mmp_files_delete_auth" ON storage.objects;

-- Policy: Authenticated users can upload MMP files and permits
CREATE POLICY "mmp_files_insert_auth"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'mmp-files');

-- Policy: Authenticated users can view MMP files and permits
CREATE POLICY "mmp_files_select_auth"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'mmp-files');

-- Policy: Users can delete their own uploaded files
CREATE POLICY "mmp_files_delete_auth"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'mmp-files' AND
  (
    -- Allow deletion if file is in user's folder
    auth.uid()::text = (storage.foldername(name))[1] OR
    -- Or if metadata indicates user uploaded it
    (metadata->>'uploaded_by')::text = auth.uid()::text
  )
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_coordinator_locality_permits_coordinator ON coordinator_locality_permits(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_coordinator_locality_permits_locality ON coordinator_locality_permits(state_id, locality_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_coordinator_locality_permits_updated_at ON coordinator_locality_permits;
CREATE TRIGGER update_coordinator_locality_permits_updated_at
  BEFORE UPDATE ON coordinator_locality_permits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
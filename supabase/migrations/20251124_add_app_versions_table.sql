-- Migration: Add app_versions table for version management
-- Created: 2025-11-24
-- Purpose: Track web and mobile app versions to ensure compatibility

-- Create app_versions table
CREATE TABLE IF NOT EXISTS app_versions (
  id SERIAL PRIMARY KEY,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('web', 'mobile')),
  current_version VARCHAR(20) NOT NULL,
  minimum_supported VARCHAR(20) NOT NULL,
  latest_version VARCHAR(20) NOT NULL,
  changelog TEXT,
  download_url VARCHAR(500),
  force_update BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique constraint on platform (only one row per platform)
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_versions_platform ON app_versions(platform);

-- Insert initial versions
INSERT INTO app_versions (
  platform, 
  current_version, 
  minimum_supported, 
  latest_version,
  changelog,
  download_url
) VALUES 
  (
    'mobile', 
    '1.0.0', 
    '1.0.0', 
    '1.0.0',
    'Initial release with full feature parity:
- Dashboard with real-time updates
- Field Team Management
- MMP Management
- Site Visit Tracking
- Financial Operations
- Wallet Management
- Cost Submissions
- Chat & Notifications
- Offline Support
- Role-Based Access Control',
    'https://example.com/download/pact-workflow-v1.0.0.apk'
  ),
  (
    'web', 
    '1.0.0', 
    '1.0.0', 
    '1.0.0',
    'Initial release',
    NULL
  )
ON CONFLICT (platform) DO NOTHING;

-- Enable RLS
ALTER TABLE app_versions ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Everyone can read version info (needed for version checking)
CREATE POLICY "Anyone can read app versions"
  ON app_versions
  FOR SELECT
  USING (true);

-- Only admins can update version info
CREATE POLICY "Only admins can update app versions"
  ON app_versions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'Admin'
    )
  );

-- Only admins can insert version info
CREATE POLICY "Only admins can insert app versions"
  ON app_versions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'Admin'
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_app_versions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER app_versions_updated_at
  BEFORE UPDATE ON app_versions
  FOR EACH ROW
  EXECUTE FUNCTION update_app_versions_updated_at();

-- Add comments for documentation
COMMENT ON TABLE app_versions IS 'Stores version information for web and mobile apps to manage compatibility';
COMMENT ON COLUMN app_versions.platform IS 'Platform type: web or mobile';
COMMENT ON COLUMN app_versions.current_version IS 'Currently deployed version';
COMMENT ON COLUMN app_versions.minimum_supported IS 'Oldest version that still works with current backend';
COMMENT ON COLUMN app_versions.latest_version IS 'Latest available version for download';
COMMENT ON COLUMN app_versions.changelog IS 'Release notes for latest version';
COMMENT ON COLUMN app_versions.download_url IS 'URL to download latest APK (mobile only)';
COMMENT ON COLUMN app_versions.force_update IS 'Whether to force users to update';

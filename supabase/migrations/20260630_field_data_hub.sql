-- Field Data Hub tables
-- Run this in your Supabase SQL editor

-- Server connections
CREATE TABLE IF NOT EXISTS field_data_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('odk_central','ona','moda','kobo','generic')),
  base_url TEXT NOT NULL,
  username TEXT,
  api_token TEXT,
  project_id TEXT,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','error','paused','untested')),
  last_health_check TIMESTAMPTZ,
  sync_frequency_minutes INT DEFAULT 60,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Forms (one per form, linked to servers via form_servers)
CREATE TABLE IF NOT EXISTS field_data_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  form_id_slug TEXT,
  xlsform_url TEXT,
  current_version TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  default_language TEXT DEFAULT 'English',
  question_schema JSONB DEFAULT '[]',
  settings JSONB DEFAULT '{}',
  submission_count INT DEFAULT 0,
  last_submission_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Which servers each form is published to
CREATE TABLE IF NOT EXISTS field_data_form_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES field_data_forms(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES field_data_servers(id) ON DELETE CASCADE,
  remote_form_id TEXT,
  remote_project_id TEXT,
  version TEXT,
  published_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  submission_count INT DEFAULT 0,
  UNIQUE(form_id, server_id)
);

-- All submissions (merged from all servers + CSV imports)
CREATE TABLE IF NOT EXISTS field_data_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES field_data_forms(id) ON DELETE CASCADE,
  server_id UUID REFERENCES field_data_servers(id),
  submission_uuid TEXT,
  submitted_at TIMESTAMPTZ,
  submitted_by TEXT,
  enumerator_name TEXT,
  data JSONB DEFAULT '{}',
  gps_lat FLOAT,
  gps_lng FLOAT,
  gps_altitude FLOAT,
  gps_accuracy FLOAT,
  review_status TEXT DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected','on_hold')),
  review_comment TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  source TEXT DEFAULT 'csv_import' CHECK (source IN ('api_sync','csv_import','webhook','manual')),
  duration_seconds INT,
  device_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(form_id, submission_uuid)
);

-- Export history
CREATE TABLE IF NOT EXISTS field_data_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES field_data_forms(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('xlsx','csv','json','geojson','kml')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','failed')),
  file_url TEXT,
  file_name TEXT,
  file_size_bytes BIGINT,
  options JSONB DEFAULT '{}',
  row_count INT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  ready_at TIMESTAMPTZ
);

-- RLS policies
ALTER TABLE field_data_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_data_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_data_form_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_data_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_data_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage field_data_servers"
  ON field_data_servers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage field_data_forms"
  ON field_data_forms FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage field_data_form_servers"
  ON field_data_form_servers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage field_data_submissions"
  ON field_data_submissions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage field_data_exports"
  ON field_data_exports FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_fds_form ON field_data_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_fds_server ON field_data_submissions(server_id);
CREATE INDEX IF NOT EXISTS idx_fds_submitted_at ON field_data_submissions(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_fdf_status ON field_data_forms(status);

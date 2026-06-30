-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 5: Field Data Hub — Server Datasets (reference data / pulldata support)
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Server Datasets master table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_data_server_datasets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  file_name     TEXT,
  file_url      TEXT,
  storage_path  TEXT,
  row_count     INTEGER NOT NULL DEFAULT 0,
  columns       JSONB NOT NULL DEFAULT '[]',   -- [{name, type}]
  version       INTEGER NOT NULL DEFAULT 1,
  country_id    TEXT,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdsd_country ON field_data_server_datasets(country_id);
CREATE INDEX IF NOT EXISTS idx_fdsd_created ON field_data_server_datasets(created_at DESC);

ALTER TABLE field_data_server_datasets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fdsd_select" ON field_data_server_datasets;
DROP POLICY IF EXISTS "fdsd_manage" ON field_data_server_datasets;
CREATE POLICY "fdsd_select" ON field_data_server_datasets FOR SELECT TO authenticated USING (true);
CREATE POLICY "fdsd_manage" ON field_data_server_datasets FOR ALL   TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','admin','ict_it','data_team','fom','project_manager','country_director')
    )
  );

-- ─── 2. Dataset version history ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_data_dataset_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id     UUID NOT NULL REFERENCES field_data_server_datasets(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  file_name      TEXT,
  file_url       TEXT,
  storage_path   TEXT,
  row_count      INTEGER NOT NULL DEFAULT 0,
  columns        JSONB NOT NULL DEFAULT '[]',
  notes          TEXT,
  uploaded_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fddv_dataset ON field_data_dataset_versions(dataset_id);

ALTER TABLE field_data_dataset_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fddv_select" ON field_data_dataset_versions;
DROP POLICY IF EXISTS "fddv_manage" ON field_data_dataset_versions;
CREATE POLICY "fddv_select" ON field_data_dataset_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "fddv_manage" ON field_data_dataset_versions FOR ALL   TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','admin','ict_it','data_team','fom','project_manager','country_director')
    )
  );

-- ─── 3. Dataset ↔ Form links (many-to-many) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS field_data_dataset_form_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id    UUID NOT NULL REFERENCES field_data_server_datasets(id) ON DELETE CASCADE,
  form_id       UUID NOT NULL REFERENCES field_data_forms(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, form_id)
);

CREATE INDEX IF NOT EXISTS idx_fddfl_dataset ON field_data_dataset_form_links(dataset_id);
CREATE INDEX IF NOT EXISTS idx_fddfl_form    ON field_data_dataset_form_links(form_id);

ALTER TABLE field_data_dataset_form_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fddfl_select" ON field_data_dataset_form_links;
DROP POLICY IF EXISTS "fddfl_manage" ON field_data_dataset_form_links;
CREATE POLICY "fddfl_select" ON field_data_dataset_form_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "fddfl_manage" ON field_data_dataset_form_links FOR ALL   TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','admin','ict_it','data_team','fom','project_manager','country_director')
    )
  );

-- ─── 4. Storage bucket (run once — idempotent) ───────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('field-data-datasets', 'field-data-datasets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "fdd_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "fdd_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "fdd_storage_delete" ON storage.objects;
CREATE POLICY "fdd_storage_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'field-data-datasets');
CREATE POLICY "fdd_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'field-data-datasets');
CREATE POLICY "fdd_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'field-data-datasets');

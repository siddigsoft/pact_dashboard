-- ============================================================================
-- Field Data Hub — Phase 10: Server Datasets & Data Preloading
-- Requires: field_data_core_migration.sql (field_data_servers, field_data_forms)
--
-- Tables:
--   field_data_server_datasets     — dataset registry
--   field_data_dataset_versions    — version history of a dataset
--   field_data_dataset_form_links  — which forms use which dataset (pulldata)
--   fd_server_datasets             — fd_* alias (used by fd-api Edge Function)
--   fd_preload_configs             — pre-population/preload configuration per form
-- ============================================================================

-- ── 1. Server datasets ────────────────────────────────────────────────────────
-- Referenced by FieldDataDatasets.tsx as 'field_data_server_datasets'
CREATE TABLE IF NOT EXISTS field_data_server_datasets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  description   TEXT,
  -- Latest file info (updated on each new version)
  file_name     TEXT,
  file_url      TEXT,
  storage_path  TEXT,
  row_count     INTEGER     NOT NULL DEFAULT 0,
  columns       JSONB       NOT NULL DEFAULT '[]',   -- [{ name, type }]
  version       INTEGER     NOT NULL DEFAULT 1,
  country_id    UUID,                                -- optional country scoping
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guard: add is_active if the table already existed without it
ALTER TABLE field_data_server_datasets ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_fdsd_active   ON field_data_server_datasets(is_active);
CREATE INDEX IF NOT EXISTS idx_fdsd_country  ON field_data_server_datasets(country_id);
CREATE INDEX IF NOT EXISTS idx_fdsd_created  ON field_data_server_datasets(created_at DESC);

-- ── 2. Dataset versions ───────────────────────────────────────────────────────
-- Referenced by FieldDataDatasets.tsx as 'field_data_dataset_versions'
CREATE TABLE IF NOT EXISTS field_data_dataset_versions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id     UUID        NOT NULL REFERENCES field_data_server_datasets(id) ON DELETE CASCADE,
  version_number INTEGER     NOT NULL,
  file_name      TEXT,
  file_url       TEXT,
  storage_path   TEXT,
  row_count      INTEGER     NOT NULL DEFAULT 0,
  columns        JSONB       NOT NULL DEFAULT '[]',
  notes          TEXT,
  uploaded_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_fddv_dataset   ON field_data_dataset_versions(dataset_id);
CREATE INDEX IF NOT EXISTS idx_fddv_version   ON field_data_dataset_versions(version_number);

-- ── 3. Dataset ↔ Form links ───────────────────────────────────────────────────
-- Referenced by FieldDataDatasets.tsx as 'field_data_dataset_form_links'
CREATE TABLE IF NOT EXISTS field_data_dataset_form_links (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id     UUID        NOT NULL REFERENCES field_data_server_datasets(id) ON DELETE CASCADE,
  form_id        UUID        NOT NULL REFERENCES field_data_forms(id)          ON DELETE CASCADE,
  -- ODK pulldata() reference config
  key_column     TEXT,                               -- column used as unique key
  target_column  TEXT,                               -- column to pull
  notes          TEXT,
  created_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, form_id)
);

CREATE INDEX IF NOT EXISTS idx_fddfl_dataset  ON field_data_dataset_form_links(dataset_id);
CREATE INDEX IF NOT EXISTS idx_fddfl_form     ON field_data_dataset_form_links(form_id);

-- ── 4. fd_server_datasets — fd_* alias (used by fd-api Edge Function) ─────────
-- The fd-api Edge Function's GET /datasets/:id reads from 'fd_server_datasets'.
-- This table mirrors field_data_server_datasets for the unified fd_* namespace.
CREATE TABLE IF NOT EXISTS fd_server_datasets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  description   TEXT,
  file_name     TEXT,
  file_url      TEXT,
  storage_path  TEXT,
  row_count     INTEGER     NOT NULL DEFAULT 0,
  columns       JSONB       NOT NULL DEFAULT '[]',
  version       INTEGER     NOT NULL DEFAULT 1,
  -- Optional link to source
  source_dataset_id UUID    REFERENCES field_data_server_datasets(id) ON DELETE SET NULL,
  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fds_ds_created ON fd_server_datasets(created_at DESC);

-- ── 5. Preload configuration ──────────────────────────────────────────────────
-- Per-form pre-population configs (Phase 10: data preloading)
CREATE TABLE IF NOT EXISTS fd_preload_configs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id        UUID        NOT NULL REFERENCES fd_forms(id) ON DELETE CASCADE,
  dataset_id     UUID        REFERENCES fd_server_datasets(id) ON DELETE SET NULL,
  -- Which form field to look up the key from
  key_field      TEXT        NOT NULL,
  -- Columns to prefill → target form field mapping
  field_mapping  JSONB       NOT NULL DEFAULT '{}',  -- { "dataset_col": "form_field" }
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guard: add is_active if the table already existed without it
ALTER TABLE fd_preload_configs ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_fdpc_form      ON fd_preload_configs(form_id);
CREATE INDEX IF NOT EXISTS idx_fdpc_dataset   ON fd_preload_configs(dataset_id);

-- ── 6. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE field_data_server_datasets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_data_dataset_versions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_data_dataset_form_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_server_datasets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_preload_configs            ENABLE ROW LEVEL SECURITY;

-- Uses fd_is_hub_user() / fd_is_admin() from core migration
DROP POLICY IF EXISTS "fdsd_read" ON field_data_server_datasets;
CREATE POLICY "fdsd_read"    ON field_data_server_datasets    FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fdsd_write" ON field_data_server_datasets;
CREATE POLICY "fdsd_write"   ON field_data_server_datasets    FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
DROP POLICY IF EXISTS "fdsd_svc" ON field_data_server_datasets;
CREATE POLICY "fdsd_svc"     ON field_data_server_datasets    FOR ALL    TO service_role  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fddv_read" ON field_data_dataset_versions;
CREATE POLICY "fddv_read"    ON field_data_dataset_versions   FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fddv_write" ON field_data_dataset_versions;
CREATE POLICY "fddv_write"   ON field_data_dataset_versions   FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
DROP POLICY IF EXISTS "fddv_svc" ON field_data_dataset_versions;
CREATE POLICY "fddv_svc"     ON field_data_dataset_versions   FOR ALL    TO service_role  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fddfl_read" ON field_data_dataset_form_links;
CREATE POLICY "fddfl_read"   ON field_data_dataset_form_links FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fddfl_write" ON field_data_dataset_form_links;
CREATE POLICY "fddfl_write"  ON field_data_dataset_form_links FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
DROP POLICY IF EXISTS "fddfl_svc" ON field_data_dataset_form_links;
CREATE POLICY "fddfl_svc"    ON field_data_dataset_form_links FOR ALL    TO service_role  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fdsds_read" ON fd_server_datasets;
CREATE POLICY "fdsds_read"   ON fd_server_datasets            FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fdsds_write" ON fd_server_datasets;
CREATE POLICY "fdsds_write"  ON fd_server_datasets            FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
DROP POLICY IF EXISTS "fdsds_svc" ON fd_server_datasets;
CREATE POLICY "fdsds_svc"    ON fd_server_datasets            FOR ALL    TO service_role  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fdpc_read" ON fd_preload_configs;
CREATE POLICY "fdpc_read"    ON fd_preload_configs            FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fdpc_write" ON fd_preload_configs;
CREATE POLICY "fdpc_write"   ON fd_preload_configs            FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
DROP POLICY IF EXISTS "fdpc_svc" ON fd_preload_configs;
CREATE POLICY "fdpc_svc"     ON fd_preload_configs            FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- ── 7. Storage bucket hint ────────────────────────────────────────────────────
-- The Datasets page uploads files to Supabase Storage bucket: 'field-data-datasets'
-- Create this bucket in the Supabase dashboard (Storage → New Bucket):
--   Name:    field-data-datasets
--   Public:  false (signed URLs only)
--   Max file size: 50 MB
-- Or via SQL:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('field-data-datasets','field-data-datasets', false)
-- ON CONFLICT DO NOTHING;

-- ============================================================================
-- Phase 10 (Datasets) migration complete.
-- Tables: field_data_server_datasets, field_data_dataset_versions,
--         field_data_dataset_form_links, fd_server_datasets, fd_preload_configs
-- Run next: field_data_sampling_migration.sql
-- ============================================================================

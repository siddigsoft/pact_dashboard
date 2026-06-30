-- ============================================================================
-- FIELD DATA HUB — MASTER MIGRATION (All 18 Phases)
-- PACT Command Center
-- ============================================================================
-- Run this single file to set up the complete Field Data Hub schema.
-- Execution order is critical — each section depends on the previous.
-- Safe to re-run: all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
--
-- PHASE MAP
-- ─────────────────────────────────────────────────────────────────────────────
-- CORE   (Phases 1–6)  field_data_core_migration.sql
--   P01  Server connections     field_data_servers
--   P02  Forms & submissions    field_data_forms, field_data_submissions
--   P03  Import jobs            field_data_import_jobs
--   P04  Form versioning        field_data_form_versions, field_data_form_servers
--   P05  QR codes               (stored on field_data_forms.odk_qr_code)
--   P06  Sync engine            field_data_sync_logs, field_data_sync_schedules
--        fd_* unified schema    fd_forms, fd_submissions, fd_form_schema
-- ─────────────────────────────────────────────────────────────────────────────
--   P07  Smart Export           fd_export_jobs, fd_export_templates
--   P08  Fieldwork Monitoring   fd_enumerator_locations, fd_coverage_zones
--                               fd_enumerator_stats, fd_supervisor_actions
--                               fd_form_targets
--   P09  Case Management        fd_cases, fd_case_visits, fd_case_notes
--   P10  Server Datasets        field_data_server_datasets, fd_server_datasets
--                               field_data_dataset_versions
--                               field_data_dataset_form_links, fd_preload_configs
--   P10  Sampling Engine        fd_sampling_studies, fd_sampling_frames
--                               fd_sample_draws, fd_sample_units
--   P11  Multi-round Studies    fd_studies, fd_study_rounds
--                               fd_study_unit_tracking, fd_study_round_submissions
--   P12  Workflow & Review      fd_submission_reviews, fd_review_actions
--   P13  Quality / Encryption   fd_quality_rules, fd_quality_flags
--                               fd_form_targets (extended)
--   P14  Multi-Language Forms   fd_form_translations, fd_region_lang_defaults
--   P15  Collaboration          fd_submission_comments, fd_submission_flags
--                               fd_form_review_comments
--   P16  Backup & Recovery      fd_backups, fd_backup_schedules
--                               fd_restore_logs, fd_archive_logs
--   P17  API & Integrations     fd_api_keys, fd_api_usage_logs, fd_webhook_secrets
--   P18  Notification Channels  fd_notification_prefs, fd_form_subscriptions
--                               fd_notification_log
-- ============================================================================


-- ============================================================================
-- PHASE 1-6 CORE (field_data_* tables + fd_forms/fd_submissions/fd_form_schema)
-- ============================================================================
-- ============================================================================
-- Field Data Hub — CORE MIGRATION (Phases 1–6)
-- Run this FIRST before any other field_data_*.sql file.
--
-- Creates the foundational tables used by:
--   • Phase 1: Multi-server connections (FieldDataHub.tsx)
--   • Phase 2: Form viewer / submissions (FieldDataFormDetail.tsx)
--   • Phase 3: Import jobs
--   • Phase 4: Form publishing / versioning (FieldDataFormDetail.tsx)
--   • Phase 5: QR code generation (stored on field_data_forms)
--   • Phase 6: Real-time sync (fieldDataSync.ts)
--   Plus: fd_forms, fd_submissions, fd_form_schema (FK targets for phases 7–18)
-- ============================================================================

-- ── Phase 1: Server connections ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_data_servers (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT        NOT NULL,
  type                     TEXT        NOT NULL DEFAULT 'odk_central'
                           CHECK (type IN ('odk_central','ona','moda','kobo','generic')),
  base_url                 TEXT        NOT NULL,
  username                 TEXT,
  -- api_token stored encrypted; applications read via service_role only
  api_token                TEXT,
  project_id               TEXT,
  status                   TEXT        NOT NULL DEFAULT 'untested'
                           CHECK (status IN ('connected','error','paused','untested')),
  last_health_check        TIMESTAMPTZ,
  sync_frequency_minutes   INTEGER     NOT NULL DEFAULT 60,
  is_active                BOOLEAN     NOT NULL DEFAULT true,
  notes                    TEXT,
  created_by               UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guard: add is_active if the table already existed without it
ALTER TABLE field_data_servers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_fds_type     ON field_data_servers(type);
CREATE INDEX IF NOT EXISTS idx_fds_status   ON field_data_servers(status);
CREATE INDEX IF NOT EXISTS idx_fds_active   ON field_data_servers(is_active);

-- ── Phase 2: Forms ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_data_forms (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT        NOT NULL,
  description              TEXT,
  form_id_slug             TEXT,                             -- ODK/Ona form ID string
  xls_form_url             TEXT,                             -- XLSForm file URL
  status                   TEXT        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','paused','archived')),
  default_language         TEXT        NOT NULL DEFAULT 'English',
  submission_count         INTEGER     NOT NULL DEFAULT 0,
  last_submission_at       TIMESTAMPTZ,
  -- QR code for ODK Collect (Phase 5) – stored as base64 or URL
  odk_qr_code              TEXT,
  qr_generated_at          TIMESTAMPTZ,
  -- Encryption (Phase 13)
  encryption_enabled       BOOLEAN     NOT NULL DEFAULT false,
  public_key               TEXT,
  created_by               UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdf_status   ON field_data_forms(status);
CREATE INDEX IF NOT EXISTS idx_fdf_slug     ON field_data_forms(form_id_slug);
CREATE INDEX IF NOT EXISTS idx_fdf_created  ON field_data_forms(created_at DESC);

-- Junction: form ↔ server (many-to-many)
CREATE TABLE IF NOT EXISTS field_data_form_servers (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id          UUID        NOT NULL REFERENCES field_data_forms(id)   ON DELETE CASCADE,
  server_id        UUID        NOT NULL REFERENCES field_data_servers(id) ON DELETE CASCADE,
  submission_count INTEGER     NOT NULL DEFAULT 0,
  last_synced_at   TIMESTAMPTZ,
  remote_form_id   TEXT,                             -- server's own form identifier
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (form_id, server_id)
);

CREATE INDEX IF NOT EXISTS idx_fdfs_form    ON field_data_form_servers(form_id);
CREATE INDEX IF NOT EXISTS idx_fdfs_server  ON field_data_form_servers(server_id);

-- ── Phase 2: Submissions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_data_submissions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id        UUID        NOT NULL REFERENCES field_data_forms(id) ON DELETE CASCADE,
  server_id      UUID        REFERENCES field_data_servers(id) ON DELETE SET NULL,
  uuid           TEXT        UNIQUE,                     -- ODK instance UUID
  data           JSONB       NOT NULL DEFAULT '{}',
  status         TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected','needs_review')),
  review_status  TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (review_status IN ('pending','under_review','approved','rejected')),
  reviewed_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at    TIMESTAMPTZ,
  review_note    TEXT,
  source         TEXT        NOT NULL DEFAULT 'sync'
                 CHECK (source IN ('sync','webhook','api','import','manual')),
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at      TIMESTAMPTZ,
  -- Geolocation captured at submission time
  latitude       NUMERIC(10,7),
  longitude      NUMERIC(10,7),
  accuracy_m     NUMERIC(7,2),
  -- Audit
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdsu_form     ON field_data_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_fdsu_status   ON field_data_submissions(status);
CREATE INDEX IF NOT EXISTS idx_fdsu_review   ON field_data_submissions(review_status);
CREATE INDEX IF NOT EXISTS idx_fdsu_at       ON field_data_submissions(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_fdsu_uuid     ON field_data_submissions(uuid);
CREATE INDEX IF NOT EXISTS idx_fdsu_source   ON field_data_submissions(source);

-- ── Phase 3: Import jobs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_data_import_jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id         UUID        NOT NULL REFERENCES field_data_forms(id) ON DELETE CASCADE,
  file_name       TEXT        NOT NULL,
  file_url        TEXT,
  storage_path    TEXT,
  row_count       INTEGER     NOT NULL DEFAULT 0,
  imported_count  INTEGER     NOT NULL DEFAULT 0,
  skipped_count   INTEGER     NOT NULL DEFAULT 0,
  error_count     INTEGER     NOT NULL DEFAULT 0,
  status          TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','complete','failed')),
  error_log       JSONB,
  mapping         JSONB,                               -- column → form field mapping
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdij_form    ON field_data_import_jobs(form_id);
CREATE INDEX IF NOT EXISTS idx_fdij_status  ON field_data_import_jobs(status);

-- ── Phase 4: Form versions / publishing ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_data_form_versions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id        UUID        NOT NULL REFERENCES field_data_forms(id) ON DELETE CASCADE,
  version        INTEGER     NOT NULL DEFAULT 1,
  xls_form_url   TEXT,
  storage_path   TEXT,
  schema_json    JSONB,                                -- parsed question schema
  published_to   TEXT[]      NOT NULL DEFAULT '{}',   -- server_ids published to
  change_notes   TEXT,
  is_current     BOOLEAN     NOT NULL DEFAULT false,
  published_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (form_id, version)
);

CREATE INDEX IF NOT EXISTS idx_fdfv_form    ON field_data_form_versions(form_id);
CREATE INDEX IF NOT EXISTS idx_fdfv_current ON field_data_form_versions(is_current);

-- ── Phase 6: Sync jobs & logs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_data_sync_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id           UUID        REFERENCES field_data_forms(id)   ON DELETE SET NULL,
  server_id         UUID        REFERENCES field_data_servers(id) ON DELETE SET NULL,
  status            TEXT        NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running','success','partial','failed')),
  triggered_by      TEXT        NOT NULL DEFAULT 'manual'
                    CHECK (triggered_by IN ('manual','scheduled','webhook')),
  new_submissions   INTEGER     NOT NULL DEFAULT 0,
  updated_submissions INTEGER   NOT NULL DEFAULT 0,
  skipped_count     INTEGER     NOT NULL DEFAULT 0,
  error_message     TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ,
  duration_ms       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_fdsl_form    ON field_data_sync_logs(form_id);
CREATE INDEX IF NOT EXISTS idx_fdsl_server  ON field_data_sync_logs(server_id);
CREATE INDEX IF NOT EXISTS idx_fdsl_status  ON field_data_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_fdsl_started ON field_data_sync_logs(started_at DESC);

-- Scheduled sync queue (Phase 6)
CREATE TABLE IF NOT EXISTS field_data_sync_schedules (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id        UUID        NOT NULL REFERENCES field_data_servers(id) ON DELETE CASCADE,
  form_id          UUID        REFERENCES field_data_forms(id) ON DELETE CASCADE,
  frequency_mins   INTEGER     NOT NULL DEFAULT 60,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  next_run_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdss_server  ON field_data_sync_schedules(server_id);
CREATE INDEX IF NOT EXISTS idx_fdss_next    ON field_data_sync_schedules(next_run_at);

-- Phase 7 (legacy exports table used by FieldDataFormDetail.tsx)
-- NOTE: fd_export_jobs is the newer table created in field_data_exports_migration.sql
-- This table is the older field_data_* prefixed one used by formDetail page.
CREATE TABLE IF NOT EXISTS field_data_exports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       UUID        NOT NULL REFERENCES field_data_forms(id) ON DELETE CASCADE,
  format        TEXT        NOT NULL DEFAULT 'csv'
                CHECK (format IN ('csv','xlsx','stata','spss','r','sav','json')),
  status        TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','ready','failed')),
  file_url      TEXT,
  storage_path  TEXT,
  row_count     INTEGER,
  filters       JSONB,
  error_message TEXT,
  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fde_form    ON field_data_exports(form_id);
CREATE INDEX IF NOT EXISTS idx_fde_status  ON field_data_exports(status);

-- ============================================================================
-- fd_forms / fd_submissions / fd_form_schema
-- These are the UNIFIED schema used by Phases 7–18. They coexist alongside
-- the field_data_* tables above (early phases).  Future work: consolidate
-- into a single naming convention.
-- ============================================================================

-- fd_forms — unified form registry (referenced by FK in phases 7–18 tables)
CREATE TABLE IF NOT EXISTS fd_forms (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  description      TEXT,
  version          TEXT        NOT NULL DEFAULT '1',
  status           TEXT        NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','paused','archived','draft')),
  default_language TEXT        NOT NULL DEFAULT 'en',
  submission_count INTEGER     NOT NULL DEFAULT 0,
  last_submission_at TIMESTAMPTZ,
  -- Link back to field_data_forms (optional — set when form originates from server)
  legacy_form_id   UUID        REFERENCES field_data_forms(id) ON DELETE SET NULL,
  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdforms_status   ON fd_forms(status);
CREATE INDEX IF NOT EXISTS idx_fdforms_created  ON fd_forms(created_at DESC);

-- fd_submissions — unified submission store (referenced by FK in phases 7–18)
CREATE TABLE IF NOT EXISTS fd_submissions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id        UUID        NOT NULL REFERENCES fd_forms(id) ON DELETE CASCADE,
  uuid           TEXT        UNIQUE,
  data           JSONB       NOT NULL DEFAULT '{}',
  status         TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected','needs_review')),
  review_status  TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (review_status IN ('pending','under_review','approved','rejected')),
  source         TEXT        NOT NULL DEFAULT 'sync'
                 CHECK (source IN ('sync','webhook','api','import','manual')),
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  latitude       NUMERIC(10,7),
  longitude      NUMERIC(10,7),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdsubs_form     ON fd_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_fdsubs_status   ON fd_submissions(status);
CREATE INDEX IF NOT EXISTS idx_fdsubs_review   ON fd_submissions(review_status);
CREATE INDEX IF NOT EXISTS idx_fdsubs_at       ON fd_submissions(submitted_at DESC);

-- fd_form_schema — question/field schema per form version
CREATE TABLE IF NOT EXISTS fd_form_schema (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id      UUID        NOT NULL REFERENCES fd_forms(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,                  -- ODK variable name
  label        TEXT,                                  -- display label (English)
  label_ar     TEXT,                                  -- display label (Arabic)
  type         TEXT        NOT NULL DEFAULT 'text',   -- text, integer, decimal, select_one …
  parent_name  TEXT,                                  -- for group/repeat hierarchy
  options      JSONB,                                 -- choice list for select_* types
  required     BOOLEAN     NOT NULL DEFAULT false,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdfs_form    ON fd_form_schema(form_id);
CREATE INDEX IF NOT EXISTS idx_fdfs_name    ON fd_form_schema(name);
CREATE INDEX IF NOT EXISTS idx_fdfs_type    ON fd_form_schema(type);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE field_data_servers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_data_forms             ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_data_form_servers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_data_submissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_data_import_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_data_form_versions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_data_sync_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_data_sync_schedules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_data_exports           ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_forms                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_submissions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_form_schema               ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user a field data hub user?
-- roles allowed: super_admin, admin, ict, data_team, fom, coordinator,
--                field_officer, project_manager, country_director
CREATE OR REPLACE FUNCTION fd_is_hub_user() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN (
        'super_admin','admin','ict','data_team','fom',
        'coordinator','field_officer','project_manager','country_director'
      )
  );
$$;

CREATE OR REPLACE FUNCTION fd_is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','admin','ict','data_team')
  );
$$;

-- Servers: read by hub users; write by admins only
CREATE POLICY "fdserv_read"  ON field_data_servers FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fdserv_write" ON field_data_servers FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
CREATE POLICY "fdserv_svc"   ON field_data_servers FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- Forms: read by hub users; write by admins
CREATE POLICY "fdf_read"   ON field_data_forms FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fdf_write"  ON field_data_forms FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
CREATE POLICY "fdf_svc"    ON field_data_forms FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- Form-server junction
CREATE POLICY "fdfs_read"  ON field_data_form_servers FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fdfs_write" ON field_data_form_servers FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
CREATE POLICY "fdfs_svc"   ON field_data_form_servers FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- Submissions: read by hub users; write by data_team/admins and service_role
CREATE POLICY "fdsub_read"  ON field_data_submissions FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fdsub_write" ON field_data_submissions FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
CREATE POLICY "fdsub_svc"   ON field_data_submissions FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- Import jobs
CREATE POLICY "fdij_read"   ON field_data_import_jobs FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fdij_write"  ON field_data_import_jobs FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
CREATE POLICY "fdij_svc"    ON field_data_import_jobs FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- Form versions
CREATE POLICY "fdfv_read"   ON field_data_form_versions FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fdfv_write"  ON field_data_form_versions FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
CREATE POLICY "fdfv_svc"    ON field_data_form_versions FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- Sync logs
CREATE POLICY "fdsl_read"   ON field_data_sync_logs FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fdsl_write"  ON field_data_sync_logs FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
CREATE POLICY "fdsl_svc"    ON field_data_sync_logs FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- Sync schedules
CREATE POLICY "fdss_read"   ON field_data_sync_schedules FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fdss_write"  ON field_data_sync_schedules FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
CREATE POLICY "fdss_svc"    ON field_data_sync_schedules FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- Exports (legacy)
CREATE POLICY "fde_read"    ON field_data_exports FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fde_write"   ON field_data_exports FOR ALL    TO authenticated USING (fd_is_hub_user()) WITH CHECK (fd_is_hub_user());
CREATE POLICY "fde_svc"     ON field_data_exports FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- fd_forms / fd_submissions / fd_form_schema
CREATE POLICY "fdforms_read"  ON fd_forms      FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fdforms_write" ON fd_forms      FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
CREATE POLICY "fdforms_svc"   ON fd_forms      FOR ALL    TO service_role  USING (true) WITH CHECK (true);

CREATE POLICY "fdsubs_read"   ON fd_submissions FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fdsubs_write"  ON fd_submissions FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
CREATE POLICY "fdsubs_svc"    ON fd_submissions FOR ALL    TO service_role  USING (true) WITH CHECK (true);

CREATE POLICY "fdschema_read" ON fd_form_schema FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fdschema_write"ON fd_form_schema FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
CREATE POLICY "fdschema_svc"  ON fd_form_schema FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- ── Helper: increment submission counter ─────────────────────────────────────
CREATE OR REPLACE FUNCTION fd_increment_submission_count(p_form_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE field_data_forms
     SET submission_count = submission_count + 1,
         last_submission_at = now()
   WHERE id = p_form_id;
  UPDATE fd_forms
     SET submission_count = submission_count + 1,
         last_submission_at = now()
   WHERE id = p_form_id OR legacy_form_id = p_form_id;
$$;

GRANT EXECUTE ON FUNCTION fd_increment_submission_count(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION fd_is_hub_user() TO authenticated;
GRANT EXECUTE ON FUNCTION fd_is_admin()    TO authenticated;

-- ============================================================================
-- Core migration complete (Phases 1–6 + fd_forms/fd_submissions/fd_form_schema)
-- Run next: field_data_datasets_migration.sql
-- ============================================================================

-- ============================================================================
-- PHASE 10: SERVER DATASETS & DATA PRELOADING
-- ============================================================================
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
CREATE POLICY "fdsd_read"    ON field_data_server_datasets    FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fdsd_write"   ON field_data_server_datasets    FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
CREATE POLICY "fdsd_svc"     ON field_data_server_datasets    FOR ALL    TO service_role  USING (true) WITH CHECK (true);

CREATE POLICY "fddv_read"    ON field_data_dataset_versions   FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fddv_write"   ON field_data_dataset_versions   FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
CREATE POLICY "fddv_svc"     ON field_data_dataset_versions   FOR ALL    TO service_role  USING (true) WITH CHECK (true);

CREATE POLICY "fddfl_read"   ON field_data_dataset_form_links FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fddfl_write"  ON field_data_dataset_form_links FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
CREATE POLICY "fddfl_svc"    ON field_data_dataset_form_links FOR ALL    TO service_role  USING (true) WITH CHECK (true);

CREATE POLICY "fdsds_read"   ON fd_server_datasets            FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fdsds_write"  ON fd_server_datasets            FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
CREATE POLICY "fdsds_svc"    ON fd_server_datasets            FOR ALL    TO service_role  USING (true) WITH CHECK (true);

CREATE POLICY "fdpc_read"    ON fd_preload_configs            FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fdpc_write"   ON fd_preload_configs            FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
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

-- ============================================================================
-- SAMPLING ENGINE (FieldDataSampling.tsx)
-- ============================================================================
-- ============================================================================
-- Field Data Hub — Sampling Engine (FieldDataSampling.tsx)
-- Requires: field_data_core_migration.sql (fd_forms)
--
-- Tables:
--   fd_sampling_studies   — study/survey metadata + sample size parameters
--   fd_sampling_frames    — uploaded population frames (CSV/XLSX)
--   fd_sample_draws       — seeded random draws
--   fd_sample_units       — individual sampled units with field tracking
-- ============================================================================

-- ── 1. Sampling studies ───────────────────────────────────────────────────────
-- Referenced by FieldDataSampling.tsx as 'fd_sampling_studies'
CREATE TABLE IF NOT EXISTS fd_sampling_studies (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT        NOT NULL,
  description          TEXT,
  form_id              UUID        REFERENCES fd_forms(id) ON DELETE SET NULL,
  -- Sample size calculator inputs
  population_size      INTEGER,
  confidence_level     NUMERIC(5,2) NOT NULL DEFAULT 95.0,
  margin_of_error      NUMERIC(5,2) NOT NULL DEFAULT 5.0,
  expected_proportion  NUMERIC(5,4) NOT NULL DEFAULT 0.5,
  design_effect        NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  nonresponse_rate     NUMERIC(5,2) NOT NULL DEFAULT 10.0,
  calculated_n         INTEGER,
  -- Sampling method
  method               TEXT        NOT NULL DEFAULT 'srs'
                       CHECK (method IN (
                         'srs','systematic','stratified','cluster',
                         'multistage','epi','geographic','lqas','quota','snowball'
                       )),
  status               TEXT        NOT NULL DEFAULT 'design'
                       CHECK (status IN ('design','drawing','field','complete','archived')),
  created_by           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdss_status   ON fd_sampling_studies(status);
CREATE INDEX IF NOT EXISTS idx_fdss_form     ON fd_sampling_studies(form_id);
CREATE INDEX IF NOT EXISTS idx_fdss_created  ON fd_sampling_studies(created_at DESC);

-- ── 2. Sampling frames ────────────────────────────────────────────────────────
-- Referenced by FieldDataSampling.tsx as 'fd_sampling_frames'
CREATE TABLE IF NOT EXISTS fd_sampling_frames (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id      UUID        NOT NULL REFERENCES fd_sampling_studies(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  version       INTEGER     NOT NULL DEFAULT 1,
  file_name     TEXT,
  file_url      TEXT,
  storage_path  TEXT,
  total_units   INTEGER     NOT NULL DEFAULT 0,
  columns       JSONB       NOT NULL DEFAULT '[]',   -- [{ name, type }]
  data          JSONB       NOT NULL DEFAULT '[]',   -- actual row data
  is_current    BOOLEAN     NOT NULL DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (study_id, version)
);

CREATE INDEX IF NOT EXISTS idx_fdsfr_study   ON fd_sampling_frames(study_id);
CREATE INDEX IF NOT EXISTS idx_fdsfr_current ON fd_sampling_frames(is_current);

-- Ensure only one frame is marked current per study
CREATE OR REPLACE FUNCTION fd_enforce_one_current_frame()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_current THEN
    UPDATE fd_sampling_frames
       SET is_current = false
     WHERE study_id = NEW.study_id AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fd_one_current_frame ON fd_sampling_frames;
CREATE TRIGGER trg_fd_one_current_frame
  AFTER INSERT OR UPDATE OF is_current ON fd_sampling_frames
  FOR EACH ROW WHEN (NEW.is_current)
  EXECUTE FUNCTION fd_enforce_one_current_frame();

-- ── 3. Sample draws ───────────────────────────────────────────────────────────
-- Referenced by FieldDataSampling.tsx as 'fd_sample_draws'
CREATE TABLE IF NOT EXISTS fd_sample_draws (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id    UUID        NOT NULL REFERENCES fd_sampling_studies(id) ON DELETE CASCADE,
  frame_id    UUID        REFERENCES fd_sampling_frames(id) ON DELETE SET NULL,
  method      TEXT        NOT NULL,   -- srs, systematic, stratified, etc.
  params      JSONB       NOT NULL DEFAULT '{}',   -- draw parameters (strata, clusters, etc.)
  seed        TEXT        NOT NULL,                -- PRNG seed for reproducibility
  sample_size INTEGER     NOT NULL DEFAULT 0,
  status      TEXT        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','drawing','complete','failed')),
  label       TEXT,
  drawn_at    TIMESTAMPTZ,
  drawn_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdsd_study   ON fd_sample_draws(study_id);
CREATE INDEX IF NOT EXISTS idx_fdsd_status  ON fd_sample_draws(status);

-- ── 4. Sample units ───────────────────────────────────────────────────────────
-- Referenced by FieldDataSampling.tsx as 'fd_sample_units'
CREATE TABLE IF NOT EXISTS fd_sample_units (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id          UUID        NOT NULL REFERENCES fd_sample_draws(id)    ON DELETE CASCADE,
  study_id         UUID        NOT NULL REFERENCES fd_sampling_studies(id) ON DELETE CASCADE,
  unit_key         TEXT        NOT NULL,   -- unique identifier from the frame
  unit_data        JSONB       NOT NULL DEFAULT '{}',
  stratum          TEXT,
  cluster          TEXT,
  sort_order       INTEGER,
  enumerator_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  status           TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN (
                     'pending','complete','not_found','refused',
                     'unavailable','duplicate','replacement_used'
                   )),
  outcome_notes    TEXT,
  is_replacement   BOOLEAN     NOT NULL DEFAULT false,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdsu_draw     ON fd_sample_units(draw_id);
CREATE INDEX IF NOT EXISTS idx_fdsu_study    ON fd_sample_units(study_id);
CREATE INDEX IF NOT EXISTS idx_fdsu_status   ON fd_sample_units(status);
CREATE INDEX IF NOT EXISTS idx_fdsu_enum     ON fd_sample_units(enumerator_id);
CREATE INDEX IF NOT EXISTS idx_fdsu_key      ON fd_sample_units(unit_key);

-- ── 5. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE fd_sampling_studies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_sampling_frames   ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_sample_draws      ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_sample_units      ENABLE ROW LEVEL SECURITY;

-- Uses fd_is_hub_user() / fd_is_admin() from core migration
CREATE POLICY "fdsamst_read"  ON fd_sampling_studies FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fdsamst_write" ON fd_sampling_studies FOR ALL    TO authenticated USING (fd_is_hub_user()) WITH CHECK (fd_is_hub_user());
CREATE POLICY "fdsamst_svc"   ON fd_sampling_studies FOR ALL    TO service_role  USING (true) WITH CHECK (true);

CREATE POLICY "fdsamfr_read"  ON fd_sampling_frames  FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fdsamfr_write" ON fd_sampling_frames  FOR ALL    TO authenticated USING (fd_is_hub_user()) WITH CHECK (fd_is_hub_user());
CREATE POLICY "fdsamfr_svc"   ON fd_sampling_frames  FOR ALL    TO service_role  USING (true) WITH CHECK (true);

CREATE POLICY "fdsadr_read"   ON fd_sample_draws     FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fdsadr_write"  ON fd_sample_draws     FOR ALL    TO authenticated USING (fd_is_hub_user()) WITH CHECK (fd_is_hub_user());
CREATE POLICY "fdsadr_svc"    ON fd_sample_draws     FOR ALL    TO service_role  USING (true) WITH CHECK (true);

CREATE POLICY "fdsaun_read"   ON fd_sample_units     FOR SELECT TO authenticated USING (fd_is_hub_user());
CREATE POLICY "fdsaun_write"  ON fd_sample_units     FOR ALL    TO authenticated USING (fd_is_hub_user()) WITH CHECK (fd_is_hub_user());
CREATE POLICY "fdsaun_svc"    ON fd_sample_units     FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- ── 6. Helpful RPC: sampling progress ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION fd_sampling_progress(p_draw_id UUID)
RETURNS TABLE (
  total        BIGINT,
  complete     BIGINT,
  pending      BIGINT,
  not_found    BIGINT,
  refused      BIGINT,
  response_rate NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COUNT(*)                                                          AS total,
    COUNT(*) FILTER (WHERE status = 'complete')                       AS complete,
    COUNT(*) FILTER (WHERE status = 'pending')                        AS pending,
    COUNT(*) FILTER (WHERE status = 'not_found')                      AS not_found,
    COUNT(*) FILTER (WHERE status = 'refused')                        AS refused,
    ROUND(
      COUNT(*) FILTER (WHERE status = 'complete')::NUMERIC /
      NULLIF(COUNT(*), 0) * 100, 1
    )                                                                 AS response_rate
  FROM fd_sample_units
  WHERE draw_id = p_draw_id;
$$;

GRANT EXECUTE ON FUNCTION fd_sampling_progress(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fd_sampling_progress(UUID) TO service_role;

-- ============================================================================
-- Sampling migration complete.
-- Tables: fd_sampling_studies, fd_sampling_frames, fd_sample_draws, fd_sample_units
-- RPC:    fd_sampling_progress(UUID)
-- ============================================================================

-- ============================================================================
-- PHASE 7: SMART EXPORT
-- ============================================================================
-- ============================================================================
-- Phase 13: Smart Export — fd_export_jobs + fd_export_templates
-- Run in Supabase SQL Editor (safe to re-run: IF NOT EXISTS guards)
-- ============================================================================

-- Export format enum
DO $$ BEGIN
  CREATE TYPE fd_export_format AS ENUM (
    'xlsx', 'csv',
    'stata_dta', 'spss_sav', 'r_script', 'sas',
    'geojson', 'kml', 'shapefile',
    'dhis2_json', 'activityinfo', 'odata'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Export status enum
DO $$ BEGIN
  CREATE TYPE fd_export_status AS ENUM ('queued', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── fd_export_jobs ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fd_export_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id          UUID REFERENCES fd_forms(id) ON DELETE SET NULL,
  form_name        TEXT,
  format           fd_export_format NOT NULL DEFAULT 'xlsx',
  status           fd_export_status NOT NULL DEFAULT 'queued',
  options          JSONB NOT NULL DEFAULT '{}',
  record_count     INTEGER,
  file_size_bytes  BIGINT,
  file_url         TEXT,
  error_message    TEXT,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fd_export_jobs_status       ON fd_export_jobs(status);
CREATE INDEX IF NOT EXISTS idx_fd_export_jobs_created_by   ON fd_export_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_fd_export_jobs_created_at   ON fd_export_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fd_export_jobs_form_id      ON fd_export_jobs(form_id);

-- ── fd_export_templates ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fd_export_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  form_id       UUID REFERENCES fd_forms(id) ON DELETE SET NULL,
  form_name     TEXT,
  format        fd_export_format NOT NULL DEFAULT 'xlsx',
  options       JSONB NOT NULL DEFAULT '{}',
  use_count     INTEGER NOT NULL DEFAULT 0,
  last_used_at  TIMESTAMPTZ,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fd_export_templates_created_by ON fd_export_templates(created_by);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE fd_export_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_export_templates  ENABLE ROW LEVEL SECURITY;

-- Jobs: users see their own; admins/data team/FOM see all
DROP POLICY IF EXISTS "fd_export_jobs_select"  ON fd_export_jobs;
DROP POLICY IF EXISTS "fd_export_jobs_insert"  ON fd_export_jobs;
DROP POLICY IF EXISTS "fd_export_jobs_delete"  ON fd_export_jobs;
DROP POLICY IF EXISTS "fd_export_jobs_update"  ON fd_export_jobs;

CREATE POLICY "fd_export_jobs_select" ON fd_export_jobs
  FOR SELECT USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'ict', 'data_team', 'fom', 'country_director')
    )
  );

CREATE POLICY "fd_export_jobs_insert" ON fd_export_jobs
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'ict', 'data_team', 'fom', 'project_manager', 'country_director')
    )
  );

CREATE POLICY "fd_export_jobs_delete" ON fd_export_jobs
  FOR DELETE USING (created_by = auth.uid() OR EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'ict')
  ));

-- Service role can update status / file_url
CREATE POLICY "fd_export_jobs_update" ON fd_export_jobs
  FOR UPDATE USING (true);

-- Templates: users manage their own
DROP POLICY IF EXISTS "fd_export_templates_select"  ON fd_export_templates;
DROP POLICY IF EXISTS "fd_export_templates_insert"  ON fd_export_templates;
DROP POLICY IF EXISTS "fd_export_templates_delete"  ON fd_export_templates;
DROP POLICY IF EXISTS "fd_export_templates_update"  ON fd_export_templates;

CREATE POLICY "fd_export_templates_select" ON fd_export_templates
  FOR SELECT USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'ict')
    )
  );

CREATE POLICY "fd_export_templates_insert" ON fd_export_templates
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "fd_export_templates_delete" ON fd_export_templates
  FOR DELETE USING (created_by = auth.uid() OR EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'ict')
  ));

CREATE POLICY "fd_export_templates_update" ON fd_export_templates
  FOR UPDATE USING (created_by = auth.uid() OR EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'ict')
  ));

-- ── process_export_job RPC ───────────────────────────────────────────────────
-- Called by the export worker (Edge Function or service_role client) to
-- update job status and set the output file URL + metadata.

CREATE OR REPLACE FUNCTION process_export_job(
  p_job_id        UUID,
  p_status        fd_export_status,
  p_file_url      TEXT    DEFAULT NULL,
  p_record_count  INTEGER DEFAULT NULL,
  p_file_size     BIGINT  DEFAULT NULL,
  p_error         TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE fd_export_jobs
  SET
    status          = p_status,
    file_url        = COALESCE(p_file_url, file_url),
    record_count    = COALESCE(p_record_count, record_count),
    file_size_bytes = COALESCE(p_file_size, file_size_bytes),
    error_message   = p_error,
    started_at      = CASE WHEN p_status = 'processing' AND started_at IS NULL THEN NOW() ELSE started_at END,
    completed_at    = CASE WHEN p_status IN ('completed', 'failed') THEN NOW() ELSE completed_at END
  WHERE id = p_job_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'job_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION process_export_job(UUID, fd_export_status, TEXT, INTEGER, BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process_export_job(UUID, fd_export_status, TEXT, INTEGER, BIGINT, TEXT) TO service_role;

-- ── increment_template_use RPC ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_template_use(p_template_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE fd_export_templates
  SET use_count = use_count + 1, last_used_at = NOW()
  WHERE id = p_template_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_template_use(UUID) TO authenticated;

-- ============================================================================
-- Notes:
--  • Actual file generation runs in a Supabase Edge Function or external worker.
--    The worker: sets status → processing, generates file, uploads to Supabase
--    Storage, calls process_export_job() to set status → completed + file_url.
--  • For testing without a worker, manually set:
--    UPDATE fd_export_jobs SET status='completed', file_url='https://...', record_count=123
--    WHERE id = '<job_id>';
--  • OData exports return a live feed URL rather than a downloadable file.
-- ============================================================================

-- ============================================================================
-- PHASE 8: FIELDWORK MONITORING DASHBOARD
-- ============================================================================
-- ============================================================================
-- Field Data Hub — Phase 10: Fieldwork Monitoring
-- Run in Supabase SQL Editor (safe to re-run: uses IF NOT EXISTS)
-- ============================================================================

-- ─── 1. Enumerator Live Locations ────────────────────────────────────────────
-- One row per enumerator per form; updated whenever a GPS submission is synced.
CREATE TABLE IF NOT EXISTS fd_enumerator_locations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id                UUID NOT NULL,     -- REFERENCES field_data_forms(id) ON DELETE CASCADE
  enumerator_id          TEXT NOT NULL,     -- submitted_by or username from submission
  enumerator_name        TEXT,
  latitude               NUMERIC(9,6),
  longitude              NUMERIC(9,6),
  accuracy_m             NUMERIC(8,2),      -- GPS accuracy in metres
  submission_count_today INTEGER NOT NULL DEFAULT 0,
  daily_target           INTEGER NOT NULL DEFAULT 0,
  last_submission_at     TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(form_id, enumerator_id)
);

CREATE INDEX IF NOT EXISTS idx_fd_enum_locs_form ON fd_enumerator_locations(form_id);

-- ─── 2. Coverage Zones ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_coverage_zones (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id                UUID NOT NULL,     -- REFERENCES field_data_forms(id) ON DELETE CASCADE
  zone_name              TEXT NOT NULL,
  zone_type              TEXT NOT NULL DEFAULT 'locality'
                         CHECK (zone_type IN ('locality','site','admin_area','cluster')),
  target_count           INTEGER NOT NULL DEFAULT 0,
  actual_count           INTEGER NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','in_progress','complete','skipped')),
  assigned_enumerator_id TEXT,
  last_activity_at       TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(form_id, zone_name)
);

CREATE INDEX IF NOT EXISTS idx_fd_coverage_zones_form   ON fd_coverage_zones(form_id);
CREATE INDEX IF NOT EXISTS idx_fd_coverage_zones_status ON fd_coverage_zones(status);

-- ─── 3. Supervisor Actions Log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_supervisor_actions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id                UUID,              -- REFERENCES field_data_forms(id) ON DELETE SET NULL
  action_type            TEXT NOT NULL
                         CHECK (action_type IN ('message','reassign','extend_deadline','note')),
  target_enumerator_id   TEXT,             -- NULL = whole team
  zone_name              TEXT,
  message                TEXT,
  new_deadline           DATE,
  performed_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fd_sup_actions_form ON fd_supervisor_actions(form_id);
CREATE INDEX IF NOT EXISTS idx_fd_sup_actions_time ON fd_supervisor_actions(performed_at DESC);

-- ─── 4. updated_at triggers ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_fd_monitoring_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$ BEGIN
  CREATE TRIGGER trg_fd_enum_locs_updated_at
    BEFORE UPDATE ON fd_enumerator_locations
    FOR EACH ROW EXECUTE FUNCTION update_fd_monitoring_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_fd_coverage_zones_updated_at
    BEFORE UPDATE ON fd_coverage_zones
    FOR EACH ROW EXECUTE FUNCTION update_fd_monitoring_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 5. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE fd_enumerator_locations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_coverage_zones        ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_supervisor_actions    ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "fd_enum_locs_access"     ON fd_enumerator_locations;
  DROP POLICY IF EXISTS "fd_coverage_zones_access" ON fd_coverage_zones;
  DROP POLICY IF EXISTS "fd_sup_actions_access"    ON fd_supervisor_actions;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "fd_enum_locs_access" ON fd_enumerator_locations FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin',
      'ict','fom','data_team','projectmanager','project_manager','countrydirector','country_director')));

CREATE POLICY "fd_coverage_zones_access" ON fd_coverage_zones FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin',
      'ict','fom','data_team','projectmanager','project_manager','countrydirector','country_director')));

CREATE POLICY "fd_sup_actions_access" ON fd_supervisor_actions FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin',
      'ict','fom','data_team','projectmanager','project_manager','countrydirector','country_director')));

NOTIFY pgrst, 'reload schema';

-- ─── 6. Populate enumerator locations from submissions ────────────────────────
-- Run this after each sync to refresh the live map data.
-- Adjust column names to match your actual field_data_submissions schema.
/*
INSERT INTO fd_enumerator_locations (
  form_id, enumerator_id, enumerator_name,
  latitude, longitude,
  submission_count_today, last_submission_at
)
SELECT
  s.form_id,
  s.submitted_by                                   AS enumerator_id,
  s.submitted_by                                   AS enumerator_name,
  (s.data->>'gps_lat')::NUMERIC                    AS latitude,
  (s.data->>'gps_lng')::NUMERIC                    AS longitude,
  COUNT(*) FILTER (WHERE s.submitted_at::date = CURRENT_DATE) AS submission_count_today,
  MAX(s.submitted_at)                              AS last_submission_at
FROM field_data_submissions s
WHERE s.submitted_by IS NOT NULL
  AND (s.data->>'gps_lat') IS NOT NULL
GROUP BY s.form_id, s.submitted_by
ON CONFLICT (form_id, enumerator_id) DO UPDATE SET
  submission_count_today = EXCLUDED.submission_count_today,
  latitude               = EXCLUDED.latitude,
  longitude              = EXCLUDED.longitude,
  last_submission_at     = EXCLUDED.last_submission_at,
  updated_at             = now();
*/

-- ─── 7. Update coverage zone actual counts ───────────────────────────────────
-- Run after sync if submissions have a locality/zone field.
-- Adjust data->>'locality_name' to match your actual XLSForm variable.
/*
UPDATE fd_coverage_zones cz
SET
  actual_count     = sub.cnt,
  last_activity_at = sub.last_at,
  status = CASE
    WHEN sub.cnt >= cz.target_count AND cz.target_count > 0 THEN 'complete'
    WHEN sub.cnt > 0 THEN 'in_progress'
    ELSE cz.status
  END,
  updated_at = now()
FROM (
  SELECT form_id, data->>'locality_name' AS zone_name, COUNT(*) AS cnt, MAX(submitted_at) AS last_at
  FROM field_data_submissions
  WHERE submitted_at::date = CURRENT_DATE
  GROUP BY form_id, data->>'locality_name'
) sub
WHERE cz.form_id = sub.form_id
  AND cz.zone_name = sub.zone_name;
*/

-- ============================================================================
-- Migration complete. Open /field-data/monitoring in the app.
-- ============================================================================

-- ============================================================================
-- PHASE 9: CASE MANAGEMENT
-- ============================================================================
-- ============================================================================
-- Field Data Hub — Phase 11: Case Management
-- Run in Supabase SQL Editor (safe to re-run: uses IF NOT EXISTS)
-- ============================================================================

-- ─── 1. Case Registry ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_cases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id          UUID,             -- REFERENCES field_data_forms(id) ON DELETE SET NULL
  case_ref         TEXT NOT NULL,    -- human-readable reference, e.g. CASE-00142
  case_type        TEXT,             -- Household / Health / Protection / Nutrition / etc.
  subject_name     TEXT,             -- name of individual/household/unit
  subject_id       TEXT,             -- unique ID from the linked form (e.g. HH-00142)
  assignee_name    TEXT,             -- responsible staff member name
  status           TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','active','follow_up','closed','rejected')),
  priority         TEXT NOT NULL DEFAULT 'medium'
                   CHECK (priority IN ('low','medium','high','urgent')),
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at        TIMESTAMPTZ,
  last_contact_at  TIMESTAMPTZ,
  metadata         JSONB NOT NULL DEFAULT '{}',  -- arbitrary key/value pairs from form
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fd_cases_form     ON fd_cases(form_id);
CREATE INDEX IF NOT EXISTS idx_fd_cases_status   ON fd_cases(status);
CREATE INDEX IF NOT EXISTS idx_fd_cases_subject  ON fd_cases(subject_id);
CREATE INDEX IF NOT EXISTS idx_fd_cases_ref      ON fd_cases(case_ref);

-- ─── 2. Case Visits ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_case_visits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          UUID NOT NULL REFERENCES fd_cases(id) ON DELETE CASCADE,
  scheduled_date   DATE NOT NULL,
  scheduled_time   TIME,
  enumerator_name  TEXT,
  location         TEXT,
  status           TEXT NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled','attempted','completed','not_found','refused','rescheduled')),
  outcome_notes    TEXT,
  rescheduled_to   DATE,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fd_visits_case   ON fd_case_visits(case_id);
CREATE INDEX IF NOT EXISTS idx_fd_visits_date   ON fd_case_visits(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_fd_visits_status ON fd_case_visits(status);

-- ─── 3. Case Notes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_case_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID NOT NULL REFERENCES fd_cases(id) ON DELETE CASCADE,
  note_text   TEXT NOT NULL,
  author_name TEXT,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fd_notes_case ON fd_case_notes(case_id);
CREATE INDEX IF NOT EXISTS idx_fd_notes_time ON fd_case_notes(created_at DESC);

-- ─── 4. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE fd_cases       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_case_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_case_notes  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "fd_cases_access"       ON fd_cases;
  DROP POLICY IF EXISTS "fd_case_visits_access" ON fd_case_visits;
  DROP POLICY IF EXISTS "fd_case_notes_access"  ON fd_case_notes;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "fd_cases_access" ON fd_cases FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin',
      'ict','fom','data_team','projectmanager','project_manager','countrydirector','country_director')));

CREATE POLICY "fd_case_visits_access" ON fd_case_visits FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin',
      'ict','fom','data_team','projectmanager','project_manager','countrydirector','country_director')));

CREATE POLICY "fd_case_notes_access" ON fd_case_notes FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin',
      'ict','fom','data_team','projectmanager','project_manager','countrydirector','country_director')));

NOTIFY pgrst, 'reload schema';

-- ─── 5. Auto-close visits on case close (optional trigger) ───────────────────
/*
CREATE OR REPLACE FUNCTION fd_case_close_cascade()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('closed','rejected') AND OLD.status NOT IN ('closed','rejected') THEN
    UPDATE fd_case_visits
    SET status = 'rescheduled', outcome_notes = 'Case closed — visit cancelled'
    WHERE case_id = NEW.id AND status = 'scheduled';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_fd_case_close
  AFTER UPDATE ON fd_cases
  FOR EACH ROW EXECUTE FUNCTION fd_case_close_cascade();
*/

-- ─── 6. Useful views ─────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW fd_case_summary AS
SELECT
  c.id,
  c.case_ref,
  c.case_type,
  c.subject_name,
  c.subject_id,
  c.status,
  c.priority,
  c.assignee_name,
  c.opened_at,
  c.closed_at,
  c.form_id,
  COUNT(DISTINCT v.id)                             AS visit_count,
  COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'completed') AS completed_visits,
  COUNT(DISTINCT n.id)                             AS note_count,
  MAX(n.created_at)                                AS last_note_at,
  MAX(v.scheduled_date)                            AS next_visit_date
FROM fd_cases c
LEFT JOIN fd_case_visits v ON v.case_id = c.id
LEFT JOIN fd_case_notes  n ON n.case_id = c.id
GROUP BY c.id;

-- ============================================================================
-- Migration complete. Open /field-data/cases in the app to get started.
-- ============================================================================

-- ============================================================================
-- PHASE 11: MULTI-ROUND STUDIES
-- ============================================================================
-- ============================================================================
-- Field Data Hub — Phase 8: Multi-Round Study Management
-- Run in Supabase SQL Editor (safe to re-run: uses IF NOT EXISTS / ALTER ... ADD COLUMN IF NOT EXISTS)
-- ============================================================================

-- ─── 1. Studies ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_studies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  description      TEXT,
  study_type       TEXT NOT NULL DEFAULT 'panel'
                   CHECK (study_type IN ('panel','repeated_cross_section','cohort','rct')),
  unique_id_field  TEXT,           -- e.g. 'household_id' — links records across rounds
  target_sample    INTEGER,        -- overall study sample target
  country_id       TEXT,
  project_id       UUID,           -- REFERENCES projects(id) ON DELETE SET NULL
  grant_id         UUID,
  start_date       DATE,
  end_date         DATE,
  status           TEXT NOT NULL DEFAULT 'design'
                   CHECK (status IN ('design','active','paused','complete','archived')),
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. Study Rounds ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_study_rounds (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id           UUID NOT NULL REFERENCES fd_studies(id) ON DELETE CASCADE,
  round_order        INTEGER NOT NULL DEFAULT 1,
  label              TEXT NOT NULL,   -- 'Baseline', 'Midline', 'Endline', 'Round 1', etc.
  form_id            UUID,            -- REFERENCES field_data_forms(id) ON DELETE SET NULL
  target_date        DATE,
  actual_start_date  DATE,
  actual_end_date    DATE,
  target_sample      INTEGER,
  submission_count   INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'planned'
                     CHECK (status IN ('planned','active','complete','paused')),
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fd_study_rounds_study ON fd_study_rounds(study_id);

-- ─── 3. Panel Unit Tracking ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_study_unit_tracking (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id          UUID NOT NULL REFERENCES fd_studies(id) ON DELETE CASCADE,
  unit_id           TEXT NOT NULL,   -- the unique ID value (e.g., 'HH-00142')
  unit_label        TEXT,            -- display name / description
  location_admin1   TEXT,
  location_admin2   TEXT,
  gps_lat           NUMERIC(9,6),
  gps_lng           NUMERIC(9,6),
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','dropped','replaced','refused','not_found')),
  dropout_reason    TEXT,
  dropout_round_id  UUID REFERENCES fd_study_rounds(id) ON DELETE SET NULL,
  replacement_for   UUID REFERENCES fd_study_unit_tracking(id) ON DELETE SET NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(study_id, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_fd_study_units_study ON fd_study_unit_tracking(study_id);

-- ─── 4. Round Submissions (links units to rounds) ────────────────────────────
CREATE TABLE IF NOT EXISTS fd_study_round_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id      UUID NOT NULL REFERENCES fd_studies(id) ON DELETE CASCADE,
  round_id      UUID NOT NULL REFERENCES fd_study_rounds(id) ON DELETE CASCADE,
  unit_id       TEXT NOT NULL,
  submission_id UUID,              -- REFERENCES field_data_submissions(id) ON DELETE SET NULL
  submitted_at  TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'submitted'
                CHECK (status IN ('submitted','approved','rejected','pending')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_id, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_fd_round_subs_round   ON fd_study_round_submissions(round_id);
CREATE INDEX IF NOT EXISTS idx_fd_round_subs_study   ON fd_study_round_submissions(study_id);
CREATE INDEX IF NOT EXISTS idx_fd_round_subs_unit    ON fd_study_round_submissions(study_id, unit_id);

-- ─── 5. updated_at triggers ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_fd_study_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$ BEGIN
  CREATE TRIGGER trg_fd_studies_updated_at
    BEFORE UPDATE ON fd_studies FOR EACH ROW EXECUTE FUNCTION update_fd_study_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_fd_study_rounds_updated_at
    BEFORE UPDATE ON fd_study_rounds FOR EACH ROW EXECUTE FUNCTION update_fd_study_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_fd_study_units_updated_at
    BEFORE UPDATE ON fd_study_unit_tracking FOR EACH ROW EXECUTE FUNCTION update_fd_study_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 6. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE fd_studies               ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_study_rounds          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_study_unit_tracking   ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_study_round_submissions ENABLE ROW LEVEL SECURITY;

-- Finance / Admin / ICT / FOM / Data Team / Project Manager / Country Director
-- Access model: same as Field Data Hub (any non-field-staff role can access)
DO $$ BEGIN
  DROP POLICY IF EXISTS "fd_studies_access"        ON fd_studies;
  DROP POLICY IF EXISTS "fd_rounds_access"         ON fd_study_rounds;
  DROP POLICY IF EXISTS "fd_units_access"          ON fd_study_unit_tracking;
  DROP POLICY IF EXISTS "fd_round_subs_access"     ON fd_study_round_submissions;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "fd_studies_access" ON fd_studies FOR ALL
  USING ( EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND LOWER(role) IN (
        'super_admin','superadmin','admin','financialadmin','financial_admin',
        'ict','fom','data_team','projectmanager','project_manager',
        'countrydirector','country_director'
      )
  ));

CREATE POLICY "fd_rounds_access" ON fd_study_rounds FOR ALL
  USING ( EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND LOWER(role) IN (
        'super_admin','superadmin','admin','financialadmin','financial_admin',
        'ict','fom','data_team','projectmanager','project_manager',
        'countrydirector','country_director'
      )
  ));

CREATE POLICY "fd_units_access" ON fd_study_unit_tracking FOR ALL
  USING ( EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND LOWER(role) IN (
        'super_admin','superadmin','admin','financialadmin','financial_admin',
        'ict','fom','data_team','projectmanager','project_manager',
        'countrydirector','country_director'
      )
  ));

CREATE POLICY "fd_round_subs_access" ON fd_study_round_submissions FOR ALL
  USING ( EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND LOWER(role) IN (
        'super_admin','superadmin','admin','financialadmin','financial_admin',
        'ict','fom','data_team','projectmanager','project_manager',
        'countrydirector','country_director'
      )
  ));

NOTIFY pgrst, 'reload schema';
-- ============================================================================
-- Migration complete. Open /field-data/studies in the app to get started.
-- ============================================================================

-- ============================================================================
-- PHASE 12: WORKFLOW & REVIEW
-- ============================================================================
-- ============================================================================
-- Field Data Hub — Phase 12: Workflow & Review
-- Run in Supabase SQL Editor (safe to re-run: uses IF NOT EXISTS)
-- ============================================================================

-- ─── 1. Submission Reviews ────────────────────────────────────────────────────
-- One record per submission entering a review pipeline.
CREATE TABLE IF NOT EXISTS fd_submission_reviews (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id          UUID NOT NULL,         -- REFERENCES field_data_forms(id) ON DELETE CASCADE
  submission_id    UUID,                  -- REFERENCES field_data_submissions(id) ON DELETE SET NULL
  submission_ref   TEXT,                  -- human-readable ref (UUID text, sequence #, etc.)
  submitter_name   TEXT,
  stage            TEXT NOT NULL DEFAULT 'Data Review',
                   -- e.g. 'Data Review', 'Field Supervisor', 'M&E Officer', 'Director Sign-off'
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN (
                     'pending','under_review','approved','rejected',
                     'correction_requested','resubmitted'
                   )),
  reviewer_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_name    TEXT,
  notes            TEXT,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at      TIMESTAMPTZ,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fd_reviews_form     ON fd_submission_reviews(form_id);
CREATE INDEX IF NOT EXISTS idx_fd_reviews_status   ON fd_submission_reviews(status);
CREATE INDEX IF NOT EXISTS idx_fd_reviews_reviewer ON fd_submission_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_fd_reviews_sub      ON fd_submission_reviews(submission_id);

-- ─── 2. Review Actions (audit trail) ─────────────────────────────────────────
-- Every approve / reject / correction-request / sign / comment is recorded here.
CREATE TABLE IF NOT EXISTS fd_review_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id       UUID NOT NULL REFERENCES fd_submission_reviews(id) ON DELETE CASCADE,
  action_type     TEXT NOT NULL
                  CHECK (action_type IN (
                    'approve','reject','request_correction','sign','comment','resubmit'
                  )),
  actor_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name      TEXT,
  notes           TEXT,
  signature_text  TEXT,     -- free-text attestation for 'sign' actions
  performed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fd_actions_review ON fd_review_actions(review_id);
CREATE INDEX IF NOT EXISTS idx_fd_actions_type   ON fd_review_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_fd_actions_time   ON fd_review_actions(performed_at DESC);

-- ─── 3. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE fd_submission_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_review_actions     ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "fd_reviews_access" ON fd_submission_reviews;
  DROP POLICY IF EXISTS "fd_review_actions_access" ON fd_review_actions;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Reviewers and finance/admin/data team can see and act on reviews
CREATE POLICY "fd_reviews_access" ON fd_submission_reviews FOR ALL
  USING (
    reviewer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND LOWER(role) IN (
        'super_admin','superadmin','admin','financialadmin','financial_admin',
        'ict','fom','data_team','projectmanager','project_manager',
        'countrydirector','country_director'
      )
    )
  );

-- Action audit log: reviewer + admins can read; only reviewer/admin can insert
CREATE POLICY "fd_review_actions_access" ON fd_review_actions FOR ALL
  USING (
    actor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND LOWER(role) IN (
        'super_admin','superadmin','admin','financialadmin','financial_admin',
        'ict','fom','data_team','projectmanager','project_manager',
        'countrydirector','country_director'
      )
    )
  );

NOTIFY pgrst, 'reload schema';

-- ─── 4. Bulk-import existing submissions into review queue ────────────────────
-- Run this to push all un-reviewed submissions from a specific form into the queue.
-- Adjust status filter and form_id as needed.
/*
INSERT INTO fd_submission_reviews (form_id, submission_id, submission_ref, status, submitted_at)
SELECT
  s.form_id,
  s.id,
  s.id::TEXT,
  'pending',
  COALESCE(s.submitted_at, s.created_at)
FROM field_data_submissions s
WHERE s.form_id = '<your-form-id>'
  AND NOT EXISTS (
    SELECT 1 FROM fd_submission_reviews r WHERE r.submission_id = s.id
  )
ON CONFLICT DO NOTHING;
*/

-- ─── 5. Useful stats view ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW fd_review_stats AS
SELECT
  form_id,
  COUNT(*)                                              AS total,
  COUNT(*) FILTER (WHERE status = 'pending')            AS pending,
  COUNT(*) FILTER (WHERE status = 'under_review')       AS under_review,
  COUNT(*) FILTER (WHERE status = 'approved')           AS approved,
  COUNT(*) FILTER (WHERE status = 'rejected')           AS rejected,
  COUNT(*) FILTER (WHERE status = 'correction_requested') AS correction_requested,
  COUNT(*) FILTER (WHERE status = 'resubmitted')        AS resubmitted
FROM fd_submission_reviews
GROUP BY form_id;

-- ============================================================================
-- Migration complete. Open /field-data/workflow in the app.
-- ============================================================================

-- ============================================================================
-- PHASE 13: DATA QUALITY & ENCRYPTED FORMS
-- ============================================================================
-- ============================================================================
-- Field Data Hub — Phase 9: Data Quality, Enumerator Scoring & Target Tracking
-- Run in Supabase SQL Editor (safe to re-run: uses IF NOT EXISTS)
-- ============================================================================

-- ─── 1. Quality Rules ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_quality_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id     UUID NOT NULL,       -- REFERENCES field_data_forms(id) ON DELETE CASCADE
  name        TEXT NOT NULL,
  rule_type   TEXT NOT NULL
              CHECK (rule_type IN (
                'required_field','value_range','regex',
                'gps_bounds','duration_range','no_duplicate'
              )),
  field_name  TEXT,                -- XLSForm variable name this rule applies to
  config      JSONB NOT NULL DEFAULT '{}',
              -- required_field:  {}
              -- value_range:     { "min": 0, "max": 100 }
              -- regex:           { "pattern": "^HH-\\d{5}$" }
              -- gps_bounds:      { "lat_min": 10.0, "lat_max": 23.0, "lng_min": 22.0, "lng_max": 38.0 }
              -- duration_range:  { "min": 120, "max": 7200 }  (seconds)
              -- no_duplicate:    {}
  severity    TEXT NOT NULL DEFAULT 'warning'
              CHECK (severity IN ('error','warning','info')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guard: add is_active if the table already existed without it
ALTER TABLE fd_quality_rules ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_fd_quality_rules_form ON fd_quality_rules(form_id);

-- ─── 2. Quality Flags ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_quality_flags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id         UUID NOT NULL,       -- REFERENCES field_data_forms(id) ON DELETE CASCADE
  submission_id   UUID,                -- REFERENCES field_data_submissions(id) ON DELETE CASCADE
  rule_id         UUID REFERENCES fd_quality_rules(id) ON DELETE CASCADE,
  field_name      TEXT,
  actual_value    TEXT,
  expected        TEXT,                -- human-readable description of what was expected
  severity        TEXT NOT NULL DEFAULT 'warning'
                  CHECK (severity IN ('error','warning','info')),
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','resolved','dismissed','false_positive')),
  resolved_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fd_quality_flags_form       ON fd_quality_flags(form_id);
CREATE INDEX IF NOT EXISTS idx_fd_quality_flags_submission ON fd_quality_flags(submission_id);
CREATE INDEX IF NOT EXISTS idx_fd_quality_flags_status     ON fd_quality_flags(status);

-- ─── 3. Enumerator Performance Stats ─────────────────────────────────────────
-- Denormalized; populated by a background job or manual SQL after each sync.
CREATE TABLE IF NOT EXISTS fd_enumerator_stats (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id               UUID NOT NULL,   -- REFERENCES field_data_forms(id) ON DELETE CASCADE
  enumerator_id         TEXT NOT NULL,   -- username / user_id from submission metadata
  enumerator_name       TEXT,
  submission_count      INTEGER NOT NULL DEFAULT 0,
  avg_duration_seconds  INTEGER,         -- average survey completion time
  flag_count            INTEGER NOT NULL DEFAULT 0,
  flag_rate             NUMERIC(5,2),    -- flag_count / submission_count * 100
  gps_accuracy_avg      NUMERIC(8,2),    -- average GPS accuracy in metres
  missing_field_rate    NUMERIC(5,2),    -- % of required fields left blank
  score                 INTEGER,         -- 0–100 composite quality score
  score_label           TEXT             -- 'excellent' | 'good' | 'needs_review' | 'poor'
                        CHECK (score_label IN ('excellent','good','needs_review','poor')),
  last_submission_at    TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(form_id, enumerator_id)
);

CREATE INDEX IF NOT EXISTS idx_fd_enum_stats_form ON fd_enumerator_stats(form_id);

-- Helper: compute score label from score
CREATE OR REPLACE FUNCTION fd_score_label(score INTEGER)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN score >= 80 THEN 'excellent'
    WHEN score >= 60 THEN 'good'
    WHEN score >= 40 THEN 'needs_review'
    ELSE 'poor'
  END;
$$;

-- ─── 4. Form Targets ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_form_targets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id           UUID NOT NULL,   -- REFERENCES field_data_forms(id) ON DELETE CASCADE
  target_count      INTEGER NOT NULL CHECK (target_count > 0),
  target_date       DATE,
  geographic_scope  TEXT NOT NULL DEFAULT 'All',
  notes             TEXT,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(form_id, geographic_scope)
);

CREATE INDEX IF NOT EXISTS idx_fd_form_targets_form ON fd_form_targets(form_id);

-- ─── 5. updated_at trigger for enumerator stats ───────────────────────────────
CREATE OR REPLACE FUNCTION update_fd_enumerator_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$ BEGIN
  CREATE TRIGGER trg_fd_enum_stats_updated_at
    BEFORE UPDATE ON fd_enumerator_stats
    FOR EACH ROW EXECUTE FUNCTION update_fd_enumerator_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 6. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE fd_quality_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_quality_flags     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_enumerator_stats  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_form_targets      ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "fd_quality_rules_access"    ON fd_quality_rules;
  DROP POLICY IF EXISTS "fd_quality_flags_access"    ON fd_quality_flags;
  DROP POLICY IF EXISTS "fd_enum_stats_access"       ON fd_enumerator_stats;
  DROP POLICY IF EXISTS "fd_form_targets_access"     ON fd_form_targets;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Same access model as the rest of Field Data Hub
CREATE POLICY "fd_quality_rules_access" ON fd_quality_rules FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin',
      'ict','fom','data_team','projectmanager','project_manager','countrydirector','country_director')));

CREATE POLICY "fd_quality_flags_access" ON fd_quality_flags FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin',
      'ict','fom','data_team','projectmanager','project_manager','countrydirector','country_director')));

CREATE POLICY "fd_enum_stats_access" ON fd_enumerator_stats FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin',
      'ict','fom','data_team','projectmanager','project_manager','countrydirector','country_director')));

CREATE POLICY "fd_form_targets_access" ON fd_form_targets FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin',
      'ict','fom','data_team','projectmanager','project_manager','countrydirector','country_director')));

NOTIFY pgrst, 'reload schema';

-- ─── 7. Sample: compute enumerator stats from existing submissions ─────────────
-- Run this SQL snippet after syncing submissions to populate fd_enumerator_stats.
-- Adjust the submitted_by / duration_seconds column names to match your form data.
/*
INSERT INTO fd_enumerator_stats (form_id, enumerator_id, enumerator_name,
  submission_count, flag_count, flag_rate, score, score_label, last_submission_at)
SELECT
  s.form_id,
  s.submitted_by                            AS enumerator_id,
  s.submitted_by                            AS enumerator_name,
  COUNT(*)                                  AS submission_count,
  COALESCE(f.flag_count, 0)                 AS flag_count,
  ROUND(COALESCE(f.flag_count, 0)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) AS flag_rate,
  GREATEST(0, 100 - ROUND(COALESCE(f.flag_count, 0)::NUMERIC / NULLIF(COUNT(*), 0) * 100)) AS score,
  fd_score_label(GREATEST(0, 100 - ROUND(COALESCE(f.flag_count, 0)::NUMERIC / NULLIF(COUNT(*), 0) * 100))::INTEGER) AS score_label,
  MAX(s.submitted_at)                       AS last_submission_at
FROM field_data_submissions s
LEFT JOIN (
  SELECT form_id, submission_id::TEXT AS enumerator_proxy, COUNT(*) AS flag_count
  -- Note: join flags to submissions by submission_id
  FROM fd_quality_flags WHERE status = 'open' GROUP BY form_id, submission_id
) f ON f.form_id = s.form_id
WHERE s.submitted_by IS NOT NULL
GROUP BY s.form_id, s.submitted_by, f.flag_count
ON CONFLICT (form_id, enumerator_id) DO UPDATE SET
  submission_count   = EXCLUDED.submission_count,
  flag_count         = EXCLUDED.flag_count,
  flag_rate          = EXCLUDED.flag_rate,
  score              = EXCLUDED.score,
  score_label        = EXCLUDED.score_label,
  last_submission_at = EXCLUDED.last_submission_at,
  updated_at         = now();
*/

-- ============================================================================
-- Migration complete. Open /field-data/quality in the app to get started.
-- ============================================================================

-- ============================================================================
-- PHASE 14: MULTI-LANGUAGE FORMS
-- ============================================================================
-- ============================================================================
-- Phase 14: Multi-Language Form Management
-- fd_form_translations + fd_region_lang_defaults
-- Run in Supabase SQL Editor (safe to re-run: IF NOT EXISTS / OR REPLACE guards)
-- ============================================================================

-- ── fd_form_translations ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fd_form_translations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id          UUID REFERENCES fd_forms(id) ON DELETE CASCADE,
  form_name        TEXT NOT NULL DEFAULT '',
  lang_code        TEXT NOT NULL,                -- e.g. 'ar', 'fr', 'so'
  field_key        TEXT NOT NULL,                -- e.g. 'q1_label', 'q2_hint', 'form_title'
  source_text      TEXT NOT NULL DEFAULT '',     -- English (source) text
  translated_text  TEXT,                         -- NULL = not yet translated
  is_ai_generated  BOOLEAN NOT NULL DEFAULT FALSE,
  ai_reviewed      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (form_id, lang_code, field_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fd_form_translations_form_lang ON fd_form_translations(form_id, lang_code);
CREATE INDEX IF NOT EXISTS idx_fd_form_translations_missing
  ON fd_form_translations(form_id, lang_code)
  WHERE translated_text IS NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_fd_translation_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_fd_translation_updated_at ON fd_form_translations;
CREATE TRIGGER trg_fd_translation_updated_at
  BEFORE UPDATE ON fd_form_translations
  FOR EACH ROW EXECUTE FUNCTION set_fd_translation_updated_at();

-- ── fd_region_lang_defaults ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fd_region_lang_defaults (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country    TEXT NOT NULL UNIQUE,
  lang_code  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_fd_region_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_fd_region_updated_at ON fd_region_lang_defaults;
CREATE TRIGGER trg_fd_region_updated_at
  BEFORE UPDATE ON fd_region_lang_defaults
  FOR EACH ROW EXECUTE FUNCTION set_fd_region_updated_at();

-- Seed common region defaults (safe to re-run)
INSERT INTO fd_region_lang_defaults (country, lang_code) VALUES
  ('Sudan',       'ar'),
  ('South Sudan', 'en'),
  ('Chad',        'fr'),
  ('Ethiopia',    'am'),
  ('Somalia',     'so'),
  ('Kenya',       'sw'),
  ('Nigeria',     'ha'),
  ('Egypt',       'ar'),
  ('Libya',       'ar'),
  ('Eritrea',     'ti')
ON CONFLICT (country) DO NOTHING;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE fd_form_translations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_region_lang_defaults ENABLE ROW LEVEL SECURITY;

-- Translations: readable by all field-data users; editable by data team / admin
DROP POLICY IF EXISTS "fd_translations_select"  ON fd_form_translations;
DROP POLICY IF EXISTS "fd_translations_insert"  ON fd_form_translations;
DROP POLICY IF EXISTS "fd_translations_update"  ON fd_form_translations;
DROP POLICY IF EXISTS "fd_translations_delete"  ON fd_form_translations;

CREATE POLICY "fd_translations_select" ON fd_form_translations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'ict', 'data_team', 'fom', 'project_manager', 'country_director')
    )
  );

CREATE POLICY "fd_translations_insert" ON fd_form_translations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'ict', 'data_team', 'fom')
    )
  );

CREATE POLICY "fd_translations_update" ON fd_form_translations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'ict', 'data_team', 'fom')
    )
  );

CREATE POLICY "fd_translations_delete" ON fd_form_translations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'ict')
    )
  );

-- Region defaults: readable by all; writable by admin
DROP POLICY IF EXISTS "fd_region_select"  ON fd_region_lang_defaults;
DROP POLICY IF EXISTS "fd_region_write"   ON fd_region_lang_defaults;

CREATE POLICY "fd_region_select" ON fd_region_lang_defaults
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "fd_region_write" ON fd_region_lang_defaults
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'ict', 'data_team', 'fom')
    )
  );

-- ── get_translation_summary view ────────────────────────────────────────────
-- Used by Overview tab to show completion % per form × language

CREATE OR REPLACE VIEW fd_translation_summary AS
SELECT
  form_id,
  form_name,
  lang_code,
  COUNT(*)                                          AS total_fields,
  COUNT(*) FILTER (WHERE translated_text IS NOT NULL) AS translated_fields,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE translated_text IS NOT NULL) / NULLIF(COUNT(*), 0),
    0
  )                                                 AS completion_pct,
  COUNT(*) FILTER (WHERE is_ai_generated AND NOT ai_reviewed) AS pending_ai_review
FROM fd_form_translations
GROUP BY form_id, form_name, lang_code;

GRANT SELECT ON fd_translation_summary TO authenticated;

-- ── Helper: seed form question keys from fd_form_schema ─────────────────────
-- Call this after uploading an XLSForm to populate translation rows.
-- Usage: SELECT seed_form_translation_keys('<form_id>', 'ar');
-- (Requires fd_form_schema table with columns: form_id, field_key, label_en)

CREATE OR REPLACE FUNCTION seed_form_translation_keys(
  p_form_id   UUID,
  p_lang_code TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER := 0;
  v_form_name TEXT;
BEGIN
  SELECT name INTO v_form_name FROM fd_forms WHERE id = p_form_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Form % not found', p_form_id; END IF;

  -- Only works if fd_form_schema exists; silently returns 0 if it doesn't.
  BEGIN
    INSERT INTO fd_form_translations (form_id, form_name, lang_code, field_key, source_text)
    SELECT p_form_id, v_form_name, p_lang_code, field_key, COALESCE(label_en, field_key)
    FROM fd_form_schema
    WHERE form_id = p_form_id
    ON CONFLICT (form_id, lang_code, field_key) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN
    NULL; -- fd_form_schema not yet created; skip silently
  END;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION seed_form_translation_keys(UUID, TEXT) TO authenticated;

-- ============================================================================
-- Notes:
--  • To bulk-import source texts from an XLSForm: upload to fd_form_schema
--    then call SELECT seed_form_translation_keys('<form_id>', 'ar');
--  • The translate-form Edge Function uses GOOGLE_AI_API_KEY (Gemini 2.0 Flash).
--  • AI-generated translations have is_ai_generated=TRUE, ai_reviewed=FALSE
--    until a user approves them in the AI Assistant tab.
-- ============================================================================

-- ============================================================================
-- PHASE 15: COLLABORATION & REVIEW
-- ============================================================================
-- ============================================================================
-- Field Data Hub — Phase 15: Collaboration & Review Tools
-- Tables: fd_submission_comments, fd_submission_flags, fd_form_review_comments
-- ============================================================================

-- ── 1. Submission comment threads ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_submission_comments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID        NOT NULL,   -- references fd_submissions(id)
  form_id         UUID        NOT NULL,   -- denormalized for quick filtering
  parent_id       UUID        REFERENCES fd_submission_comments(id) ON DELETE CASCADE,
  body            TEXT        NOT NULL,
  author_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name     TEXT        NOT NULL DEFAULT '',
  is_resolved     BOOLEAN     NOT NULL DEFAULT false,
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdsc_submission  ON fd_submission_comments(submission_id);
CREATE INDEX IF NOT EXISTS idx_fdsc_form        ON fd_submission_comments(form_id);
CREATE INDEX IF NOT EXISTS idx_fdsc_parent      ON fd_submission_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_fdsc_author      ON fd_submission_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_fdsc_resolved    ON fd_submission_comments(is_resolved);

-- ── 2. Submission flags ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_submission_flags (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID        NOT NULL,
  form_id         UUID        NOT NULL,
  flag_type       TEXT        NOT NULL
                  CHECK (flag_type IN ('suspicious','needs_correction','priority','interesting')),
  flagged_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  flagged_by_name TEXT        NOT NULL DEFAULT '',
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdsf_submission  ON fd_submission_flags(submission_id);
CREATE INDEX IF NOT EXISTS idx_fdsf_form        ON fd_submission_flags(form_id);
CREATE INDEX IF NOT EXISTS idx_fdsf_type        ON fd_submission_flags(flag_type);

-- Prevent exact duplicate flags (same submission + same flag type from same user)
CREATE UNIQUE INDEX IF NOT EXISTS idx_fdsf_unique
  ON fd_submission_flags(submission_id, flag_type, flagged_by)
  WHERE flagged_by IS NOT NULL;

-- ── 3. Form draft review comments ────────────────────────────────────────────
-- Inline comments reviewers leave on specific form fields before publishing.
CREATE TABLE IF NOT EXISTS fd_form_review_comments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id         UUID        NOT NULL,
  field_key       TEXT        NOT NULL DEFAULT '',   -- empty = general/form-level comment
  body            TEXT        NOT NULL,
  reviewer_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_name   TEXT        NOT NULL DEFAULT '',
  is_resolved     BOOLEAN     NOT NULL DEFAULT false,
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  form_version    INTEGER,    -- snapshot of form version when comment was written
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdfrc_form       ON fd_form_review_comments(form_id);
CREATE INDEX IF NOT EXISTS idx_fdfrc_field      ON fd_form_review_comments(form_id, field_key);
CREATE INDEX IF NOT EXISTS idx_fdfrc_resolved   ON fd_form_review_comments(is_resolved);
CREATE INDEX IF NOT EXISTS idx_fdfrc_reviewer   ON fd_form_review_comments(reviewer_id);

-- ── 4. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE fd_submission_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_submission_flags     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_form_review_comments ENABLE ROW LEVEL SECURITY;

-- Roles with FDH access
-- (mirrors fd_forms / fd_submissions RLS pattern)
CREATE POLICY "fdsc_read"  ON fd_submission_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','ict','fom','data_team','coordinator','supervisor','project_manager','country_director')
    )
  );

CREATE POLICY "fdsc_insert" ON fd_submission_comments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','ict','fom','data_team','coordinator','supervisor','project_manager','country_director')
    )
  );

CREATE POLICY "fdsc_update" ON fd_submission_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','fom','data_team')
    )
  );

-- Flags
CREATE POLICY "fdsf_read"  ON fd_submission_flags FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','ict','fom','data_team','coordinator','supervisor','project_manager','country_director')
    )
  );

CREATE POLICY "fdsf_insert" ON fd_submission_flags FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','ict','fom','data_team','coordinator','supervisor','project_manager','country_director')
    )
  );

CREATE POLICY "fdsf_delete" ON fd_submission_flags FOR DELETE TO authenticated
  USING (
    flagged_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','fom','data_team')
    )
  );

-- Form review comments
CREATE POLICY "fdfrc_read"  ON fd_form_review_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','ict','fom','data_team','coordinator','supervisor','project_manager','country_director')
    )
  );

CREATE POLICY "fdfrc_insert" ON fd_form_review_comments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','ict','fom','data_team','coordinator','supervisor','project_manager','country_director')
    )
  );

CREATE POLICY "fdfrc_update" ON fd_form_review_comments FOR UPDATE TO authenticated
  USING (
    reviewer_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','fom','data_team')
    )
  );

-- ── 5. updated_at trigger (shared helper function assumed present) ─────────────
CREATE OR REPLACE FUNCTION fd_collab_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_fdsc_updated_at
  BEFORE UPDATE ON fd_submission_comments
  FOR EACH ROW EXECUTE FUNCTION fd_collab_set_updated_at();

CREATE OR REPLACE TRIGGER trg_fdfrc_updated_at
  BEFORE UPDATE ON fd_form_review_comments
  FOR EACH ROW EXECUTE FUNCTION fd_collab_set_updated_at();

-- ── 6. Helpful view: open review comment counts per form ──────────────────────
CREATE OR REPLACE VIEW fd_form_review_summary AS
SELECT
  form_id,
  COUNT(*)                                          AS total_comments,
  COUNT(*) FILTER (WHERE NOT is_resolved)           AS open_comments,
  COUNT(*) FILTER (WHERE is_resolved)               AS resolved_comments,
  COUNT(DISTINCT field_key)                         AS fields_with_comments,
  MAX(created_at)                                   AS last_comment_at
FROM fd_form_review_comments
GROUP BY form_id;

-- ============================================================================
-- Phase 15 migration complete.
-- Run this SQL in the Supabase SQL Editor.
-- Tables: fd_submission_comments, fd_submission_flags, fd_form_review_comments
-- View:   fd_form_review_summary
-- ============================================================================

-- ============================================================================
-- PHASE 16: BACKUP & DISASTER RECOVERY
-- ============================================================================
-- ============================================================================
-- Field Data Hub — Phase 16: Backup & Disaster Recovery
-- Tables: fd_backups, fd_backup_schedules, fd_restore_logs, fd_archive_logs
-- Storage buckets: field-data-backups, field-data-archives
-- ============================================================================

-- ── 1. Backup records ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_backups (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id           UUID        NOT NULL,
  backup_type       TEXT        NOT NULL DEFAULT 'auto'
                    CHECK (backup_type IN ('auto','manual')),
  status            TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','success','failed')),
  submission_count  INTEGER,
  file_size_bytes   BIGINT,
  storage_path      TEXT,                   -- path inside field-data-backups bucket
  external_provider TEXT,                   -- google_drive | dropbox | s3 | azure_blob
  external_url      TEXT,                   -- URL / path on external storage
  error_message     TEXT,
  triggered_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  triggered_by_name TEXT        NOT NULL DEFAULT '',
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdb_form        ON fd_backups(form_id);
CREATE INDEX IF NOT EXISTS idx_fdb_status      ON fd_backups(status);
CREATE INDEX IF NOT EXISTS idx_fdb_created     ON fd_backups(created_at DESC);

-- ── 2. Backup schedules ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_backup_schedules (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id           UUID        NOT NULL UNIQUE,
  enabled           BOOLEAN     NOT NULL DEFAULT true,
  cron_expression   TEXT        NOT NULL DEFAULT '0 2 * * *',  -- daily at 02:00 UTC
  retention_days    INTEGER     NOT NULL DEFAULT 30,
  external_provider TEXT        CHECK (external_provider IN ('google_drive','dropbox','s3','azure_blob')),
  external_bucket   TEXT,
  external_path     TEXT,
  updated_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdbsched_form ON fd_backup_schedules(form_id);

-- ── 3. Restore logs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_restore_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id           UUID        NOT NULL,
  backup_id         UUID        REFERENCES fd_backups(id) ON DELETE SET NULL,
  restore_mode      TEXT        NOT NULL DEFAULT 'merge'
                    CHECK (restore_mode IN ('merge','replace')),
  status            TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','success','failed')),
  rows_restored     INTEGER,
  rows_deleted      INTEGER,
  error_message     TEXT,
  initiated_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  initiated_by_name TEXT        NOT NULL DEFAULT '',
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdrl_form      ON fd_restore_logs(form_id);
CREATE INDEX IF NOT EXISTS idx_fdrl_backup    ON fd_restore_logs(backup_id);
CREATE INDEX IF NOT EXISTS idx_fdrl_created   ON fd_restore_logs(created_at DESC);

-- ── 4. PACT archive log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_archive_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id           UUID        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','success','failed')),
  storage_path      TEXT,                   -- path inside field-data-archives bucket
  file_size_bytes   BIGINT,
  submission_count  INTEGER,
  include_media     BOOLEAN     NOT NULL DEFAULT true,
  include_exports   BOOLEAN     NOT NULL DEFAULT true,
  include_charts    BOOLEAN     NOT NULL DEFAULT false,
  error_message     TEXT,
  generated_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_by_name TEXT        NOT NULL DEFAULT '',
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdal_form     ON fd_archive_logs(form_id);
CREATE INDEX IF NOT EXISTS idx_fdal_created  ON fd_archive_logs(created_at DESC);

-- ── 5. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE fd_backups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_backup_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_restore_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_archive_logs     ENABLE ROW LEVEL SECURITY;

-- FDH roles: super_admin, admin, ict, fom, data_team, project_manager, country_director
-- Backups: all FDH roles can read; only admins/data_team/ict can write
CREATE POLICY "fdb_read" ON fd_backups FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','admin','ict','fom','data_team','project_manager','country_director')
  ));
CREATE POLICY "fdb_insert" ON fd_backups FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','admin','ict','fom','data_team')
  ));
CREATE POLICY "fdb_update" ON fd_backups FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','admin','ict','data_team')
  ));

-- Schedules
CREATE POLICY "fdbs_read" ON fd_backup_schedules FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','admin','ict','fom','data_team','project_manager','country_director')
  ));
CREATE POLICY "fdbs_write" ON fd_backup_schedules FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','admin','ict','data_team')
  ));

-- Restore logs
CREATE POLICY "fdrl_read" ON fd_restore_logs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','admin','ict','fom','data_team','project_manager','country_director')
  ));
CREATE POLICY "fdrl_insert" ON fd_restore_logs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','admin','ict','data_team')
  ));

-- Archive logs
CREATE POLICY "fdal_read" ON fd_archive_logs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','admin','ict','fom','data_team','project_manager','country_director')
  ));
CREATE POLICY "fdal_write" ON fd_archive_logs FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','admin','ict','data_team')
  ));

-- ── 6. Service role policies (for Edge Functions / pg_cron) ──────────────────
CREATE POLICY "fdb_service"  ON fd_backups          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "fdbs_service" ON fd_backup_schedules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "fdrl_service" ON fd_restore_logs     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "fdal_service" ON fd_archive_logs     FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 7. Updated_at triggers ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fd_backup_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE TRIGGER trg_fdbsched_updated
  BEFORE UPDATE ON fd_backup_schedules
  FOR EACH ROW EXECUTE FUNCTION fd_backup_set_updated_at();

-- ── 8. Storage bucket setup (run in Supabase Dashboard or via API) ────────────
-- Create buckets manually or via Supabase CLI:
--
--   supabase storage buckets create field-data-backups  --public false
--   supabase storage buckets create field-data-archives --public false
--
-- Lifecycle rules (optional — set in Dashboard > Storage > Bucket > Lifecycle):
--   field-data-backups:  expire objects after 90 days
--   field-data-archives: no auto-expiry (permanent)
--
-- Storage RLS (applied in Supabase Dashboard > Storage > Policies):
--   field-data-backups:
--     SELECT: authenticated users with FDH roles
--     INSERT/UPDATE/DELETE: service_role only (Edge Functions)
--   field-data-archives:
--     SELECT: authenticated users with FDH roles
--     INSERT/UPDATE/DELETE: service_role only

-- ── 9. pg_cron daily backup scheduler (optional) ─────────────────────────────
-- Schedule via Supabase pg_cron or Edge Function cron:
--
--   SELECT cron.schedule(
--     'fd-daily-backup',
--     '0 2 * * *',
--     $$SELECT net.http_post(
--       url := 'https://<project>.supabase.co/functions/v1/run-fd-backup',
--       headers := '{"Authorization": "Bearer <service_role_key>"}'::JSONB,
--       body := '{}'::JSONB
--     )$$
--   );

-- ============================================================================
-- Phase 16 migration complete.
-- Tables: fd_backups, fd_backup_schedules, fd_restore_logs, fd_archive_logs
-- Next: Create Supabase Storage buckets (field-data-backups, field-data-archives)
-- ============================================================================

-- ============================================================================
-- PHASE 17: API & INTEGRATIONS
-- ============================================================================
-- ============================================================================
-- Field Data Hub — Phase 17: API & Integrations
-- Tables: fd_api_keys, fd_api_usage_logs, fd_webhook_secrets
-- ============================================================================

-- ── 1. API Keys ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_api_keys (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  key_hash      TEXT        NOT NULL UNIQUE,    -- SHA-256 of the raw key
  key_prefix    TEXT        NOT NULL,            -- first 12 chars for display
  key_scope     TEXT        NOT NULL DEFAULT 'global'
                CHECK (key_scope IN ('global','form')),
  form_id       UUID,                            -- non-null when key_scope='form'
  access_level  TEXT        NOT NULL DEFAULT 'read'
                CHECK (access_level IN ('read','read_write')),
  ip_whitelist  TEXT[]      NOT NULL DEFAULT '{}',
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  last_used_at  TIMESTAMPTZ,
  usage_count   BIGINT      NOT NULL DEFAULT 0,
  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guard: add is_active if the table already existed without it
ALTER TABLE fd_api_keys ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_fdak_form      ON fd_api_keys(form_id);
CREATE INDEX IF NOT EXISTS idx_fdak_active    ON fd_api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_fdak_hash      ON fd_api_keys(key_hash);

-- ── 2. API Usage Logs ─────────────────────────────────────────────────────────
-- Populated by the fd-api Edge Function on every request.
CREATE TABLE IF NOT EXISTS fd_api_usage_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id    UUID        REFERENCES fd_api_keys(id) ON DELETE SET NULL,
  method        TEXT        NOT NULL,
  path          TEXT        NOT NULL,
  query_params  JSONB,
  status_code   INTEGER     NOT NULL,
  response_ms   INTEGER,
  ip_address    TEXT,
  user_agent    TEXT,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdul_key       ON fd_api_usage_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_fdul_created   ON fd_api_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fdul_status    ON fd_api_usage_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_fdul_method    ON fd_api_usage_logs(method);

-- Partition hint: on large installs, range-partition fd_api_usage_logs by month.
-- Retention: delete rows older than 90 days via pg_cron:
--   SELECT cron.schedule('api-log-cleanup', '0 3 * * 0',
--     $$DELETE FROM fd_api_usage_logs WHERE created_at < now() - INTERVAL '90 days'$$);

-- ── 3. Webhook Secrets ────────────────────────────────────────────────────────
-- Per-form HMAC secrets for inbound webhook verification.
CREATE TABLE IF NOT EXISTS fd_webhook_secrets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       UUID        NOT NULL UNIQUE,
  secret_hash   TEXT        NOT NULL,            -- SHA-256 of the raw secret
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at    TIMESTAMPTZ
);

-- Guard: add is_active if the table already existed without it
ALTER TABLE fd_webhook_secrets ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_fdws_form ON fd_webhook_secrets(form_id);

-- ── 4. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE fd_api_keys       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_api_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_webhook_secrets ENABLE ROW LEVEL SECURITY;

-- API Keys: admin/ict/data_team can manage; FDH roles can read
CREATE POLICY "fdak_read" ON fd_api_keys FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','admin','ict','fom','data_team','project_manager','country_director')
  ));
CREATE POLICY "fdak_write" ON fd_api_keys FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','admin','ict','data_team')
  ));

-- Usage logs: admin/ict/data_team can read; service_role writes
CREATE POLICY "fdul_read" ON fd_api_usage_logs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','admin','ict','fom','data_team','project_manager','country_director')
  ));
CREATE POLICY "fdul_service" ON fd_api_usage_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Webhook secrets: admin/ict only
CREATE POLICY "fdws_read" ON fd_webhook_secrets FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','admin','ict','data_team')
  ));
CREATE POLICY "fdws_write" ON fd_webhook_secrets FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','admin','ict')
  ));
CREATE POLICY "fdak_service"  ON fd_api_keys        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "fdws_service"  ON fd_webhook_secrets FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 5. Key usage counter RPC ──────────────────────────────────────────────────
-- Called by the Edge Function after each request to bump the counter atomically.
CREATE OR REPLACE FUNCTION fd_increment_api_key_usage(p_key_hash TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE fd_api_keys
  SET usage_count  = usage_count + 1,
      last_used_at = now()
  WHERE key_hash = p_key_hash AND is_active = TRUE;
$$;

GRANT EXECUTE ON FUNCTION fd_increment_api_key_usage(TEXT) TO service_role;

-- ============================================================================
-- Phase 17 migration complete.
-- Tables: fd_api_keys, fd_api_usage_logs, fd_webhook_secrets
-- RPC:    fd_increment_api_key_usage(TEXT)
-- Next:   Deploy supabase/functions/fd-api/index.ts
-- ============================================================================

-- ============================================================================
-- PHASE 18: NOTIFICATION CHANNELS
-- ============================================================================
-- ============================================================================
-- Field Data Hub — Phase 18: Notification Channels
-- Tables: fd_notification_prefs, fd_form_subscriptions, fd_notification_log
-- ============================================================================

-- ── 1. Per-user per-event notification preferences ────────────────────────────
-- Stores which channels each user wants for each of the 9 FD event types.
-- Defaults (if no row): use the platform defaults defined in FD_EVENTS array.
CREATE TABLE IF NOT EXISTS fd_notification_prefs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type  TEXT        NOT NULL,
  in_app      BOOLEAN     NOT NULL DEFAULT true,
  email       BOOLEAN     NOT NULL DEFAULT true,
  whatsapp    BOOLEAN     NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_fdnp_user ON fd_notification_prefs(user_id);

-- Valid event types (informational — enforced in application layer):
--   fd_new_submission, fd_submission_rejected, fd_quality_alert,
--   fd_target_reached, fd_sync_failed, fd_export_ready,
--   fd_case_visit_due, fd_study_round_deadline, fd_server_connection_lost

-- ── 2. Form-level subscriptions ───────────────────────────────────────────────
-- Per-user, per-form explicit opt-in for a subset of event types.
-- When a user subscribes to a form, they get notified only for the chosen events.
-- event_types: TEXT[] — subset of the 9 FD event type keys.
CREATE TABLE IF NOT EXISTS fd_form_subscriptions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id     UUID        NOT NULL,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_types TEXT[]      NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (form_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_fdfss_form    ON fd_form_subscriptions(form_id);
CREATE INDEX IF NOT EXISTS idx_fdfss_user    ON fd_form_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_fdfss_events  ON fd_form_subscriptions USING GIN(event_types);

-- ── 3. Notification event log ──────────────────────────────────────────────────
-- One row per notification dispatch event (not per recipient).
-- Tracks how many recipients were targeted, which channels were used,
-- and whether delivery succeeded.
CREATE TABLE IF NOT EXISTS fd_notification_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      TEXT        NOT NULL,
  form_id         UUID,                                      -- NULL for server-level events
  study_id        UUID,                                      -- set for study round events
  triggered_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_count INTEGER     NOT NULL DEFAULT 0,
  channels        TEXT[]      NOT NULL DEFAULT '{}',        -- ['in_app','email','whatsapp']
  status          TEXT        NOT NULL DEFAULT 'delivered'
                  CHECK (status IN ('delivered','partial','failed')),
  error_message   TEXT,
  metadata        JSONB,                                     -- arbitrary event payload snapshot
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdnl_event   ON fd_notification_log(event_type);
CREATE INDEX IF NOT EXISTS idx_fdnl_form    ON fd_notification_log(form_id);
CREATE INDEX IF NOT EXISTS idx_fdnl_created ON fd_notification_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fdnl_status  ON fd_notification_log(status);

-- ── 4. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE fd_notification_prefs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_form_subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_notification_log      ENABLE ROW LEVEL SECURITY;

-- notification_prefs: users manage their own; service_role unrestricted
CREATE POLICY "fdnp_own" ON fd_notification_prefs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "fdnp_service" ON fd_notification_prefs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- form_subscriptions: users manage their own; admins read all
CREATE POLICY "fdfss_own" ON fd_form_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "fdfss_admin_read" ON fd_form_subscriptions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','admin','ict','data_team','fom')
  ));
CREATE POLICY "fdfss_service" ON fd_form_subscriptions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- notification_log: any authenticated FDH role can read; service_role writes
CREATE POLICY "fdnl_read" ON fd_notification_log FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','admin','ict','data_team','fom','project_manager','country_director')
  ));
CREATE POLICY "fdnl_service" ON fd_notification_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 5. Helper RPC: get subscribed users for a form+event ─────────────────────
-- Called by Edge Functions or backend triggers to find who should receive
-- a notification. Returns user_id array with their channel preferences.
CREATE OR REPLACE FUNCTION fd_get_notification_recipients(
  p_form_id   UUID,
  p_event_type TEXT
)
RETURNS TABLE (
  user_id  UUID,
  in_app   BOOLEAN,
  email    BOOLEAN,
  whatsapp BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    fs.user_id,
    COALESCE(np.in_app,   TRUE)  AS in_app,
    COALESCE(np.email,    TRUE)  AS email,
    COALESCE(np.whatsapp, FALSE) AS whatsapp
  FROM fd_form_subscriptions fs
  LEFT JOIN fd_notification_prefs np
         ON np.user_id = fs.user_id AND np.event_type = p_event_type
  WHERE fs.form_id = p_form_id
    AND p_event_type = ANY(fs.event_types);
$$;

GRANT EXECUTE ON FUNCTION fd_get_notification_recipients(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION fd_get_notification_recipients(UUID, TEXT) TO authenticated;

-- ── 6. Notification dispatch trigger helper ────────────────────────────────────
-- Insert a log row whenever a field-data notification batch is fired.
-- Usage (from Edge Function / backend):
--
--   INSERT INTO fd_notification_log
--     (event_type, form_id, recipient_count, channels, status, metadata)
--   VALUES
--     ('fd_new_submission', 'FORM_UUID', 5, ARRAY['in_app','email'],
--      'delivered', '{"submission_id":"…"}'::jsonb);
--
-- The log is queried by FieldDataNotifications.tsx Event Log tab.

-- ── 7. Seed: register FD event types in notification_event_types if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'notification_event_types') THEN
    INSERT INTO notification_event_types (event_type, category, label_en, label_ar, default_channels)
    VALUES
      ('fd_new_submission',        'field_data', 'New Submission',           'تقديم جديد',                    '{"in_app":true,"email":true,"whatsapp":true}'),
      ('fd_submission_rejected',   'field_data', 'Submission Rejected',      'تم رفض التقديم',               '{"in_app":true,"email":true,"whatsapp":true}'),
      ('fd_quality_alert',         'field_data', 'Data Quality Alert',       'تنبيه جودة البيانات',          '{"in_app":true,"email":true,"whatsapp":true}'),
      ('fd_target_reached',        'field_data', 'Target Reached',           'تم الوصول للهدف',              '{"in_app":true,"email":true,"whatsapp":true}'),
      ('fd_sync_failed',           'field_data', 'Sync Failed',              'فشل المزامنة',                 '{"in_app":true,"email":true,"whatsapp":false}'),
      ('fd_export_ready',          'field_data', 'Export Ready',             'التصدير جاهز',                 '{"in_app":true,"email":true,"whatsapp":false}'),
      ('fd_case_visit_due',        'field_data', 'Case Visit Due',           'موعد الزيارة الميدانية',       '{"in_app":true,"email":false,"whatsapp":true}'),
      ('fd_study_round_deadline',  'field_data', 'Study Round Deadline',     'موعد جولة الدراسة',            '{"in_app":true,"email":true,"whatsapp":true}'),
      ('fd_server_connection_lost','field_data', 'Server Connection Lost',   'انقطع الاتصال بالخادم',        '{"in_app":true,"email":true,"whatsapp":false}')
    ON CONFLICT (event_type) DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- Phase 18 migration complete.
-- Tables:  fd_notification_prefs, fd_form_subscriptions, fd_notification_log
-- RPC:     fd_get_notification_recipients(UUID, TEXT)
-- 9 FD event types registered.
-- ============================================================================

-- ============================================================================
-- ALL 18 PHASES COMPLETE
-- ============================================================================
-- After running this file:
-- 1. Create Supabase Storage bucket:  field-data-datasets  (private, 50 MB max)
--    INSERT INTO storage.buckets (id, name, public)
--    VALUES ('field-data-datasets','field-data-datasets', false) ON CONFLICT DO NOTHING;
-- 2. Deploy Edge Functions:
--      supabase/functions/fd-api/index.ts
--      supabase/functions/create-pact-archive/index.ts
-- 3. Optional pg_cron retention (see Phase 17 comments):
--      api_usage_logs: 90-day rolling delete
--      backups: per-schedule retention
-- ============================================================================

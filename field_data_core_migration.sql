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

-- Guards: add columns if table already existed without them
ALTER TABLE field_data_servers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE field_data_servers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'untested';

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

-- Guards: add all columns if table was created by the minimal prerequisite stub
ALTER TABLE field_data_forms ADD COLUMN IF NOT EXISTS description       TEXT;
ALTER TABLE field_data_forms ADD COLUMN IF NOT EXISTS form_id_slug      TEXT;
ALTER TABLE field_data_forms ADD COLUMN IF NOT EXISTS xls_form_url      TEXT;
ALTER TABLE field_data_forms ADD COLUMN IF NOT EXISTS status            TEXT DEFAULT 'active';
ALTER TABLE field_data_forms ADD COLUMN IF NOT EXISTS default_language  TEXT DEFAULT 'English';
ALTER TABLE field_data_forms ADD COLUMN IF NOT EXISTS submission_count  INTEGER DEFAULT 0;
ALTER TABLE field_data_forms ADD COLUMN IF NOT EXISTS last_submission_at TIMESTAMPTZ;
ALTER TABLE field_data_forms ADD COLUMN IF NOT EXISTS odk_qr_code       TEXT;
ALTER TABLE field_data_forms ADD COLUMN IF NOT EXISTS qr_generated_at   TIMESTAMPTZ;
ALTER TABLE field_data_forms ADD COLUMN IF NOT EXISTS encryption_enabled BOOLEAN DEFAULT false;
ALTER TABLE field_data_forms ADD COLUMN IF NOT EXISTS public_key         TEXT;
ALTER TABLE field_data_forms ADD COLUMN IF NOT EXISTS created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE field_data_forms ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT now();

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

-- Guards: add columns if table already existed without them
ALTER TABLE field_data_submissions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE field_data_submissions ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending';
ALTER TABLE field_data_submissions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'sync';
ALTER TABLE field_data_submissions ADD COLUMN IF NOT EXISTS uuid TEXT;

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

-- Guard: add status if table already existed without it
ALTER TABLE field_data_import_jobs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

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

-- Guard: add status if table already existed without it
ALTER TABLE field_data_sync_logs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'running';

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

-- Guard: add status if table already existed without it
ALTER TABLE field_data_exports ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

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

-- Guards: add all columns if table was created by the minimal prerequisite stub
ALTER TABLE fd_forms ADD COLUMN IF NOT EXISTS description        TEXT;
ALTER TABLE fd_forms ADD COLUMN IF NOT EXISTS version            TEXT DEFAULT '1';
ALTER TABLE fd_forms ADD COLUMN IF NOT EXISTS status             TEXT DEFAULT 'active';
ALTER TABLE fd_forms ADD COLUMN IF NOT EXISTS default_language   TEXT DEFAULT 'en';
ALTER TABLE fd_forms ADD COLUMN IF NOT EXISTS submission_count   INTEGER DEFAULT 0;
ALTER TABLE fd_forms ADD COLUMN IF NOT EXISTS last_submission_at TIMESTAMPTZ;
ALTER TABLE fd_forms ADD COLUMN IF NOT EXISTS legacy_form_id     UUID REFERENCES field_data_forms(id) ON DELETE SET NULL;
ALTER TABLE fd_forms ADD COLUMN IF NOT EXISTS created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE fd_forms ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT now();

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

-- Guards: add columns if table already existed without them
ALTER TABLE fd_submissions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE fd_submissions ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending';
ALTER TABLE fd_submissions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'sync';

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

-- Note: idx_fdfs_form is already used for field_data_form_servers above.
-- Using unique name idx_fdschema_form for fd_form_schema to avoid duplicate.
CREATE INDEX IF NOT EXISTS idx_fdschema_form ON fd_form_schema(form_id);
CREATE INDEX IF NOT EXISTS idx_fdschema_name ON fd_form_schema(name);
CREATE INDEX IF NOT EXISTS idx_fdschema_type ON fd_form_schema(type);

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
DROP POLICY IF EXISTS "fdserv_read" ON field_data_servers;
CREATE POLICY "fdserv_read"  ON field_data_servers FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fdserv_write" ON field_data_servers;
CREATE POLICY "fdserv_write" ON field_data_servers FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
DROP POLICY IF EXISTS "fdserv_svc" ON field_data_servers;
CREATE POLICY "fdserv_svc"   ON field_data_servers FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- Forms: read by hub users; write by admins
DROP POLICY IF EXISTS "fdf_read" ON field_data_forms;
CREATE POLICY "fdf_read"   ON field_data_forms FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fdf_write" ON field_data_forms;
CREATE POLICY "fdf_write"  ON field_data_forms FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
DROP POLICY IF EXISTS "fdf_svc" ON field_data_forms;
CREATE POLICY "fdf_svc"    ON field_data_forms FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- Form-server junction
DROP POLICY IF EXISTS "fdfs_read" ON field_data_form_servers;
CREATE POLICY "fdfs_read"  ON field_data_form_servers FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fdfs_write" ON field_data_form_servers;
CREATE POLICY "fdfs_write" ON field_data_form_servers FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
DROP POLICY IF EXISTS "fdfs_svc" ON field_data_form_servers;
CREATE POLICY "fdfs_svc"   ON field_data_form_servers FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- Submissions: read by hub users; write by data_team/admins and service_role
DROP POLICY IF EXISTS "fdsub_read" ON field_data_submissions;
CREATE POLICY "fdsub_read"  ON field_data_submissions FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fdsub_write" ON field_data_submissions;
CREATE POLICY "fdsub_write" ON field_data_submissions FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
DROP POLICY IF EXISTS "fdsub_svc" ON field_data_submissions;
CREATE POLICY "fdsub_svc"   ON field_data_submissions FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- Import jobs
DROP POLICY IF EXISTS "fdij_read" ON field_data_import_jobs;
CREATE POLICY "fdij_read"   ON field_data_import_jobs FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fdij_write" ON field_data_import_jobs;
CREATE POLICY "fdij_write"  ON field_data_import_jobs FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
DROP POLICY IF EXISTS "fdij_svc" ON field_data_import_jobs;
CREATE POLICY "fdij_svc"    ON field_data_import_jobs FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- Form versions
DROP POLICY IF EXISTS "fdfv_read" ON field_data_form_versions;
CREATE POLICY "fdfv_read"   ON field_data_form_versions FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fdfv_write" ON field_data_form_versions;
CREATE POLICY "fdfv_write"  ON field_data_form_versions FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
DROP POLICY IF EXISTS "fdfv_svc" ON field_data_form_versions;
CREATE POLICY "fdfv_svc"    ON field_data_form_versions FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- Sync logs
DROP POLICY IF EXISTS "fdsl_read" ON field_data_sync_logs;
CREATE POLICY "fdsl_read"   ON field_data_sync_logs FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fdsl_write" ON field_data_sync_logs;
CREATE POLICY "fdsl_write"  ON field_data_sync_logs FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
DROP POLICY IF EXISTS "fdsl_svc" ON field_data_sync_logs;
CREATE POLICY "fdsl_svc"    ON field_data_sync_logs FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- Sync schedules
DROP POLICY IF EXISTS "fdss_read" ON field_data_sync_schedules;
CREATE POLICY "fdss_read"   ON field_data_sync_schedules FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fdss_write" ON field_data_sync_schedules;
CREATE POLICY "fdss_write"  ON field_data_sync_schedules FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
DROP POLICY IF EXISTS "fdss_svc" ON field_data_sync_schedules;
CREATE POLICY "fdss_svc"    ON field_data_sync_schedules FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- Exports (legacy)
DROP POLICY IF EXISTS "fde_read" ON field_data_exports;
CREATE POLICY "fde_read"    ON field_data_exports FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fde_write" ON field_data_exports;
CREATE POLICY "fde_write"   ON field_data_exports FOR ALL    TO authenticated USING (fd_is_hub_user()) WITH CHECK (fd_is_hub_user());
DROP POLICY IF EXISTS "fde_svc" ON field_data_exports;
CREATE POLICY "fde_svc"     ON field_data_exports FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- fd_forms / fd_submissions / fd_form_schema
DROP POLICY IF EXISTS "fdforms_read" ON fd_forms;
CREATE POLICY "fdforms_read"  ON fd_forms      FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fdforms_write" ON fd_forms;
CREATE POLICY "fdforms_write" ON fd_forms      FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
DROP POLICY IF EXISTS "fdforms_svc" ON fd_forms;
CREATE POLICY "fdforms_svc"   ON fd_forms      FOR ALL    TO service_role  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fdsubs_read" ON fd_submissions;
CREATE POLICY "fdsubs_read"   ON fd_submissions FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fdsubs_write" ON fd_submissions;
CREATE POLICY "fdsubs_write"  ON fd_submissions FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
DROP POLICY IF EXISTS "fdsubs_svc" ON fd_submissions;
CREATE POLICY "fdsubs_svc"    ON fd_submissions FOR ALL    TO service_role  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fdschema_read" ON fd_form_schema;
CREATE POLICY "fdschema_read" ON fd_form_schema FOR SELECT TO authenticated USING (fd_is_hub_user());
DROP POLICY IF EXISTS "fdschema_write" ON fd_form_schema;
CREATE POLICY "fdschema_write" ON fd_form_schema FOR ALL    TO authenticated USING (fd_is_admin()) WITH CHECK (fd_is_admin());
DROP POLICY IF EXISTS "fdschema_svc" ON fd_form_schema;
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

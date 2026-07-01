-- ============================================================================
-- PREREQUISITE STUB — ensures fd_forms exists even when running this file alone
-- Safe no-op if core migration already ran (CREATE TABLE IF NOT EXISTS).
-- ============================================================================
DO $fd_prereq$ BEGIN
  CREATE TABLE IF NOT EXISTS field_data_forms (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN OTHERS THEN NULL; END $fd_prereq$;

DO $fd_prereq2$ BEGIN
  CREATE TABLE IF NOT EXISTS fd_forms (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN OTHERS THEN NULL; END $fd_prereq2$;
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

-- Guard: add columns if table already existed without them
ALTER TABLE fd_export_jobs ADD COLUMN IF NOT EXISTS status fd_export_status DEFAULT 'queued';
ALTER TABLE fd_export_jobs ADD COLUMN IF NOT EXISTS format fd_export_format DEFAULT 'xlsx';

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

DROP POLICY IF EXISTS "fd_export_jobs_select" ON fd_export_jobs;
CREATE POLICY "fd_export_jobs_select" ON fd_export_jobs
  FOR SELECT USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'ict', 'data_team', 'fom', 'country_director')
    )
  );

DROP POLICY IF EXISTS "fd_export_jobs_insert" ON fd_export_jobs;
CREATE POLICY "fd_export_jobs_insert" ON fd_export_jobs
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'ict', 'data_team', 'fom', 'project_manager', 'country_director')
    )
  );

DROP POLICY IF EXISTS "fd_export_jobs_delete" ON fd_export_jobs;
CREATE POLICY "fd_export_jobs_delete" ON fd_export_jobs
  FOR DELETE USING (created_by = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'ict')
  ));

-- Service role can update status / file_url
DROP POLICY IF EXISTS "fd_export_jobs_update" ON fd_export_jobs;
CREATE POLICY "fd_export_jobs_update" ON fd_export_jobs
  FOR UPDATE USING (true);

-- Templates: users manage their own

DROP POLICY IF EXISTS "fd_export_templates_select" ON fd_export_templates;
CREATE POLICY "fd_export_templates_select" ON fd_export_templates
  FOR SELECT USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'ict')
    )
  );

DROP POLICY IF EXISTS "fd_export_templates_insert" ON fd_export_templates;
CREATE POLICY "fd_export_templates_insert" ON fd_export_templates
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "fd_export_templates_delete" ON fd_export_templates;
CREATE POLICY "fd_export_templates_delete" ON fd_export_templates
  FOR DELETE USING (created_by = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'ict')
  ));

DROP POLICY IF EXISTS "fd_export_templates_update" ON fd_export_templates;
CREATE POLICY "fd_export_templates_update" ON fd_export_templates
  FOR UPDATE USING (created_by = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'ict')
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

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

-- Guard: add status/backup_type if table already existed without them
ALTER TABLE fd_backups ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE fd_backups ADD COLUMN IF NOT EXISTS backup_type TEXT DEFAULT 'auto';

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

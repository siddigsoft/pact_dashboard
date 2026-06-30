-- Phase 2: Field Data Sync Logs
-- Run this in Supabase SQL Editor after 20260630_field_data_hub.sql

-- ─── Sync Logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_data_sync_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id           UUID        NOT NULL REFERENCES field_data_forms(id) ON DELETE CASCADE,
  server_id         UUID        REFERENCES field_data_servers(id) ON DELETE SET NULL,
  sync_type         TEXT        NOT NULL DEFAULT 'manual'
                                CHECK (sync_type IN ('manual','scheduled','webhook','test')),
  status            TEXT        NOT NULL DEFAULT 'running'
                                CHECK (status IN ('running','success','error')),
  records_pulled    INTEGER     NOT NULL DEFAULT 0,
  records_new       INTEGER     NOT NULL DEFAULT 0,
  records_updated   INTEGER     NOT NULL DEFAULT 0,
  error_message     TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ,
  triggered_by      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_form ON field_data_sync_logs(form_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_server ON field_data_sync_logs(server_id, started_at DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE field_data_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_logs_select" ON field_data_sync_logs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "sync_logs_insert" ON field_data_sync_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "sync_logs_update" ON field_data_sync_logs
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- ─── Add webhook_secret to servers (for inbound webhook auth) ────────────────
ALTER TABLE field_data_servers
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT,
  ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_test_message TEXT;

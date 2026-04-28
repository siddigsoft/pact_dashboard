-- ─────────────────────────────────────────────────────────────────────────────
-- WhatsApp Final Setup — ensures all tables, columns, indexes, and policies
-- exist. Safe to re-run (all statements are IF NOT EXISTS / OR REPLACE).
-- Run this in Supabase SQL Editor after deploying the edge functions.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. user_integrations — WhatsApp columns (safe to run even if table exists)
DO $$ BEGIN
  ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS whatsapp_enabled          BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS whatsapp_phone             TEXT;
  ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS whatsapp_notify_tasks      BOOLEAN NOT NULL DEFAULT TRUE;
  ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS whatsapp_notify_approvals  BOOLEAN NOT NULL DEFAULT TRUE;
  ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS whatsapp_notify_payroll    BOOLEAN NOT NULL DEFAULT TRUE;
  ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS whatsapp_notify_projects   BOOLEAN NOT NULL DEFAULT TRUE;
  ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS whatsapp_notify_mmp        BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN undefined_table THEN
  -- Table does not exist yet — create it
  CREATE TABLE user_integrations (
    id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    google_calendar_connected        BOOLEAN NOT NULL DEFAULT FALSE,
    google_calendar_email            TEXT,
    google_calendar_access_token     TEXT,
    google_calendar_refresh_token    TEXT,
    google_calendar_token_expiry     TIMESTAMPTZ,
    notification_email               TEXT,
    email_notifications_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    email_notify_task_assigned       BOOLEAN NOT NULL DEFAULT TRUE,
    email_notify_approval_needed     BOOLEAN NOT NULL DEFAULT TRUE,
    email_notify_payroll             BOOLEAN NOT NULL DEFAULT TRUE,
    email_notify_project_milestones  BOOLEAN NOT NULL DEFAULT TRUE,
    email_notify_system              BOOLEAN NOT NULL DEFAULT FALSE,
    whatsapp_enabled                 BOOLEAN NOT NULL DEFAULT FALSE,
    whatsapp_phone                   TEXT,
    whatsapp_notify_tasks            BOOLEAN NOT NULL DEFAULT TRUE,
    whatsapp_notify_approvals        BOOLEAN NOT NULL DEFAULT TRUE,
    whatsapp_notify_payroll          BOOLEAN NOT NULL DEFAULT TRUE,
    whatsapp_notify_projects         BOOLEAN NOT NULL DEFAULT TRUE,
    whatsapp_notify_mmp              BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id)
  );
END $$;

-- 2. whatsapp_logs table
CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         TEXT NOT NULL,
  user_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'sent',     -- sent | failed | skipped | received
  direction     TEXT NOT NULL DEFAULT 'outbound', -- outbound | inbound
  message_body  TEXT,
  error_message TEXT,
  wasender_id   TEXT,
  broadcast_id  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2a. broadcast_id column (in case table already existed without it)
ALTER TABLE whatsapp_logs ADD COLUMN IF NOT EXISTS broadcast_id TEXT;

-- 2b. Indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_created_at    ON whatsapp_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_user_id       ON whatsapp_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_status        ON whatsapp_logs (status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_direction     ON whatsapp_logs (direction);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_broadcast_id  ON whatsapp_logs (broadcast_id) WHERE broadcast_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_phone         ON whatsapp_logs (phone);

-- 3. Row Level Security
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_logs     ENABLE ROW LEVEL SECURITY;

-- user_integrations policies
DROP POLICY IF EXISTS user_integrations_select_own  ON user_integrations;
DROP POLICY IF EXISTS user_integrations_upsert_own  ON user_integrations;
DROP POLICY IF EXISTS user_integrations_admin_select ON user_integrations;

CREATE POLICY user_integrations_select_own ON user_integrations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY user_integrations_upsert_own ON user_integrations
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_integrations_admin_select ON user_integrations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Admin', 'SuperAdmin')
    )
  );

-- whatsapp_logs policies
DROP POLICY IF EXISTS whatsapp_logs_admin_read    ON whatsapp_logs;
DROP POLICY IF EXISTS whatsapp_logs_service_write ON whatsapp_logs;

CREATE POLICY whatsapp_logs_admin_read ON whatsapp_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Admin', 'SuperAdmin')
    )
  );

-- Service role can insert/update (edge functions use service role key)
CREATE POLICY whatsapp_logs_service_write ON whatsapp_logs
  FOR ALL USING (true)
  WITH CHECK (true);

-- 4. updated_at trigger for user_integrations
CREATE OR REPLACE FUNCTION update_user_integrations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_integrations_updated_at ON user_integrations;
CREATE TRIGGER trg_user_integrations_updated_at
  BEFORE UPDATE ON user_integrations
  FOR EACH ROW EXECUTE FUNCTION update_user_integrations_updated_at();

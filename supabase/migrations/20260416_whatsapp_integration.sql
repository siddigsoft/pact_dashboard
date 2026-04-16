-- ─────────────────────────────────────────────────────────────────────────────
-- WhatsApp Integration + user_integrations table
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. user_integrations (create if not exists — may already exist from earlier migration)
CREATE TABLE IF NOT EXISTS user_integrations (
  id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Google Calendar
  google_calendar_connected        BOOLEAN NOT NULL DEFAULT FALSE,
  google_calendar_email            TEXT,
  google_calendar_access_token     TEXT,
  google_calendar_refresh_token    TEXT,
  google_calendar_token_expiry     TIMESTAMPTZ,
  -- Email Preferences
  notification_email               TEXT,
  email_notifications_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  email_notify_task_assigned       BOOLEAN NOT NULL DEFAULT TRUE,
  email_notify_approval_needed     BOOLEAN NOT NULL DEFAULT TRUE,
  email_notify_payroll             BOOLEAN NOT NULL DEFAULT TRUE,
  email_notify_project_milestones  BOOLEAN NOT NULL DEFAULT TRUE,
  email_notify_system              BOOLEAN NOT NULL DEFAULT FALSE,
  -- WhatsApp Preferences
  whatsapp_enabled                 BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp_phone                   TEXT,
  whatsapp_notify_tasks            BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_notify_approvals        BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_notify_payroll          BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_notify_projects         BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_notify_mmp              BOOLEAN NOT NULL DEFAULT FALSE,
  --
  created_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- Add WhatsApp columns to existing table if it already exists
DO $$ BEGIN
  ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;
  ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS whatsapp_notify_tasks BOOLEAN NOT NULL DEFAULT TRUE;
  ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS whatsapp_notify_approvals BOOLEAN NOT NULL DEFAULT TRUE;
  ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS whatsapp_notify_payroll BOOLEAN NOT NULL DEFAULT TRUE;
  ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS whatsapp_notify_projects BOOLEAN NOT NULL DEFAULT TRUE;
  ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS whatsapp_notify_mmp BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2. WhatsApp delivery logs table
CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         TEXT NOT NULL,
  user_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'sent',  -- sent | failed | received
  direction     TEXT NOT NULL DEFAULT 'outbound', -- outbound | inbound
  message_body  TEXT,
  error_message TEXT,
  wasender_id   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_created_at ON whatsapp_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_user_id ON whatsapp_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_status ON whatsapp_logs (status);

-- 3. RLS policies
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_logs ENABLE ROW LEVEL SECURITY;

-- user_integrations: users manage their own row; admins can read all
DROP POLICY IF EXISTS user_integrations_select_own ON user_integrations;
DROP POLICY IF EXISTS user_integrations_upsert_own ON user_integrations;
DROP POLICY IF EXISTS user_integrations_admin_select ON user_integrations;

CREATE POLICY user_integrations_select_own ON user_integrations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY user_integrations_upsert_own ON user_integrations
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY user_integrations_admin_select ON user_integrations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Admin', 'SuperAdmin')
    )
  );

-- whatsapp_logs: admins and superadmins can read all; service role writes
DROP POLICY IF EXISTS whatsapp_logs_admin_read ON whatsapp_logs;
CREATE POLICY whatsapp_logs_admin_read ON whatsapp_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Admin', 'SuperAdmin')
    )
  );

-- 4. Updated_at trigger
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

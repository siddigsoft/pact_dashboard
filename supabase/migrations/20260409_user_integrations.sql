-- user_integrations: stores per-user integration settings and email notification preferences
-- OAuth tokens are stored separately in user_integration_tokens (server-only access)
CREATE TABLE IF NOT EXISTS user_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_calendar_connected boolean NOT NULL DEFAULT false,
  google_calendar_email text,
  notification_email text,
  email_notifications_enabled boolean NOT NULL DEFAULT true,
  email_notify_task_assigned boolean NOT NULL DEFAULT true,
  email_notify_approval_needed boolean NOT NULL DEFAULT true,
  email_notify_payroll boolean NOT NULL DEFAULT true,
  email_notify_project_milestones boolean NOT NULL DEFAULT true,
  email_notify_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

-- Users can only access their own integration record
CREATE POLICY "Users can manage own integrations"
  ON user_integrations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_user_integrations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_integrations_updated_at
  BEFORE UPDATE ON user_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_user_integrations_updated_at();

-- user_integration_tokens: stores sensitive OAuth tokens, server-only access
-- Accessible only via Edge Functions using the service_role key
-- No RLS policies that allow client reads to prevent token exposure
CREATE TABLE IF NOT EXISTS user_integration_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  token_expiry timestamptz,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

-- No client-accessible RLS policies: tokens are managed exclusively by Edge Functions
-- with the service_role key. This prevents token exposure through client queries.
ALTER TABLE user_integration_tokens ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT/UPDATE/DELETE policies for authenticated role intentionally.
-- Only service_role (bypasses RLS) can access this table.

CREATE OR REPLACE FUNCTION update_user_integration_tokens_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_integration_tokens_updated_at
  BEFORE UPDATE ON user_integration_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_user_integration_tokens_updated_at();

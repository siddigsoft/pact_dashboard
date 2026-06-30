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

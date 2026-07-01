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

-- Guard: add status if table already existed without it
ALTER TABLE fd_notification_log ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'delivered';

CREATE INDEX IF NOT EXISTS idx_fdnl_event   ON fd_notification_log(event_type);
CREATE INDEX IF NOT EXISTS idx_fdnl_form    ON fd_notification_log(form_id);
CREATE INDEX IF NOT EXISTS idx_fdnl_created ON fd_notification_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fdnl_status  ON fd_notification_log(status);

-- ── 4. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE fd_notification_prefs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_form_subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_notification_log      ENABLE ROW LEVEL SECURITY;

-- notification_prefs: users manage their own; service_role unrestricted
DROP POLICY IF EXISTS "fdnp_own" ON fd_notification_prefs;
CREATE POLICY "fdnp_own" ON fd_notification_prefs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "fdnp_service" ON fd_notification_prefs;
CREATE POLICY "fdnp_service" ON fd_notification_prefs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- form_subscriptions: users manage their own; admins read all
DROP POLICY IF EXISTS "fdfss_own" ON fd_form_subscriptions;
CREATE POLICY "fdfss_own" ON fd_form_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "fdfss_admin_read" ON fd_form_subscriptions;
CREATE POLICY "fdfss_admin_read" ON fd_form_subscriptions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','admin','ict','data_team','fom')
  ));
DROP POLICY IF EXISTS "fdfss_service" ON fd_form_subscriptions;
CREATE POLICY "fdfss_service" ON fd_form_subscriptions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- notification_log: any authenticated FDH role can read; service_role writes
DROP POLICY IF EXISTS "fdnl_read" ON fd_notification_log;
CREATE POLICY "fdnl_read" ON fd_notification_log FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','admin','ict','data_team','fom','project_manager','country_director')
  ));
DROP POLICY IF EXISTS "fdnl_service" ON fd_notification_log;
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

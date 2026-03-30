-- notification_schedules: stores pending scheduled, reminder, and auto-recurring notifications
-- The actual delivery requires a Supabase scheduled Edge Function or pg_cron job
-- that polls for records where status = 'pending' AND scheduled_at <= NOW()

CREATE TABLE IF NOT EXISTS public.notification_schedules (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_ids         UUID[] NOT NULL,
  channels              JSONB NOT NULL DEFAULT '{"inApp": true, "fcm": true, "email": false}',
  title_en              TEXT NOT NULL,
  title_ar              TEXT,
  message_en            TEXT NOT NULL,
  message_ar            TEXT,
  event_type            TEXT NOT NULL DEFAULT 'monitoring_reminder',
  action_url            TEXT,
  priority              TEXT NOT NULL DEFAULT 'normal',
  scheduled_at          TIMESTAMPTZ NOT NULL,
  -- Recurrence
  repeat_mode           TEXT,           -- NULL = one-shot, 'reminder' = one follow-up, 'auto' = recurring
  repeat_interval_hours INTEGER,        -- hours between repeats (e.g. 168 = 7 days)
  end_date              TIMESTAMPTZ,    -- stop recurring on or after this date (NULL = no end)
  max_repeats           INTEGER,        -- max number of sends (NULL = unlimited)
  -- Tracking
  repeats_sent          INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'pending', -- pending | sent | cancelled | failed
  sent_at               TIMESTAMPTZ,
  error_message         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notification_schedules_status_time
  ON public.notification_schedules (status, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_notification_schedules_created_by
  ON public.notification_schedules (created_by);

-- RLS
ALTER TABLE public.notification_schedules ENABLE ROW LEVEL SECURITY;

-- Super admins can do everything
CREATE POLICY "notification_schedules_super_admin_all"
  ON public.notification_schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Users with monitoring page access can read schedules they created
CREATE POLICY "notification_schedules_monitoring_access_read"
  ON public.notification_schedules FOR SELECT
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.monitoring_page_access
      WHERE user_id = auth.uid()
    )
  );

-- Users with monitoring access can insert their own schedules
CREATE POLICY "notification_schedules_monitoring_access_insert"
  ON public.notification_schedules FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.monitoring_page_access
      WHERE user_id = auth.uid()
    )
  );

-- NOTE: To enable automatic delivery of scheduled notifications, run this in Supabase:
--
-- SELECT cron.schedule(
--   'process-notification-schedules',
--   '* * * * *',   -- every minute
--   $$
--   SELECT net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/process-scheduled-notifications',
--     headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
--   );
--   $$
-- );

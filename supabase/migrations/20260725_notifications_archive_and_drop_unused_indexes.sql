-- Notifications archive job + drop unused non-constraint indexes (idx_scan = 0)

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── 1) Archive table (cold storage; live table stays lean) ───────────────────
CREATE TABLE IF NOT EXISTS public.notifications_archive (
  LIKE public.notifications INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING GENERATED
);

ALTER TABLE public.notifications_archive
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.notifications_archive'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.notifications_archive ADD PRIMARY KEY (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_archive_recipient_created
  ON public.notifications_archive (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_archive_archived_at
  ON public.notifications_archive (archived_at DESC);

ALTER TABLE public.notifications_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_archive_service_all ON public.notifications_archive;
CREATE POLICY notifications_archive_service_all
  ON public.notifications_archive
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS notifications_archive_admin_read ON public.notifications_archive;
CREATE POLICY notifications_archive_admin_read
  ON public.notifications_archive
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role = ANY (ARRAY[
          'admin'::text, 'superAdmin'::text, 'super_admin'::text,
          'fom'::text, 'ict'::text, 'ictSupport'::text
        ])
    )
  );

COMMENT ON TABLE public.notifications_archive IS
  'Cold copy of notifications moved off the hot table by archive_stale_notifications().';

-- ── 2) Batched archive+delete (replaces pure DELETE cleanup) ─────────────────
CREATE OR REPLACE FUNCTION public.archive_stale_notifications(p_batch_size integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_moved integer := 0;
  batch integer;
BEGIN
  IF p_batch_size IS NULL OR p_batch_size < 1 THEN
    p_batch_size := 5000;
  END IF;

  -- A) Read notifications older than 30 days
  LOOP
    WITH doomed AS (
      SELECT id
      FROM public.notifications
      WHERE is_read = true
        AND created_at < now() - interval '30 days'
      LIMIT p_batch_size
    ),
    moved AS (
      INSERT INTO public.notifications_archive
      SELECT n.*, now()
      FROM public.notifications n
      JOIN doomed d ON d.id = n.id
      WHERE NOT EXISTS (SELECT 1 FROM public.notifications_archive a WHERE a.id = n.id)
      RETURNING id
    )
    DELETE FROM public.notifications n
    USING moved m
    WHERE n.id = m.id;

    GET DIAGNOSTICS batch = ROW_COUNT;
    total_moved := total_moved + batch;
    EXIT WHEN batch = 0;
  END LOOP;

  -- B) Unread normal/unset priority older than 60 days (all event types)
  LOOP
    WITH doomed AS (
      SELECT id
      FROM public.notifications
      WHERE is_read = false
        AND (priority IS NULL OR priority = 'normal')
        AND created_at < now() - interval '60 days'
      LIMIT p_batch_size
    ),
    moved AS (
      INSERT INTO public.notifications_archive
      SELECT n.*, now()
      FROM public.notifications n
      JOIN doomed d ON d.id = n.id
      WHERE NOT EXISTS (SELECT 1 FROM public.notifications_archive a WHERE a.id = n.id)
      RETURNING id
    )
    DELETE FROM public.notifications n
    USING moved m
    WHERE n.id = m.id;

    GET DIAGNOSTICS batch = ROW_COUNT;
    total_moved := total_moved + batch;
    EXIT WHEN batch = 0;
  END LOOP;

  -- C) Hard cap: anything older than 90 days except unread urgent
  LOOP
    WITH doomed AS (
      SELECT id
      FROM public.notifications
      WHERE created_at < now() - interval '90 days'
        AND NOT (is_read = false AND priority = 'urgent')
      LIMIT p_batch_size
    ),
    moved AS (
      INSERT INTO public.notifications_archive
      SELECT n.*, now()
      FROM public.notifications n
      JOIN doomed d ON d.id = n.id
      WHERE NOT EXISTS (SELECT 1 FROM public.notifications_archive a WHERE a.id = n.id)
      RETURNING id
    )
    DELETE FROM public.notifications n
    USING moved m
    WHERE n.id = m.id;

    GET DIAGNOSTICS batch = ROW_COUNT;
    total_moved := total_moved + batch;
    EXIT WHEN batch = 0;
  END LOOP;

  RETURN total_moved;
END;
$$;

COMMENT ON FUNCTION public.archive_stale_notifications(integer) IS
  'Moves stale notifications into notifications_archive then deletes from hot table. Daily pg_cron.';

GRANT EXECUTE ON FUNCTION public.archive_stale_notifications(integer) TO service_role;

-- Keep old name as wrapper so existing cron / callers keep working
CREATE OR REPLACE FUNCTION public.cleanup_stale_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.archive_stale_notifications(5000);
END;
$$;

-- Ensure daily cron points at cleanup (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-stale-notifications') THEN
    PERFORM cron.unschedule('cleanup-stale-notifications');
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-stale-notifications',
  '0 3 * * *',
  $$SELECT public.cleanup_stale_notifications();$$
);

-- ── 3) Drop unused non-PK / non-unique indexes (idx_scan = 0) ────────────────
-- Keeps notification hot-path indexes and the reclaim partial index.
DO $$
DECLARE
  r record;
  dropped integer := 0;
BEGIN
  FOR r IN
    SELECT ui.indexrelname AS idx
    FROM pg_stat_user_indexes ui
    JOIN pg_index i ON i.indexrelid = ui.indexrelid
    WHERE ui.schemaname = 'public'
      AND ui.idx_scan = 0
      AND NOT i.indisprimary
      AND NOT i.indisunique
      AND ui.indexrelname NOT LIKE 'idx_notifications_%'
      AND ui.indexrelname <> 'idx_dpr_manual_reclaim'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.idx);
    dropped := dropped + 1;
  END LOOP;
  RAISE NOTICE 'Dropped % unused indexes', dropped;
END;
$$;

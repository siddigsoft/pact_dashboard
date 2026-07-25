-- Widen archive rules so they match real notification traffic.
-- Prior noisy_event_types missed assignments/mmp_* variants;
-- 90d hard-cap kept all unread high/urgent forever (entire >90d set).

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
  'Moves stale notifications into notifications_archive then deletes from hot table. Daily pg_cron via cleanup_stale_notifications().';

DROP POLICY IF EXISTS notifications_archive_service_all ON public.notifications_archive;
CREATE POLICY notifications_archive_service_all
  ON public.notifications_archive
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

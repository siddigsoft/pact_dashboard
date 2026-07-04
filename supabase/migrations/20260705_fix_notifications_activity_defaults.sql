-- Safety nets for production errors still seen in logs:
-- 1. notifications.event_type NOT NULL when legacy inserts only set "type"
-- 2. user_activity_logs RLS failures when client syncs without valid JWT

CREATE OR REPLACE FUNCTION public.notifications_apply_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.event_type IS NULL OR btrim(NEW.event_type) = '' THEN
    NEW.event_type := COALESCE(
      NULLIF(NEW.type, ''),
      NULLIF(NEW.metadata->>'category', ''),
      'system'
    );
  END IF;

  IF NEW.recipient_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.recipient_id := NEW.user_id;
  END IF;

  IF NEW.user_id IS NULL AND NEW.recipient_id IS NOT NULL THEN
    NEW.user_id := NEW.recipient_id;
  END IF;

  IF NEW.is_read IS NULL THEN
    NEW.is_read := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_apply_defaults ON public.notifications;
CREATE TRIGGER trg_notifications_apply_defaults
  BEFORE INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notifications_apply_defaults();

CREATE OR REPLACE FUNCTION public.insert_user_activity_logs_secure(p_rows jsonb)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row jsonb;
  new_id uuid;
  v_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  FOR row IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    v_user_id := COALESCE(
      NULLIF(row->>'user_id', '')::uuid,
      auth.uid()
    );

    INSERT INTO public.user_activity_logs (
      id,
      user_id,
      user_name,
      user_email,
      user_role,
      activity_type,
      category,
      component,
      action,
      description,
      path,
      timestamp,
      metadata,
      element_id,
      element_text,
      previous_value,
      new_value,
      duration,
      success,
      error_message,
      session_id,
      device_info
    ) VALUES (
      COALESCE(NULLIF(row->>'id', '')::uuid, gen_random_uuid()),
      v_user_id,
      NULLIF(row->>'user_name', ''),
      NULLIF(row->>'user_email', ''),
      NULLIF(row->>'user_role', ''),
      NULLIF(row->>'activity_type', ''),
      NULLIF(row->>'category', ''),
      NULLIF(row->>'component', ''),
      NULLIF(row->>'action', ''),
      NULLIF(row->>'description', ''),
      NULLIF(row->>'path', ''),
      COALESCE((row->>'timestamp')::timestamptz, NOW()),
      row->'metadata',
      NULLIF(row->>'element_id', ''),
      NULLIF(row->>'element_text', ''),
      row->'previous_value',
      row->'new_value',
      NULLIF(row->>'duration', '')::integer,
      COALESCE((row->>'success')::boolean, true),
      NULLIF(row->>'error_message', ''),
      NULLIF(row->>'session_id', ''),
      row->'device_info'
    )
    RETURNING id INTO new_id;

    RETURN NEXT new_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_user_activity_logs_secure(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_user_activity_logs_secure(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_user_activity_logs_secure(jsonb) TO service_role;

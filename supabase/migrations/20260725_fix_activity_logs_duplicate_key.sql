-- Idempotent activity log inserts: retries with the same client-generated id
-- were raising duplicate-key errors and re-queuing forever.
CREATE OR REPLACE FUNCTION public.insert_user_activity_logs_secure(p_rows jsonb)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      id, user_id, user_name, user_email, user_role,
      activity_type, category, component, action, description, path,
      timestamp, metadata, element_id, element_text,
      previous_value, new_value, duration, success, error_message,
      session_id, device_info
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
    ON CONFLICT (id) DO NOTHING
    RETURNING id INTO new_id;

    IF new_id IS NOT NULL THEN
      RETURN NEXT new_id;
    ELSE
      -- Already existed from a prior sync attempt
      RETURN NEXT COALESCE(NULLIF(row->>'id', '')::uuid, gen_random_uuid());
    END IF;
  END LOOP;
END;
$function$;

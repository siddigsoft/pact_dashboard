-- Fix remaining production errors:
-- 1. audit_logs inserts missing required columns (module, description, etc.)
-- 2. Client notification inserts hitting RLS when session role is not 'authenticated'
-- 3. Legacy inserts bypassing column validation

-- ── Safety defaults on audit_logs ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_logs_apply_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.module IS NULL OR btrim(NEW.module) = '' THEN
    NEW.module := 'system';
  END IF;

  IF NEW.action IS NULL OR btrim(NEW.action) = '' THEN
    NEW.action := 'unknown';
  END IF;

  IF NEW.entity_type IS NULL OR btrim(NEW.entity_type) = '' THEN
    NEW.entity_type := 'unknown';
  END IF;

  IF NEW.entity_id IS NULL OR btrim(NEW.entity_id) = '' THEN
    NEW.entity_id := COALESCE(NEW.id::text, gen_random_uuid()::text);
  END IF;

  IF NEW.actor_id IS NULL OR btrim(NEW.actor_id) = '' THEN
    NEW.actor_id := COALESCE(auth.uid()::text, 'system');
  END IF;

  IF NEW.actor_name IS NULL OR btrim(NEW.actor_name) = '' THEN
    NEW.actor_name := 'System';
  END IF;

  IF NEW.description IS NULL OR btrim(NEW.description) = '' THEN
    NEW.description := NEW.action || ' on ' || NEW.entity_type;
  END IF;

  IF NEW.severity IS NULL OR btrim(NEW.severity) = '' THEN
    NEW.severity := 'info';
  END IF;

  IF NEW.success IS NULL THEN
    NEW.success := true;
  END IF;

  IF NEW.timestamp IS NULL THEN
    NEW.timestamp := NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_apply_defaults ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_apply_defaults
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_logs_apply_defaults();

-- ── Secure notification insert RPC (bypasses RLS for authenticated callers) ───
CREATE OR REPLACE FUNCTION public.insert_notifications_secure(p_rows jsonb)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row jsonb;
  new_id uuid;
  v_recipient uuid;
  v_title_en text;
  v_message_en text;
  v_event_type text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  FOR row IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    v_recipient := COALESCE(
      NULLIF(row->>'recipient_id', '')::uuid,
      NULLIF(row->>'user_id', '')::uuid
    );
    IF v_recipient IS NULL THEN
      RAISE EXCEPTION 'Each notification row requires recipient_id or user_id';
    END IF;

    v_title_en := COALESCE(NULLIF(row->>'title_en', ''), NULLIF(row->>'title', ''), 'Notification');
    v_message_en := COALESCE(NULLIF(row->>'message_en', ''), NULLIF(row->>'message', ''), '');
    v_event_type := COALESCE(NULLIF(row->>'event_type', ''), NULLIF(row->>'type', ''), 'system');

    INSERT INTO public.notifications (
      recipient_id,
      user_id,
      title_en,
      title_ar,
      message_en,
      message_ar,
      event_type,
      entity_id,
      entity_type,
      action_url,
      priority,
      status,
      title,
      message,
      type,
      link,
      related_entity_id,
      related_entity_type,
      is_read,
      metadata,
      created_at
    ) VALUES (
      v_recipient,
      COALESCE(NULLIF(row->>'user_id', '')::uuid, v_recipient),
      v_title_en,
      COALESCE(NULLIF(row->>'title_ar', ''), v_title_en),
      v_message_en,
      COALESCE(NULLIF(row->>'message_ar', ''), v_message_en),
      v_event_type,
      NULLIF(row->>'entity_id', ''),
      NULLIF(row->>'entity_type', ''),
      COALESCE(NULLIF(row->>'action_url', ''), NULLIF(row->>'link', '')),
      COALESCE(NULLIF(row->>'priority', ''), 'normal'),
      COALESCE(NULLIF(row->>'status', ''), 'pending'),
      v_title_en,
      v_message_en,
      COALESCE(NULLIF(row->>'type', ''), 'info'),
      COALESCE(NULLIF(row->>'action_url', ''), NULLIF(row->>'link', '')),
      NULLIF(row->>'related_entity_id', ''),
      NULLIF(row->>'related_entity_type', ''),
      COALESCE((row->>'is_read')::boolean, false),
      COALESCE(row->'metadata', '{}'::jsonb),
      COALESCE((row->>'created_at')::timestamptz, NOW())
    )
    RETURNING id INTO new_id;

    RETURN NEXT new_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_notifications_secure(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_notifications_secure(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_notifications_secure(jsonb) TO service_role;

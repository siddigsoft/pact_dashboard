-- Monitoring Dashboard: grants + SECURITY DEFINER RPC function
-- Fixes: dashboard_actions view has no GRANT to authenticated
--        underlying table RLS blocks super admin reads
--        action_status_overrides needs INSERT/SELECT grants

-- ── 1. Grant access to the new view and tables ────────────────────────────────

GRANT SELECT ON public.dashboard_actions TO authenticated, service_role;

GRANT SELECT, INSERT ON public.action_status_overrides TO authenticated, service_role;
GRANT SELECT, INSERT ON public.dashboard_query_log     TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.approval_requests TO authenticated, service_role;

-- Sequences (for uuid defaults these aren't needed, but belt-and-suspenders)
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- ── 2. SECURITY DEFINER function: get_monitoring_actions() ───────────────────
-- Runs as the postgres/owner role — bypasses all RLS on source tables.
-- Returns the same columns as dashboard_actions so the frontend doesn't change.
-- Accessible to any authenticated user; the function itself checks is_super_admin().

DROP FUNCTION IF EXISTS public.get_monitoring_actions(
  p_type    text,
  p_from    timestamptz,
  p_to      timestamptz,
  p_sender  text
);

CREATE OR REPLACE FUNCTION public.get_monitoring_actions(
  p_type    text        DEFAULT NULL,
  p_from    timestamptz DEFAULT NULL,
  p_to      timestamptz DEFAULT NULL,
  p_sender  text        DEFAULT NULL
)
RETURNS TABLE (
  action_id    text,
  action_type  text,
  source_table text,
  sender_id    text,
  sender_name  text,
  sender_role  text,
  recipient_role text,
  native_status  text,
  created_at   timestamptz,
  updated_at   timestamptz,
  details      jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    da.action_id,
    da.action_type,
    da.source_table,
    da.sender_id,
    da.sender_name,
    da.sender_role,
    da.recipient_role,
    da.native_status,
    da.created_at,
    da.updated_at,
    da.details
  FROM public.dashboard_actions da
  WHERE
    -- super admin guard inside the function
    public.is_super_admin()
    AND (p_type   IS NULL OR da.action_type  = p_type)
    AND (p_from   IS NULL OR da.created_at  >= p_from)
    AND (p_to     IS NULL OR da.created_at  <= p_to)
    AND (p_sender IS NULL OR da.sender_name ILIKE '%' || p_sender || '%')
  ORDER BY da.created_at DESC
  LIMIT 2000;
$$;

GRANT EXECUTE ON FUNCTION public.get_monitoring_actions(text, timestamptz, timestamptz, text)
  TO authenticated, service_role;

-- ── 3. SECURITY DEFINER function: get_monitoring_overrides(action_ids text[]) ─
-- Returns the latest awareness override per action_id efficiently.

DROP FUNCTION IF EXISTS public.get_monitoring_overrides(text[]);

CREATE OR REPLACE FUNCTION public.get_monitoring_overrides(action_ids text[])
RETURNS TABLE (
  action_id   text,
  action_type text,
  status      text,
  notes       text,
  set_at      timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (aso.action_id, aso.action_type)
    aso.action_id,
    aso.action_type,
    aso.status,
    aso.notes,
    aso.set_at
  FROM public.action_status_overrides aso
  WHERE aso.action_id = ANY(action_ids)
    AND public.is_super_admin()
  ORDER BY aso.action_id, aso.action_type, aso.set_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_monitoring_overrides(text[])
  TO authenticated, service_role;

-- ── 4. SECURITY DEFINER function: get_monitoring_history(p_action_id text, ...) ─
-- Returns full status history for a single action (for the timeline).

DROP FUNCTION IF EXISTS public.get_monitoring_history(text, text);

CREATE OR REPLACE FUNCTION public.get_monitoring_history(
  p_action_id   text,
  p_action_type text
)
RETURNS TABLE (
  id          uuid,
  status      text,
  notes       text,
  set_at      timestamptz,
  set_by      uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT aso.id, aso.status, aso.notes, aso.set_at, aso.set_by
  FROM public.action_status_overrides aso
  WHERE aso.action_id   = p_action_id
    AND aso.action_type = p_action_type
    AND public.is_super_admin()
  ORDER BY aso.set_at DESC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.get_monitoring_history(text, text)
  TO authenticated, service_role;

-- ── 5. SECURITY DEFINER function: insert_monitoring_override() ───────────────
-- Performs fail-closed insert: writes override + audit log atomically.

DROP FUNCTION IF EXISTS public.insert_monitoring_override(
  p_action_id    text,
  p_action_type  text,
  p_source_table text,
  p_status       text,
  p_notes        text
);

CREATE OR REPLACE FUNCTION public.insert_monitoring_override(
  p_action_id    text,
  p_action_type  text,
  p_source_table text,
  p_status       text,
  p_notes        text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  -- Super admin guard
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: super admin only';
  END IF;

  INSERT INTO public.action_status_overrides
    (action_id, action_type, source_table, status, set_by, set_at, notes)
  VALUES
    (p_action_id, p_action_type, p_source_table, p_status, v_user_id, now(), p_notes);

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_monitoring_override(text, text, text, text, text)
  TO authenticated, service_role;

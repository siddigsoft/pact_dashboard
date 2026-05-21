-- Remove the hardcoded LIMIT 2000 from get_monitoring_actions so the frontend
-- pagination (.range() calls) can page through ALL rows, not just the first 2000.

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
    public.is_super_admin()
    AND (p_type   IS NULL OR da.action_type  = p_type)
    AND (p_from   IS NULL OR da.created_at  >= p_from)
    AND (p_to     IS NULL OR da.created_at  <= p_to)
    AND (p_sender IS NULL OR da.sender_name ILIKE '%' || p_sender || '%')
  ORDER BY da.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_monitoring_actions(text, timestamptz, timestamptz, text)
  TO authenticated, service_role;

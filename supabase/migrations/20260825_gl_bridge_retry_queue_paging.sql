-- Page the approved unresolved queue so a recoverable failure does not fall
-- off the visible recent-audit log after additional bridge activity.
CREATE OR REPLACE FUNCTION public.get_unresolved_gl_bridge_errors_page(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  source_table text,
  source_id uuid,
  event_type text,
  status text,
  journal_entry_id uuid,
  error_message text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND lower(regexp_replace(coalesce(p.role, ''), '[^a-zA-Z]', '', 'g'))
        IN ('superadmin', 'admin', 'finance', 'financialadmin', 'accountant')
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT l.id, l.source_table, l.source_id, l.event_type, l.status,
         l.journal_entry_id, l.error_message, l.created_at
    FROM public.acct_gl_bridge_log l
   WHERE l.status = 'error' AND l.resolved_at IS NULL
   ORDER BY l.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_unresolved_gl_bridge_errors_page(integer, integer)
  TO authenticated;
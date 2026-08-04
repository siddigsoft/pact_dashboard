-- Batch forward/reclaim site entries with JSONB merge in one round-trip.
-- Replaces per-row select+update N+1 in mmpActions.ts

CREATE OR REPLACE FUNCTION public.forward_mmp_site_entries(
  p_ids uuid[],
  p_coordinator_id uuid,
  p_supervisor_id uuid DEFAULT NULL,
  p_current_user_id uuid DEFAULT NULL,
  p_state_id text DEFAULT NULL,
  p_attach_state_permit boolean DEFAULT false,
  p_notes text DEFAULT NULL,
  p_forwarded_at timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_patch jsonb;
  v_updated integer;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 OR p_coordinator_id IS NULL THEN
    RETURN 0;
  END IF;

  v_patch := jsonb_strip_nulls(jsonb_build_object(
    'assigned_to', p_coordinator_id,
    'assigned_by', p_current_user_id,
    'assigned_at', p_forwarded_at,
    'supervisor_id', p_supervisor_id,
    'notes', p_notes,
    'state_permit_attached', CASE WHEN p_attach_state_permit THEN true ELSE NULL END,
    'state_permit_state_id', CASE WHEN p_attach_state_permit THEN p_state_id ELSE NULL END,
    'state_permit_attached_at', CASE WHEN p_attach_state_permit THEN p_forwarded_at ELSE NULL END
  ));

  UPDATE public.mmp_site_entries e
  SET
    status = 'Pending',
    forwarded_by_user_id = p_current_user_id,
    forwarded_to_user_id = p_coordinator_id,
    forwarded_at = p_forwarded_at,
    dispatched_by = p_current_user_id,
    dispatched_at = p_forwarded_at,
    additional_data = COALESCE(e.additional_data, '{}'::jsonb) || v_patch
  WHERE e.id = ANY (p_ids);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.reclaim_mmp_site_entries(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.mmp_site_entries e
  SET
    status = 'verified',
    forwarded_to_user_id = NULL,
    forwarded_by_user_id = NULL,
    forwarded_at = NULL,
    dispatched_by = NULL,
    dispatched_at = NULL,
    additional_data = COALESCE(e.additional_data, '{}'::jsonb)
      - 'assigned_to'
      - 'assigned_by'
      - 'assigned_at'
      - 'supervisor_id'
      - 'notes'
      - 'state_permit_attached'
      - 'state_permit_state_id'
      - 'state_permit_attached_at'
  WHERE e.id = ANY (p_ids);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.forward_mmp_site_entries(uuid[], uuid, uuid, uuid, text, boolean, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reclaim_mmp_site_entries(uuid[]) TO authenticated;

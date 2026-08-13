-- Security-definer RPC for dispatching a campaign village site entry.
-- Only coordinator, admin, and superAdmin roles may dispatch.
-- The UPDATE is scoped to rows where dispatched_at IS NULL — entries that
-- have already been dispatched (and possibly claimed/completed) are
-- intentionally skipped so the lifecycle cannot be overwritten from the UI.
-- RETURNING id proves the row was actually updated; a NULL result means the
-- entry was not found, already dispatched, or in a non-dispatchable state.

CREATE OR REPLACE FUNCTION dispatch_campaign_site_entry(
  p_site_id        uuid,
  p_additional_data jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role        text;
  v_now         timestamptz := now();
  v_updated_id  uuid;
BEGIN
  -- ── Authorization ─────────────────────────────────────────────────────────
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();

  -- Normalise: strip spaces, lowercase. Accepts superAdmin/super_admin/admin/coordinator.
  IF LOWER(REPLACE(COALESCE(v_role, ''), ' ', '')) NOT IN (
    'superadmin', 'super_admin', 'admin', 'coordinator'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Unauthorized: coordinator or admin role required'
    );
  END IF;

  -- ── Dispatch (only if not yet dispatched) ─────────────────────────────────
  UPDATE mmp_site_entries
  SET
    status          = 'Dispatched',
    dispatched_at   = v_now,
    dispatched_by   = auth.uid(),
    additional_data = COALESCE(p_additional_data, additional_data),
    updated_at      = v_now
  WHERE
    id             = p_site_id
    AND dispatched_at IS NULL         -- idempotency guard: never re-dispatch
  RETURNING id INTO v_updated_id;

  -- ── Result ────────────────────────────────────────────────────────────────
  IF v_updated_id IS NULL THEN
    -- Distinguish "already dispatched" from "not found"
    IF EXISTS (
      SELECT 1 FROM mmp_site_entries WHERE id = p_site_id AND dispatched_at IS NOT NULL
    ) THEN
      RETURN jsonb_build_object('success', false, 'message', 'Already dispatched');
    ELSE
      RETURN jsonb_build_object('success', false, 'message', 'Site entry not found or not in a dispatchable state');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success',       true,
    'site_id',       v_updated_id,
    'dispatched_at', v_now
  );
END;
$$;

-- Grant execute to authenticated users (authorization enforced inside the fn)
GRANT EXECUTE ON FUNCTION dispatch_campaign_site_entry(uuid, jsonb) TO authenticated;

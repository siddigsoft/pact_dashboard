-- v2 of dispatch_campaign_site_entry: adds the Approved-and-Costed lifecycle guard.
-- Environments where the v1 migration (20260813) already ran will receive this
-- CREATE OR REPLACE and the guard will take effect immediately.
--
-- Lifecycle: pending → (approve_campaign_site_entry) → Approved and Costed
--            → (dispatch_campaign_site_entry v2)      → Dispatched
-- Pending entries cannot be dispatched directly; the RPC now rejects them with
-- a clear error message so the UI surfaces the correct action to the user.

CREATE OR REPLACE FUNCTION dispatch_campaign_site_entry(
  p_site_id         uuid,
  p_additional_data jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role        text;
  v_normalized  text;
  v_now         timestamptz := now();
  v_updated_id  uuid;
BEGIN
  -- ── Authorization ─────────────────────────────────────────────────────────
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();

  -- Strip all non-alphanumeric characters and lowercase so variants like
  -- 'superAdmin', 'super_admin', 'Admin', 'coordinator' all match.
  v_normalized := LOWER(REGEXP_REPLACE(COALESCE(v_role, ''), '[^a-zA-Z0-9]', '', 'g'));

  IF v_normalized NOT IN (
    'superadmin',
    'admin',
    'coordinator',
    'fom',
    'fieldoperationmanager',
    'fieldoperationmanagerfom'   -- 'Field Operation Manager (FOM)'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Unauthorized: coordinator or admin role required'
    );
  END IF;

  -- ── Dispatch (only if Approved and Costed and not yet dispatched) ─────────
  -- Lifecycle guard: entries must transition through approval before dispatch.
  -- This prevents an authorized RPC caller from dispatching a pending entry
  -- directly, bypassing the cost approval step.
  UPDATE mmp_site_entries
  SET
    status          = 'Dispatched',
    dispatched_at   = v_now,
    dispatched_by   = auth.uid(),
    additional_data = COALESCE(p_additional_data, additional_data),
    updated_at      = v_now
  WHERE
    id             = p_site_id
    AND dispatched_at IS NULL              -- idempotency guard: never re-dispatch
    AND status     = 'Approved and Costed' -- lifecycle guard: must be approved first
  RETURNING id INTO v_updated_id;

  -- ── Result ────────────────────────────────────────────────────────────────
  IF v_updated_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM mmp_site_entries WHERE id = p_site_id AND dispatched_at IS NOT NULL
    ) THEN
      RETURN jsonb_build_object('success', false, 'message', 'Already dispatched');
    ELSIF EXISTS (
      SELECT 1 FROM mmp_site_entries
      WHERE id = p_site_id AND status != 'Approved and Costed' AND dispatched_at IS NULL
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Entry must be Approved and Costed before dispatch'
      );
    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Site entry not found or not in a dispatchable state'
      );
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

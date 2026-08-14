-- Security-definer RPC for approving a campaign village site entry.
-- Lifecycle: pending → Approved and Costed (this function)
--            Approved and Costed → Dispatched (dispatch_campaign_site_entry)
--
-- Only admin, FOM, and superAdmin roles may approve.
-- The UPDATE is restricted to rows with status = 'pending' to prevent
-- backward transitions from other lifecycle states (rejected, dispatched, etc.)

CREATE OR REPLACE FUNCTION approve_campaign_site_entry(
  p_site_id uuid
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

  -- Strip all non-alphanumeric characters and lowercase so variants like:
  --   'Admin', 'admin', 'super_admin', 'superAdmin',
  --   'Field Operation Manager (FOM)', 'fom', 'field operation manager'
  -- all resolve to a predictable, comparable form.
  v_normalized := LOWER(REGEXP_REPLACE(COALESCE(v_role, ''), '[^a-zA-Z0-9]', '', 'g'));

  IF v_normalized NOT IN (
    'superadmin',
    'admin',
    'fom',
    'fieldoperationmanager',
    'fieldoperationmanagerfom'   -- 'Field Operation Manager (FOM)'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Unauthorized: admin or FOM role required to approve cost entries'
    );
  END IF;

  -- ── Approve (only pending, undispatched entries) ───────────────────────────
  -- Strict status precondition: status must be 'pending'.
  -- This prevents authorized callers from moving rejected or other
  -- non-pending lifecycle states backward to Approved & Costed.
  -- dispatched_at IS NULL is a belt-and-suspenders guard; a dispatched entry
  -- can never have status='pending' after a correct lifecycle, but we check
  -- both to be safe.
  UPDATE mmp_site_entries
  SET
    status     = 'Approved and Costed',
    updated_at = v_now
  WHERE
    id           = p_site_id
    AND status   = 'pending'         -- strict: only genuine pending entries
    AND dispatched_at IS NULL        -- safety: never touch dispatched rows
  RETURNING id INTO v_updated_id;

  -- ── Result ────────────────────────────────────────────────────────────────
  IF v_updated_id IS NULL THEN
    -- Provide a meaningful error based on the entry's current state
    IF EXISTS (
      SELECT 1 FROM mmp_site_entries
      WHERE id = p_site_id AND status = 'Approved and Costed'
    ) THEN
      RETURN jsonb_build_object('success', false, 'message', 'Already approved');
    ELSIF EXISTS (
      SELECT 1 FROM mmp_site_entries
      WHERE id = p_site_id AND dispatched_at IS NOT NULL
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Entry is already dispatched — cannot change approval status'
      );
    ELSIF EXISTS (
      SELECT 1 FROM mmp_site_entries
      WHERE id = p_site_id AND status != 'pending'
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Entry is not in a pending state and cannot be approved'
      );
    ELSE
      RETURN jsonb_build_object('success', false, 'message', 'Site entry not found');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success',     true,
    'site_id',     v_updated_id,
    'approved_at', v_now
  );
END;
$$;

-- Grant execute to authenticated users (authorization enforced inside the function)
GRANT EXECUTE ON FUNCTION approve_campaign_site_entry(uuid) TO authenticated;

-- Fix: Ensure total cost uses provided p_total_cost parameter
-- This patch ensures that when claim_site_visit RPC is called with a calculated total cost,
-- that exact value is stored in the cost field instead of recalculating it

-- Drop existing function and recreate with corrected cost calculation
DROP FUNCTION IF EXISTS claim_site_visit(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION claim_site_visit(
  p_site_id UUID,
  p_user_id UUID,
  p_enumerator_fee NUMERIC DEFAULT NULL,
  p_total_cost NUMERIC DEFAULT NULL,
  p_classification_level TEXT DEFAULT NULL,
  p_role_scope TEXT DEFAULT NULL,
  p_fee_source TEXT DEFAULT 'default'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_site RECORD;
  v_user_name TEXT;
  v_result JSONB;
  v_fee NUMERIC;
  v_base_fee_cents INTEGER;
  v_multiplier NUMERIC;
  v_classification_level classification_level;
  v_role_scope classification_role_scope;
BEGIN
  -- Get user name for audit trail
  SELECT COALESCE(full_name, username, email) INTO v_user_name
  FROM profiles
  WHERE id = p_user_id;

  -- If enumerator_fee not provided, calculate from classification
  IF p_enumerator_fee IS NULL THEN
    -- Prefer provided classification params; otherwise fetch user's active classification
    IF p_classification_level IS NOT NULL THEN
      v_classification_level := p_classification_level::classification_level;
    END IF;
    IF p_role_scope IS NOT NULL THEN
      v_role_scope := p_role_scope::classification_role_scope;
    END IF;

    IF v_classification_level IS NULL OR v_role_scope IS NULL THEN
      SELECT classification_level, role_scope
      INTO v_classification_level, v_role_scope
      FROM user_classifications
      WHERE user_id = p_user_id
        AND is_active = true
        AND effective_from <= NOW()
        AND (effective_until IS NULL OR effective_until > NOW())
      ORDER BY effective_from DESC
      LIMIT 1;
    END IF;

    IF v_classification_level IS NOT NULL AND v_role_scope IS NOT NULL THEN
      -- Get fee structure for this classification
      SELECT site_visit_base_fee_cents, complexity_multiplier
      INTO v_base_fee_cents, v_multiplier
      FROM classification_fee_structures
      WHERE classification_level = v_classification_level
        AND role_scope = v_role_scope
        AND is_active = true
        AND effective_from <= NOW()
        AND (effective_until IS NULL OR effective_until > NOW())
      ORDER BY effective_from DESC
      LIMIT 1;

      IF v_base_fee_cents IS NOT NULL THEN
        -- Calculate fee: base_fee * multiplier = SDG (fees stored directly in SDG, not cents)
        v_fee := ROUND(v_base_fee_cents * COALESCE(v_multiplier, 1), 2);
      ELSE
        v_fee := 50; -- Default fee if no structure found
      END IF;
    ELSE
      v_fee := 50; -- Default fee if no classification
    END IF;
  ELSE
    v_fee := p_enumerator_fee;
    -- Keep provided classification info if any
    IF p_classification_level IS NOT NULL THEN
      v_classification_level := p_classification_level::classification_level;
    END IF;
    IF p_role_scope IS NOT NULL THEN
      v_role_scope := p_role_scope::classification_role_scope;
    END IF;
  END IF;

  -- Try to lock and claim the site atomically
  -- SKIP LOCKED ensures we don't wait if another transaction has the lock
  SELECT id, status, claimed_by, accepted_by, site_name, transport_fee
  INTO v_site
  FROM mmp_site_entries
  WHERE id = p_site_id
  FOR UPDATE SKIP LOCKED;

  -- Check if we got the lock (if not, another transaction has it)
  IF v_site IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CLAIM_IN_PROGRESS',
      'message', 'This site is currently being claimed by another user. Please try a different site.'
    );
  END IF;

  -- Verify site is in "Dispatched" status and not yet claimed
  IF LOWER(v_site.status) != 'dispatched' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_STATUS',
      'message', 'This site is no longer available for claiming. Status: ' || v_site.status
    );
  END IF;

  -- Check if already claimed (by accepted_by or claimed_by)
  IF v_site.claimed_by IS NOT NULL OR v_site.accepted_by IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_CLAIMED',
      'message', 'This site has already been claimed by another enumerator.'
    );
  END IF;

  -- All checks passed - claim the site with enumerator fee
  -- IMPORTANT: Use p_total_cost if provided, otherwise calculate from transport_fee + enumerator_fee
  UPDATE mmp_site_entries
  SET 
    status = 'Assigned',
    claimed_by = p_user_id,
    claimed_at = NOW(),
    accepted_by = p_user_id,
    accepted_at = NOW(),
    enumerator_fee = v_fee,
    cost = COALESCE(p_total_cost, COALESCE(v_site.transport_fee, 0) + v_fee),
    additional_data = COALESCE(additional_data, '{}'::jsonb) || jsonb_build_object(
      'claimed_by', v_user_name,
      'claimed_at', NOW()::TEXT,
      'claim_type', 'first_claim',
      'claim_fee_calculation', jsonb_build_object(
        'enumerator_fee', v_fee,
        'transport_budget', COALESCE(v_site.transport_fee, 0),
        'total_payout', COALESCE(p_total_cost, COALESCE(v_site.transport_fee, 0) + v_fee),
        'classification_level', COALESCE(p_classification_level, (v_classification_level::text)),
        'role_scope', COALESCE(p_role_scope, (v_role_scope::text)),
        'fee_source', COALESCE(p_fee_source, 'classification'),
        'calculated_at', NOW()::TEXT,
        'calculated_for_user', p_user_id::TEXT
      )
    )
  WHERE id = p_site_id;

  -- Create notification for the claimer
  INSERT INTO notifications (user_id, title, message, type, link, related_entity_id, related_entity_type)
  VALUES (
    p_user_id,
    'Site Claimed Successfully',
    'You have successfully claimed site "' || COALESCE(v_site.site_name, 'Unknown') || '". Fee: ' || v_fee || ' SDG',
    'success',
    '/site-visits?status=assigned',
    p_site_id,
    'mmpFile'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Site claimed successfully! You are now assigned to this site.',
    'site_name', v_site.site_name,
    'enumerator_fee', v_fee,
    'total_payout', COALESCE(p_total_cost, COALESCE(v_site.transport_fee, 0) + v_fee)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SYSTEM_ERROR',
      'message', 'An unexpected error occurred: ' || SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users (only in environments where role exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION claim_site_visit(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) TO authenticated';
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON FUNCTION claim_site_visit IS 'Atomically claim a dispatched site for a user with classification-based fee calculation. Uses row-level locking to prevent race conditions. Stores the provided p_total_cost in the cost field to ensure calculated fees are persisted accurately.';

-- Migration: Add confirmation deadline to claim RPC
-- Description: Sets autorelease_at to 2 days before visit_date when claiming
-- Date: 2025-12-01

BEGIN;

-- Update the claim_site_visit function to set autorelease_at
CREATE OR REPLACE FUNCTION public.claim_site_visit(
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
  v_autorelease_at TIMESTAMPTZ;
BEGIN
  -- Get user name for audit trail
  SELECT COALESCE(full_name, username, email) INTO v_user_name
  FROM public.profiles
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
      FROM public.user_classifications
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
      FROM public.classification_fee_structures
      WHERE classification_level = v_classification_level
        AND role_scope = v_role_scope
        AND is_active = true
        AND valid_from <= NOW()
        AND (valid_until IS NULL OR valid_until > NOW())
      ORDER BY valid_from DESC
      LIMIT 1;

      IF v_base_fee_cents IS NOT NULL THEN
        -- Calculate fee: base_fee * multiplier (fees stored in SDG)
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
  SELECT id, status, claimed_by, accepted_by, site_name, transport_fee, visit_date
  INTO v_site
  FROM public.mmp_site_entries
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

  -- Calculate autorelease_at: 2 days before visit_date
  IF v_site.visit_date IS NOT NULL THEN
    v_autorelease_at := v_site.visit_date - INTERVAL '2 days';
  ELSE
    -- Fallback: 2 days from now if no visit_date
    v_autorelease_at := NOW() + INTERVAL '2 days';
  END IF;

  -- All checks passed - claim the site with enumerator fee and autorelease deadline
  UPDATE public.mmp_site_entries
  SET
    status = 'claimed',
    claimed_by = p_user_id,
    claimed_at = NOW(),
    enumerator_fee = v_fee,
    cost = COALESCE(p_total_cost, COALESCE(v_site.transport_fee, 0) + v_fee),
    additional_data = COALESCE(additional_data, '{}'::jsonb) || jsonb_build_object(
      'claimed_by', v_user_name,
      'claimed_at', NOW()::TEXT,
      'claim_type', 'first_claim',
      'autorelease_at', v_autorelease_at::TEXT,
      'confirmation_deadline', v_autorelease_at::TEXT,
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
  INSERT INTO public.notifications (user_id, title, message, type, link, related_entity_id, related_entity_type)
  VALUES (
    p_user_id,
    'Site Claimed Successfully',
    'You have successfully claimed site "' || COALESCE(v_site.site_name, 'Unknown') || '". Please accept the assignment within 2 days to proceed. Fee: ' || v_fee || ' SDG',
    'success',
    '/site-visits?status=claimed',
    p_site_id,
    'mmpSiteEntry'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Site claimed successfully! Please accept the assignment within 2 days to proceed.',
    'site_id', p_site_id,
    'site_name', v_site.site_name,
    'enumerator_fee', v_fee,
    'transport_fee', COALESCE(v_site.transport_fee, 0),
    'total_payout', COALESCE(v_site.transport_fee, 0) + v_fee,
    'claimed_at', NOW()::TEXT,
    'autorelease_at', v_autorelease_at::TEXT
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.claim_site_visit(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.claim_site_visit IS 'Atomic function to claim a dispatched site with race condition prevention, fee calculation, and 2-day confirmation deadline';

COMMIT;</content>
<parameter name="filePath">c:\Users\Kazibwe Francis Bant\Downloads\PACT_mobile\supabase\migrations\20251201_add_confirmation_deadline_to_claim.sql
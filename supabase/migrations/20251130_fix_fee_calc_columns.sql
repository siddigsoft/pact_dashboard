-- Migration: Fix fee calculation to use effective_from/effective_until columns
-- Purpose: Ensure DB-side calculation stores enumerator_fee on assignment/accept/claim
-- Safe to run multiple times.

BEGIN;

-- 1) Ensure trigger function uses effective_from/effective_until
CREATE OR REPLACE FUNCTION public.ensure_fee_on_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_level classification_level;
  v_scope classification_role_scope;
  v_base INTEGER;
  v_mult NUMERIC;
  v_fee NUMERIC;
  v_fee_source TEXT;
  v_transport NUMERIC;
  v_has_details BOOLEAN;
BEGIN
  -- Only act when site is taken and has an owner
  IF (LOWER(COALESCE(NEW.status,'')) IN ('assigned','accepted')) AND NEW.accepted_by IS NOT NULL THEN
    v_transport := COALESCE(NEW.transport_fee, 0);

    -- Detect if details already exist to avoid overwriting RPC results
    v_has_details := COALESCE( (COALESCE(NEW.additional_data, '{}'::jsonb) ? 'claim_fee_calculation'), false);

    -- Always calculate fee from classification for the assigned/accepted user
    SELECT classification_level, role_scope
    INTO v_level, v_scope
    FROM user_classifications
    WHERE user_id::text = NEW.accepted_by
      AND is_active = true
      AND effective_from <= NOW()
      AND (effective_until IS NULL OR effective_until > NOW())
    ORDER BY effective_from DESC
    LIMIT 1;

    IF v_level IS NOT NULL AND v_scope IS NOT NULL THEN
      SELECT site_visit_base_fee_cents, complexity_multiplier
      INTO v_base, v_mult
      FROM classification_fee_structures
      WHERE classification_level = v_level
        AND role_scope = v_scope
        AND is_active = true
        AND effective_from <= NOW()
        AND (effective_until IS NULL OR effective_until > NOW())
      ORDER BY effective_from DESC
      LIMIT 1;

      IF v_base IS NOT NULL THEN
        v_fee := ROUND(COALESCE(v_base,0) * COALESCE(v_mult, 1), 2);
        v_fee_source := 'classification';
      ELSE
        v_fee := 50;
        v_fee_source := 'default';
      END IF;
    ELSE
      v_fee := 50;
      v_fee_source := 'default';
    END IF;

    NEW.enumerator_fee := v_fee;

    -- Ensure total cost if missing
    IF (NEW.cost IS NULL OR NEW.cost <= 0) THEN
      NEW.cost := COALESCE(NEW.enumerator_fee, 0) + v_transport;
    END IF;

    -- Only write details if absent to avoid overwriting RPC's info
    IF NOT v_has_details THEN
      NEW.additional_data := COALESCE(NEW.additional_data, '{}'::jsonb)
        || jsonb_build_object(
          'claim_fee_calculation', jsonb_build_object(
            'enumerator_fee', NEW.enumerator_fee,
            'transport_budget', v_transport,
            'total_payout', NEW.cost,
            'classification_level', COALESCE((v_level::text), NULL),
            'role_scope', COALESCE((v_scope::text), NULL),
            'fee_source', v_fee_source,
            'calculated_at', NOW()::text,
            'calculated_for_user', NEW.accepted_by
          )
        );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger to ensure it points to the updated function
DROP TRIGGER IF EXISTS trg_fee_on_assignment_biu ON public.mmp_site_entries;
CREATE TRIGGER trg_fee_on_assignment_biu
BEFORE INSERT OR UPDATE OF status, accepted_by, enumerator_fee, transport_fee, cost
ON public.mmp_site_entries
FOR EACH ROW
EXECUTE FUNCTION public.ensure_fee_on_assignment();

-- 2) Fix claim RPC to use effective_from/effective_until
DROP FUNCTION IF EXISTS claim_site_visit(UUID, UUID);

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
  SELECT COALESCE(full_name, username, email) INTO v_user_name
  FROM profiles
  WHERE id = p_user_id;

  IF p_enumerator_fee IS NULL THEN
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
        v_fee := ROUND(v_base_fee_cents * COALESCE(v_multiplier, 1), 2);
      ELSE
        v_fee := 50;
      END IF;
    ELSE
      v_fee := 50;
    END IF;
  ELSE
    v_fee := p_enumerator_fee;
    IF p_classification_level IS NOT NULL THEN
      v_classification_level := p_classification_level::classification_level;
    END IF;
    IF p_role_scope IS NOT NULL THEN
      v_role_scope := p_role_scope::classification_role_scope;
    END IF;
  END IF;

  SELECT id, status, claimed_by, accepted_by, site_name, transport_fee
  INTO v_site
  FROM mmp_site_entries
  WHERE id = p_site_id
  FOR UPDATE SKIP LOCKED;

  IF v_site IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CLAIM_IN_PROGRESS',
      'message', 'This site is currently being claimed by another user. Please try a different site.'
    );
  END IF;

  IF LOWER(v_site.status) != 'dispatched' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_STATUS',
      'message', 'This site is no longer available for claiming. Status: ' || v_site.status
    );
  END IF;

  IF v_site.claimed_by IS NOT NULL OR v_site.accepted_by IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_CLAIMED',
      'message', 'This site has already been claimed by another enumerator.'
    );
  END IF;

  UPDATE mmp_site_entries
  SET 
    status = 'Accepted',
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

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Site claimed successfully! You are now assigned to this site.',
    'site_name', v_site.site_name,
    'enumerator_fee', v_fee,
    'total_payout', COALESCE(v_site.transport_fee, 0) + v_fee
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

-- Grant execute to authenticated if role exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION claim_site_visit(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) TO authenticated';
  END IF;
END $$;

COMMIT;

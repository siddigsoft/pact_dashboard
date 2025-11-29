-- Ensure calculated enumerator fee and total cost are stored when a site is taken (Assigned/Accepted)
-- Adds a trigger that computes and persists enumerator_fee, cost, and claim_fee_calculation details

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

    -- Calculate fee only if missing or zero; otherwise keep provided value
    IF (NEW.enumerator_fee IS NULL OR NEW.enumerator_fee <= 0) THEN
      -- Try to get user's active classification using accepted_by (stored as text)
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
          -- Fees are stored in SDG despite column name *_cents
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
    ELSE
      v_fee := NEW.enumerator_fee;
      v_fee_source := 'provided';
    END IF;

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

-- Create trigger: before insert or before updates that affect assignment/acceptance
DROP TRIGGER IF EXISTS trg_fee_on_assignment_biu ON public.mmp_site_entries;
CREATE TRIGGER trg_fee_on_assignment_biu
BEFORE INSERT OR UPDATE OF status, accepted_by, enumerator_fee, transport_fee, cost
ON public.mmp_site_entries
FOR EACH ROW
EXECUTE FUNCTION public.ensure_fee_on_assignment();

-- Optional backfill: populate fee/cost/details for already taken sites missing them
-- (Using a no-op update to invoke the BEFORE UPDATE trigger)
DO $$
BEGIN
  -- Touch a tracked column to ensure the UPDATE OF trigger fires even if values don't change
  UPDATE public.mmp_site_entries m
  SET cost = m.cost
  WHERE (LOWER(COALESCE(m.status,'')) IN ('assigned','accepted'))
    AND m.accepted_by IS NOT NULL
    AND (
      m.enumerator_fee IS NULL OR m.enumerator_fee <= 0 OR
      m.cost IS NULL OR m.cost <= 0 OR
      NOT COALESCE(m.additional_data, '{}'::jsonb) ? 'claim_fee_calculation'
    );
END $$;

-- Sync calculated fee details to site_visits when a site is taken (Assigned/Accepted)
-- This mirrors mmp_site_entries fee values and details into site_visits.fees/enumerator_fee/transport_fee/cost

CREATE OR REPLACE FUNCTION public.sync_site_visits_fees_on_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_calc jsonb;
  v_enum NUMERIC;
  v_trans NUMERIC;
  v_total NUMERIC;
  v_level TEXT;
  v_scope TEXT;
  v_source TEXT;
  v_calc_at TEXT;
  v_calc_user TEXT;
BEGIN
  -- Only act when the site has been taken
  IF (LOWER(COALESCE(NEW.status,'')) IN ('assigned','accepted')) AND NEW.accepted_by IS NOT NULL THEN
    v_calc := COALESCE(NEW.additional_data->'claim_fee_calculation', '{}'::jsonb);

    v_enum := COALESCE(NEW.enumerator_fee, (v_calc->>'enumerator_fee')::numeric, 0);
    v_trans := COALESCE(NEW.transport_fee, (v_calc->>'transport_budget')::numeric, 0);
    v_total := COALESCE(NEW.cost, (v_calc->>'total_payout')::numeric, v_enum + v_trans);

    v_level := NULLIF(COALESCE(v_calc->>'classification_level', NULL), '');
    v_scope := NULLIF(COALESCE(v_calc->>'role_scope', NULL), '');
    v_source := COALESCE(v_calc->>'fee_source', 'classification');
    v_calc_at := COALESCE(v_calc->>'calculated_at', NOW()::text);
    v_calc_user := COALESCE(v_calc->>'calculated_for_user', NEW.accepted_by);

    -- Update site_visits if exists for this mmp_site_entry
    UPDATE public.site_visits sv
    SET
      enumerator_fee = v_enum,
      transport_fee = v_trans,
      cost = v_total,
      fees = COALESCE(sv.fees, '{}'::jsonb) || jsonb_build_object(
        'enumerator_fee', v_enum,
        'transport_budget', v_trans,
        'total_payout', v_total,
        'classification_level', v_level,
        'role_scope', v_scope,
        'fee_source', v_source,
        'calculated_at', v_calc_at,
        'calculated_for_user', v_calc_user,
        'currency', 'SDG'
      )
    WHERE sv.mmp_site_entry_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Create AFTER trigger so it runs after ensure_fee_on_assignment populated NEW values
DROP TRIGGER IF EXISTS trg_sync_site_visits_fees_aft ON public.mmp_site_entries;
CREATE TRIGGER trg_sync_site_visits_fees_aft
AFTER INSERT OR UPDATE OF status, accepted_by, enumerator_fee, transport_fee, cost
ON public.mmp_site_entries
FOR EACH ROW
EXECUTE FUNCTION public.sync_site_visits_fees_on_assignment();

-- Optional backfill: mirror fees to site_visits for already taken sites
DO $$
BEGIN
  -- Touch a tracked column to ensure the AFTER UPDATE OF trigger fires
  UPDATE public.mmp_site_entries m
  SET cost = m.cost
  WHERE (LOWER(COALESCE(m.status,'')) IN ('assigned','accepted'))
    AND m.accepted_by IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.site_visits sv WHERE sv.mmp_site_entry_id = m.id
    );
END $$;

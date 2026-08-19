-- =============================================================================
-- Cycle Close Redirect — confirmation-only legacy Finance review
-- =============================================================================
-- Finance no longer types an amount into the legacy Redirect review. The exact
-- amount is derived from the current fee site and then passed through the
-- existing strict journal/advance/fee/provenance validation before any review
-- record can be created.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.review_legacy_redirect_fee_snapshot(
  p_action_id uuid,
  p_reason text,
  p_confirm_review boolean,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_derived_gross_fee numeric;
BEGIN
  SELECT round(
    coalesce(site.enumerator_fee, 0) + coalesce(site.transport_fee, 0),
    2
  )
  INTO v_derived_gross_fee
  FROM public.cycle_exception_actions action
  JOIN public.mmp_site_entries site
    ON site.id = action.mmp_site_entry_id
  WHERE action.id = p_action_id;

  IF v_derived_gross_fee IS NULL OR v_derived_gross_fee <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'The current fee record has no valid amount to recall.'
    );
  END IF;

  RETURN public.review_legacy_redirect_fee_snapshot(
    p_action_id,
    v_derived_gross_fee,
    0,
    v_derived_gross_fee,
    0,
    p_reason,
    p_confirm_review,
    p_idempotency_key
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_legacy_redirect_fee_snapshot(
  uuid, text, boolean, text
) TO authenticated;

COMMENT ON FUNCTION public.review_legacy_redirect_fee_snapshot(uuid, text, boolean, text) IS
  'Confirmation-only Finance review. Derives the recall amount from the locked current fee record and delegates to strict legacy Redirect validation.';

COMMIT;
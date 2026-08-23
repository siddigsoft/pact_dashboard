-- Revert an Operational Cost Submission approval tier without leaving an
-- active Pre-Fund payment behind. Payment reversal and tier reset are one
-- transaction: if either step fails, neither change is committed.

BEGIN;

CREATE OR REPLACE FUNCTION public.revert_operational_cost_tier_atomically_rpc(
  p_source_ids UUID[],
  p_tier TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source RECORD;
  v_payment RECORD;
  v_source_count INTEGER;
  v_active_payment_count INTEGER;
  v_reversed_payment_source_count INTEGER := 0;
  v_unlink_result JSONB;
  v_role_key TEXT;
  v_submitter_role_key TEXT;
  v_is_service_role BOOLEAN := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
BEGIN
  p_tier := upper(trim(p_tier));
  IF p_tier NOT IN ('T1', 'T2', 'T3', 'T4') THEN
    RAISE EXCEPTION 'Unsupported approval tier "%".', p_tier;
  END IF;
  IF COALESCE(array_length(p_source_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'At least one operational cost source is required.';
  END IF;

  IF NOT v_is_service_role THEN
    SELECT regexp_replace(lower(coalesce(role, '')), '[^a-z]', '', 'g')
    INTO v_role_key
    FROM public.profiles
    WHERE id = auth.uid();

    IF COALESCE(v_role_key, '') NOT IN ('admin', 'administrator', 'superadmin', 'superadministrator')
       AND NOT public.is_super_admin(auth.uid())
    THEN
      RAISE EXCEPTION 'Access denied: only an Admin or Super Admin can revert an approval tier.';
    END IF;
  END IF;

  SELECT count(*) INTO v_source_count
  FROM public.operational_cost_submissions
  WHERE id = ANY(p_source_ids);
  IF v_source_count <> array_length(p_source_ids, 1) THEN
    RAISE EXCEPTION 'One or more operational cost sources do not exist.';
  END IF;

  -- Lock every source and linked active payment before deciding whether the
  -- revert is permitted. This prevents a concurrent payment from slipping
  -- through after the tier state is changed.
  FOR v_source IN
    SELECT id, status, submitter_role, tier1_status, tier2_status, tier3_status, tier4_status
    FROM public.operational_cost_submissions
    WHERE id = ANY(p_source_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    IF v_source.status = 'reconciled' THEN
      RAISE EXCEPTION 'Cannot revert %: source % is reconciled.', p_tier, v_source.id;
    END IF;

    -- Tier count is determined by the submitter role, never by nullable or
    -- defaulted tier fields. Historical rows can have a T4 default even when
    -- their workflow only has two or three tiers.
    v_submitter_role_key := regexp_replace(
      lower(coalesce(v_source.submitter_role, '')), '[^a-z]', '', 'g'
    );
    IF p_tier = 'T4'
       AND v_submitter_role_key NOT LIKE '%coordinator%'
       AND v_submitter_role_key NOT LIKE '%enumerator%'
       AND v_submitter_role_key NOT LIKE '%datacollector%'
       AND v_submitter_role_key NOT LIKE '%fieldstaff%'
       AND v_submitter_role_key NOT LIKE '%fieldworker%'
       AND v_submitter_role_key NOT LIKE '%fieldagent%'
    THEN
      RAISE EXCEPTION 'Cannot revert T4: source % does not use a four-tier approval workflow.', v_source.id;
    END IF;
    IF p_tier = 'T3'
       AND v_submitter_role_key NOT LIKE '%coordinator%'
       AND v_submitter_role_key NOT LIKE '%enumerator%'
       AND v_submitter_role_key NOT LIKE '%datacollector%'
       AND v_submitter_role_key NOT LIKE '%fieldstaff%'
       AND v_submitter_role_key NOT LIKE '%fieldworker%'
       AND v_submitter_role_key NOT LIKE '%fieldagent%'
       AND v_submitter_role_key NOT LIKE '%supervisor%'
    THEN
      RAISE EXCEPTION 'Cannot revert T3: source % does not use a three- or four-tier approval workflow.', v_source.id;
    END IF;

    -- Only the latest approved tier may be undone. Lower-tier rollback while
    -- a later approval remains would create an invalid approval chain.
    IF (p_tier = 'T4' AND COALESCE(v_source.tier4_status, '') <> 'approved')
       OR (p_tier = 'T3' AND (
         COALESCE(v_source.tier3_status, '') <> 'approved'
         OR COALESCE(v_source.tier4_status, '') = 'approved'
       ))
       OR (p_tier = 'T2' AND (
         COALESCE(v_source.tier2_status, '') <> 'approved'
         OR COALESCE(v_source.tier3_status, '') = 'approved'
         OR COALESCE(v_source.tier4_status, '') = 'approved'
       ))
       OR (p_tier = 'T1' AND (
         COALESCE(v_source.tier1_status, '') <> 'approved'
         OR COALESCE(v_source.tier2_status, '') = 'approved'
         OR COALESCE(v_source.tier3_status, '') = 'approved'
         OR COALESCE(v_source.tier4_status, '') = 'approved'
       ))
    THEN
      RAISE EXCEPTION 'Cannot revert %: source % is not approved at that tier.', p_tier, v_source.id;
    END IF;

    FOR v_payment IN
      SELECT payment.id, payment.reconciled
      FROM public.pre_fund_transactions AS payment
      WHERE payment.source_table = 'operational_cost_submissions'
        AND payment.source_id = v_source.id
        AND payment.transaction_type = 'payment'
        AND NOT EXISTS (
          SELECT 1
          FROM public.pre_fund_transactions AS reversal
          WHERE reversal.reversal_of_id = payment.id
        )
      ORDER BY payment.occurred_at, payment.id
      FOR UPDATE
    LOOP
      IF COALESCE(v_payment.reconciled, false) THEN
        RAISE EXCEPTION 'Cannot revert %: linked Pre-Fund payment % for source % is reconciled. Resolve it in Pre-Funding → Reconciliation first.',
          p_tier, v_payment.id, v_source.id;
      END IF;
    END LOOP;
  END LOOP;

  FOR v_source IN
    SELECT id
    FROM public.operational_cost_submissions
    WHERE id = ANY(p_source_ids)
    ORDER BY id
  LOOP
    SELECT count(*) INTO v_active_payment_count
    FROM public.pre_fund_transactions AS payment
    WHERE payment.source_table = 'operational_cost_submissions'
      AND payment.source_id = v_source.id
      AND payment.transaction_type = 'payment'
      AND NOT EXISTS (
        SELECT 1
        FROM public.pre_fund_transactions AS reversal
        WHERE reversal.reversal_of_id = payment.id
      );

    IF v_active_payment_count > 0 THEN
      v_unlink_result := public._unlink_pre_fund_payment_internal_rpc(
        'operational_cost_submissions', v_source.id
      );
      IF NOT COALESCE((v_unlink_result ->> 'success')::boolean, false) THEN
        RAISE EXCEPTION 'Unable to reverse linked payment for source %: %',
          v_source.id, COALESCE(v_unlink_result ->> 'error', 'unknown error');
      END IF;
      v_reversed_payment_source_count := v_reversed_payment_source_count + 1;
    END IF;

    UPDATE public.operational_cost_submissions
    SET payment_proof_url = NULL,
        payment_proof_notes = NULL,
        payment_proof_uploaded_at = NULL,
        amount_paid_cents = 0,
        paid_at = NULL,
        paid_by = NULL,
        tier1_status = CASE WHEN p_tier = 'T1' THEN 'pending' ELSE tier1_status END,
        tier1_approved_by = CASE WHEN p_tier = 'T1' THEN NULL ELSE tier1_approved_by END,
        tier1_approved_at = CASE WHEN p_tier = 'T1' THEN NULL ELSE tier1_approved_at END,
        tier1_notes = CASE WHEN p_tier = 'T1' THEN NULL ELSE tier1_notes END,
        tier2_status = CASE WHEN p_tier IN ('T1', 'T2') THEN 'pending' ELSE tier2_status END,
        tier2_approved_by = CASE WHEN p_tier IN ('T1', 'T2') THEN NULL ELSE tier2_approved_by END,
        tier2_approved_at = CASE WHEN p_tier IN ('T1', 'T2') THEN NULL ELSE tier2_approved_at END,
        tier2_notes = CASE WHEN p_tier IN ('T1', 'T2') THEN NULL ELSE tier2_notes END,
        tier3_status = CASE
          WHEN p_tier = 'T3' THEN 'pending'
          WHEN p_tier IN ('T1', 'T2') THEN NULL
          ELSE tier3_status
        END,
        tier3_approved_by = CASE WHEN p_tier IN ('T1', 'T2', 'T3') THEN NULL ELSE tier3_approved_by END,
        tier3_approved_at = CASE WHEN p_tier IN ('T1', 'T2', 'T3') THEN NULL ELSE tier3_approved_at END,
        tier3_notes = CASE WHEN p_tier IN ('T1', 'T2', 'T3') THEN NULL ELSE tier3_notes END,
        tier4_status = CASE
          WHEN p_tier = 'T4' THEN 'pending'
          WHEN p_tier IN ('T1', 'T2', 'T3') THEN NULL
          ELSE tier4_status
        END,
        tier4_approved_by = CASE WHEN p_tier IN ('T1', 'T2', 'T3', 'T4') THEN NULL ELSE tier4_approved_by END,
        tier4_approved_at = CASE WHEN p_tier IN ('T1', 'T2', 'T3', 'T4') THEN NULL ELSE tier4_approved_at END,
        tier4_notes = CASE WHEN p_tier IN ('T1', 'T2', 'T3', 'T4') THEN NULL ELSE tier4_notes END,
        status = CASE WHEN p_tier = 'T1' THEN 'pending' ELSE 'under_review' END,
        updated_at = now()
    WHERE id = v_source.id;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'source_count', v_source_count,
    'tier', p_tier,
    'reversed_payment_source_count', v_reversed_payment_source_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revert_operational_cost_tier_atomically_rpc(UUID[],TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revert_operational_cost_tier_atomically_rpc(UUID[],TEXT) TO authenticated;

COMMIT;
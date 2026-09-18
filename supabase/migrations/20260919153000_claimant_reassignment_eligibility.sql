-- Restrict claimant reassignment to active field users assigned to the site's
-- canonical state. This migration layers onto the existing reassignment RPC
-- without changing its financial settlement behavior.

CREATE OR REPLACE FUNCTION public.claimant_reassignment_role_allowed(
  p_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_profile_id
      AND p.is_active IS TRUE
      AND (
        regexp_replace(lower(coalesce(p.role, '')), '[^a-z0-9]', '', 'g')
          IN ('datacollector', 'fieldenumerator', 'collector', 'enumerator', 'coordinator')
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(p.additional_roles) = 'array'
                 THEN p.additional_roles ELSE '[]'::jsonb END
          ) role_entry
          WHERE regexp_replace(
            lower(coalesce(
              role_entry->>'role',
              CASE WHEN jsonb_typeof(role_entry) = 'string'
                   THEN role_entry #>> '{}' ELSE NULL END,
              ''
            )), '[^a-z0-9]', '', 'g'
          ) IN ('datacollector', 'fieldenumerator', 'collector', 'enumerator', 'coordinator')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.claimant_reassignment_state_matches(
  p_site_entry_id uuid,
  p_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mmp_site_entries site
    JOIN public.states state
      ON (
        state.id = (
          CASE WHEN site.state ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               THEN site.state::uuid ELSE NULL END
        )
        OR regexp_replace(lower(coalesce(state.name, '')), '[^a-z0-9]', '', 'g')
           = regexp_replace(lower(coalesce(site.state, '')), '[^a-z0-9]', '', 'g')
      )
    JOIN public.profiles profile ON profile.id = p_profile_id
    WHERE site.id = p_site_entry_id
      AND profile.state_id = state.id
  );
$$;

CREATE OR REPLACE FUNCTION public.claimant_reassignment_candidate_allowed(
  p_site_entry_id uuid,
  p_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.claimant_reassignment_role_allowed(p_profile_id)
     AND public.claimant_reassignment_state_matches(p_site_entry_id, p_profile_id)
     AND NOT EXISTS (
       SELECT 1
       FROM public.site_effective_claimants current_claim
       WHERE current_claim.site_entry_id = p_site_entry_id
         AND current_claim.effective_claimant_id = p_profile_id
     );
$$;

CREATE OR REPLACE FUNCTION public.list_claimant_reassignment_candidates(
  p_site_entry_id uuid
)
RETURNS TABLE(
  id uuid,
  display_name text,
  role text,
  state text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only an active Super Admin may list claimant replacements.';
  END IF;

  RETURN QUERY
  SELECT p.id,
         coalesce(nullif(p.full_name, ''), nullif(p.username, ''), p.email) AS display_name,
         coalesce(
           CASE
             WHEN regexp_replace(lower(coalesce(p.role, '')), '[^a-z0-9]', '', 'g')
               IN ('datacollector', 'fieldenumerator', 'collector', 'enumerator', 'coordinator')
             THEN p.role
           END,
           (
             SELECT role_entry->>'role'
             FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(p.additional_roles) = 'array'
                    THEN p.additional_roles ELSE '[]'::jsonb END
             ) role_entry
             WHERE regexp_replace(lower(coalesce(role_entry->>'role', '')), '[^a-z0-9]', '', 'g')
             IN ('datacollector', 'fieldenumerator', 'collector', 'enumerator', 'coordinator')
             LIMIT 1
           ),
           'Eligible field role'
         ) AS role,
         state.name AS state
  FROM public.profiles p
  JOIN public.states state ON state.id = p.state_id
  WHERE public.claimant_reassignment_candidate_allowed(p_site_entry_id, p.id)
  ORDER BY lower(coalesce(p.full_name, p.username, p.email));
END;
$$;

REVOKE ALL ON FUNCTION public.claimant_reassignment_role_allowed(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claimant_reassignment_state_matches(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claimant_reassignment_candidate_allowed(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_claimant_reassignment_candidates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_claimant_reassignment_candidates(uuid) TO authenticated;

-- Explicit private copy of the existing financial operation.  This is kept
-- separate from the legacy browser function so eligibility is enforced by the
-- wrapper without textual function-body patching or recursive calls.
CREATE OR REPLACE FUNCTION public.reassign_site_claimant_financial_core(
  p_site_entry_id uuid,
  p_new_claimant_id uuid,
  p_reason text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s public.mmp_site_entries%ROWTYPE;
  old_id uuid;
  new_profile public.profiles%ROWTYPE;
  existing public.site_claimant_reassignments%ROWTYPE;
  earning public.wallet_transactions%ROWTYPE;
  latest public.site_claimant_reassignments%ROWTYPE;
  old_wallet public.wallets%ROWTYPE;
  new_wallet public.wallets%ROWTYPE;
  debit_id uuid;
  credit_id uuid;
  amount bigint := 0;
  idem text := NULLIF(btrim(p_idempotency_key), '');
  settlement text := 'unpaid';
  old_before numeric;
  new_before numeric;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only an active Super Admin may reassign a claimant.';
  END IF;
  IF p_site_entry_id IS NULL OR p_new_claimant_id IS NULL
     OR NULLIF(btrim(p_reason), '') IS NULL OR length(btrim(p_reason)) < 5
     OR idem IS NULL THEN
    RAISE EXCEPTION 'A site, eligible claimant, and reason of at least 5 characters are required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'site_claimant_reassignment:' || p_site_entry_id::text, 0));
  SELECT * INTO existing FROM public.site_claimant_reassignments
    WHERE idempotency_key = idem;
  IF FOUND THEN
    IF existing.site_entry_id <> p_site_entry_id
       OR existing.new_claimant_id <> p_new_claimant_id THEN
      RAISE EXCEPTION 'Idempotency key fingerprint does not match this site and claimant.';
    END IF;
    RETURN jsonb_build_object('success', true, 'idempotent', true,
      'historical', true, 'reassignment_id', existing.id,
      'amount_cents', existing.amount_cents,
      'settlement_kind', existing.settlement_kind);
  END IF;

  SELECT * INTO s FROM public.mmp_site_entries WHERE id = p_site_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Site entry not found.'; END IF;
  SELECT r.new_claimant_id INTO old_id
  FROM public.site_claimant_reassignments r
  WHERE r.site_entry_id = s.id
  ORDER BY r.created_at DESC, r.id DESC LIMIT 1;
  IF old_id IS NULL AND s.accepted_by IS NOT NULL
     AND s.accepted_by::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN old_id := s.accepted_by::text::uuid; END IF;
  IF old_id IS NULL AND s.claimed_by IS NOT NULL
     AND s.claimed_by::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN old_id := s.claimed_by::text::uuid; END IF;
  IF old_id IS NULL THEN RAISE EXCEPTION 'This site has no claimant to reassign.'; END IF;
  IF old_id = p_new_claimant_id THEN RAISE EXCEPTION 'The new claimant must be different.'; END IF;
  SELECT * INTO latest FROM public.site_claimant_reassignments r
    WHERE r.site_entry_id = s.id ORDER BY r.created_at DESC, r.id DESC LIMIT 1;

  SELECT * INTO new_profile FROM public.profiles WHERE id = p_new_claimant_id;
  IF NOT FOUND OR COALESCE(new_profile.is_active, false) IS NOT TRUE
     OR NOT public.claimant_reassignment_candidate_allowed(s.id, p_new_claimant_id) THEN
    RAISE EXCEPTION 'The selected claimant is not an active same-state Data Collector or Coordinator.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.site_advance_applications a
             WHERE a.mmp_site_entry_id = s.id AND COALESCE(a.applied_cents, 0) > 0) THEN
    RAISE EXCEPTION 'This site has an advance offset; send it to Finance Reconciliation.';
  END IF;

  IF latest.original_earning_transaction_id IS NOT NULL THEN
    SELECT * INTO earning FROM public.wallet_transactions
      WHERE id = latest.original_earning_transaction_id;
  ELSE
    SELECT * INTO earning
    FROM public.wallet_transactions t
    WHERE (t.site_visit_id = s.id OR t.related_site_visit_id = s.id)
      AND t.status::text = 'posted'
      AND t.type::text IN ('earning', 'site_visit_fee')
      AND t.user_id = old_id
    ORDER BY t.created_at, t.id LIMIT 1;
  END IF;
  IF FOUND THEN
    IF (SELECT count(*) FROM public.wallet_transactions t
        WHERE (t.site_visit_id = s.id OR t.related_site_visit_id = s.id)
          AND t.status::text = 'posted'
          AND t.type::text IN ('earning', 'site_visit_fee')) <> 1 THEN
      RAISE EXCEPTION 'Ambiguous wallet settlement; send this case to Finance Reconciliation.';
    END IF;
    amount := COALESCE(NULLIF(earning.amount_cents, 0),
      round(COALESCE(earning.amount, 0) * 100)::bigint);
    IF amount <= 0 THEN RAISE EXCEPTION 'Invalid wallet earning; send this case to Finance Reconciliation.'; END IF;
    PERFORM 1 FROM public.wallets
      WHERE user_id IN (old_id, p_new_claimant_id)
      ORDER BY user_id FOR UPDATE;
    SELECT * INTO old_wallet FROM public.wallets WHERE user_id = old_id;
    SELECT * INTO new_wallet FROM public.wallets WHERE user_id = p_new_claimant_id;
    IF old_wallet.id IS NULL OR new_wallet.id IS NULL THEN
      RAISE EXCEPTION 'Both claimants must have wallets; send this case to Finance Reconciliation.';
    END IF;
    settlement := 'wallet_only';
    PERFORM set_config('app.claimant_reassignment', 'true', true);
    old_before := COALESCE(old_wallet.balance_cents, 0);
    new_before := COALESCE(new_wallet.balance_cents, 0);
    INSERT INTO public.wallet_transactions
      (wallet_id,user_id,amount_cents,currency,type,status,posted_at,memo,
       site_visit_id,related_site_visit_id,amount,balance_before,balance_after,
       created_by,metadata)
    VALUES (old_wallet.id,old_id,-amount,COALESCE(earning.currency,'SDG'),
      'adjustment_debit','posted',now(),'Claimant reassignment debit',
      s.id,s.id,-amount / 100.0,old_before / 100.0,(old_before-amount) / 100.0,auth.uid(),
      jsonb_build_object('reassignment_site_id',s.id,'reassignment_kind','claimant',
        'original_earning_transaction_id',earning.id,'compensating_side','debit',
        'reassignment_rpc_marker',true,'reassignment_new_claimant_id',p_new_claimant_id))
    RETURNING id INTO debit_id;
    INSERT INTO public.wallet_transactions
      (wallet_id,user_id,amount_cents,currency,type,status,posted_at,memo,
       site_visit_id,related_site_visit_id,amount,balance_before,balance_after,
       created_by,metadata)
    VALUES (new_wallet.id,p_new_claimant_id,amount,COALESCE(earning.currency,'SDG'),
      'adjustment_credit','posted',now(),'Claimant reassignment credit',
      s.id,s.id,amount / 100.0,new_before / 100.0,(new_before+amount) / 100.0,auth.uid(),
      jsonb_build_object('reassignment_site_id',s.id,'reassignment_kind','claimant',
        'original_earning_transaction_id',earning.id,'compensating_side','credit',
        'reassignment_rpc_marker',true,'reassignment_old_claimant_id',old_id))
    RETURNING id INTO credit_id;
    UPDATE public.wallet_transactions
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'compensating_transaction_id', credit_id)
    WHERE id = debit_id;
    UPDATE public.wallet_transactions
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'compensating_transaction_id', debit_id)
    WHERE id = credit_id;
  END IF;

  INSERT INTO public.site_claimant_reassignments
    (site_entry_id,old_claimant_id,new_claimant_id,reason,actor_id,
     original_earning_transaction_id,debit_transaction_id,credit_transaction_id,
     amount_cents,settlement_kind,idempotency_key,idempotency_site_entry_id,idempotency_new_claimant_id)
  VALUES (s.id,old_id,p_new_claimant_id,btrim(p_reason),auth.uid(),earning.id,
          debit_id,credit_id,amount,settlement,idem,s.id,p_new_claimant_id)
  RETURNING * INTO existing;

  INSERT INTO public.site_effective_claimant_projection (site_entry_id, effective_claimant_id)
  VALUES (s.id, p_new_claimant_id)
  ON CONFLICT (site_entry_id) DO UPDATE
  SET effective_claimant_id = EXCLUDED.effective_claimant_id, updated_at = now();

  INSERT INTO public.notifications (user_id,title,message,type,link,related_entity_id,related_entity_type)
  SELECT DISTINCT recipient, 'Site claimant changed',
    'A site claimant was changed. Reason: ' || btrim(p_reason),
    'info','/super-admin/data-management',s.id::text,'siteVisit'
  FROM (
    SELECT old_id AS recipient
    UNION SELECT p_new_claimant_id
    UNION SELECT NULLIF(s.additional_data ->> 'supervisor_id','')::uuid
    UNION SELECT p.id FROM public.profiles p
      WHERE lower(COALESCE(p.role,'')) IN ('supervisor','hubsupervisor','hub_supervisor')
        AND p.is_active IS TRUE
        AND (s.hub_office IS NULL OR p.hub_id = s.hub_office)
  ) recipients
  WHERE recipient IS NOT NULL;
  RETURN jsonb_build_object('success',true,'idempotent',false,
    'reassignment_id',existing.id,'amount_cents',amount,'settlement_kind',settlement);
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_site_claimant_financial_core(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;

-- The existing financial RPC remains the sole settlement implementation. This
-- wrapper is the only browser-callable entry point and performs eligibility,
-- fingerprint, and replay checks before invoking it in the same transaction.
CREATE OR REPLACE FUNCTION public.reassign_site_claimant_with_eligibility_rpc(
  p_site_entry_id uuid,
  p_new_claimant_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.site_claimant_reassignments%ROWTYPE;
  v_result jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only an active Super Admin may reassign a claimant.';
  END IF;
  IF p_site_entry_id IS NULL OR p_new_claimant_id IS NULL
     OR nullif(btrim(p_reason), '') IS NULL
     OR length(btrim(p_reason)) < 5
     OR nullif(btrim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'A site, eligible claimant, reason, and idempotency key are required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'site_claimant_reassignment:' || p_site_entry_id::text, 0));

  SELECT * INTO v_existing
  FROM public.site_claimant_reassignments
  WHERE idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_existing.site_entry_id <> p_site_entry_id
       OR v_existing.new_claimant_id <> p_new_claimant_id THEN
      RAISE EXCEPTION 'Idempotency key fingerprint does not match this site and claimant.';
    END IF;
    RETURN jsonb_build_object(
      'success', true, 'idempotent', true, 'historical', true,
      'reassignment_id', v_existing.id,
      'amount_cents', v_existing.amount_cents,
      'settlement_kind', v_existing.settlement_kind
    );
  END IF;

  IF NOT public.claimant_reassignment_candidate_allowed(
    p_site_entry_id, p_new_claimant_id
  ) THEN
    RAISE EXCEPTION 'The selected claimant must be an active same-state Data Collector or Coordinator and differ from the current claimant.';
  END IF;

  SELECT public.reassign_site_claimant_financial_core(
    p_site_entry_id, p_new_claimant_id, p_reason, btrim(p_idempotency_key)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_site_claimant_rpc(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reassign_site_claimant_with_eligibility_rpc(uuid,uuid,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_site_claimant_with_eligibility_rpc(uuid,uuid,text,text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
-- Migration: campaign claim authorization
-- Two changes:
-- 1. Patch claim_site_visit to reject village_campaign entries at the DB level
--    so the team-lead wrapper cannot be bypassed by calling the generic RPC directly.
-- 2. Create/replace claim_campaign_site_visit with fail-closed team_id handling.

-- ── 1. Patch claim_site_visit to block village_campaign rows ─────────────────
-- We CREATE OR REPLACE the function to add a guard as the very first step.
-- The rest of the body is identical to 20260725_fix_remaining_postgres_errors.sql.

CREATE OR REPLACE FUNCTION public.claim_site_visit(
  p_site_id              uuid,
  p_user_id              uuid,
  p_enumerator_fee       numeric  DEFAULT NULL,
  p_total_cost           numeric  DEFAULT NULL,
  p_classification_level text     DEFAULT NULL,
  p_role_scope           text     DEFAULT NULL,
  p_fee_source           text     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site           RECORD;
  v_user_name      TEXT;
  v_classification RECORD;
  v_fee_structure  RECORD;
  v_fee            NUMERIC;
  v_cl             TEXT;
  v_rs             TEXT;
  v_source         TEXT;
BEGIN
  -- Village campaign dispatch entries must be claimed through
  -- claim_campaign_site_visit, which enforces team-lead authorization.
  -- Blocking this here prevents bypassing the team-lead guard by calling
  -- the generic RPC directly.
  SELECT additional_data->>'source'
  INTO   v_source
  FROM   mmp_site_entries
  WHERE  id = p_site_id;

  IF v_source = 'village_campaign' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'VILLAGE_CAMPAIGN_RESTRICTED',
      'message', 'Village campaign assignments must be claimed through claim_campaign_site_visit.'
    );
  END IF;

  -- ── Existing logic (unchanged) ────────────────────────────────────────────

  SELECT COALESCE(full_name, username, 'Unknown') INTO v_user_name
  FROM profiles WHERE id = p_user_id;

  IF p_enumerator_fee IS NULL THEN
    SELECT classification_level, role_scope
    INTO v_classification
    FROM user_classifications
    WHERE user_id = p_user_id
      AND is_active = true
      AND (role_scope = 'dataCollector' OR role_scope = 'enumerator')
    ORDER BY effective_from DESC
    LIMIT 1;

    IF v_classification IS NOT NULL THEN
      SELECT site_visit_base_fee_cents, complexity_multiplier
      INTO v_fee_structure
      FROM classification_fee_structures
      WHERE classification_level = v_classification.classification_level
        AND role_scope = v_classification.role_scope
        AND is_active = true
        AND valid_from <= NOW()
        AND (valid_until IS NULL OR valid_until > NOW())
      ORDER BY valid_from DESC
      LIMIT 1;

      IF v_fee_structure IS NOT NULL THEN
        v_fee := ROUND(v_fee_structure.site_visit_base_fee_cents * v_fee_structure.complexity_multiplier, 2);
      ELSE
        v_fee := 50;
      END IF;
    ELSE
      v_fee := 50;
    END IF;
  ELSE
    v_fee := p_enumerator_fee;
  END IF;

  v_cl := p_classification_level;
  v_rs := p_role_scope;
  IF v_cl IS NULL OR v_rs IS NULL THEN
    SELECT classification_level::text, role_scope::text INTO v_cl, v_rs
    FROM user_classifications
    WHERE user_id = p_user_id
      AND is_active = true
      AND effective_from <= NOW()
      AND (effective_until IS NULL OR effective_until > NOW())
    ORDER BY effective_from DESC
    LIMIT 1;
  END IF;

  SELECT id, status, accepted_by, site_name, transport_fee
  INTO v_site
  FROM mmp_site_entries
  WHERE id = p_site_id
  FOR UPDATE SKIP LOCKED;

  IF v_site IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CLAIM_IN_PROGRESS',
      'message', 'This site is currently being claimed by another user.'
    );
  END IF;

  IF LOWER(v_site.status) != 'dispatched' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_STATUS',
      'message', 'This site is no longer available for claiming. Status: ' || v_site.status
    );
  END IF;

  IF v_site.accepted_by IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_CLAIMED',
      'message', 'This site has already been claimed by another enumerator.'
    );
  END IF;

  UPDATE mmp_site_entries
  SET
    status = 'Assigned',
    accepted_by = p_user_id::text,
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
        'classification_level', v_cl,
        'role_scope', v_rs,
        'fee_source', COALESCE(p_fee_source, 'classification'),
        'calculated_at', NOW()::TEXT,
        'calculated_for_user', p_user_id::TEXT
      )
    ),
    updated_at = NOW()
  WHERE id = p_site_id;

  INSERT INTO notifications (
    user_id, recipient_id, event_type, entity_type, entity_id,
    title_en, message_en, action_url, type, title, message, link,
    related_entity_id, related_entity_type
  )
  VALUES (
    p_user_id, p_user_id, 'assignments', 'siteVisit', p_site_id::text,
    'Site Claimed Successfully',
    'You have successfully claimed site "' || COALESCE(v_site.site_name, 'Unknown') || '". Fee: ' || v_fee || ' SDG',
    '/site-visits?status=assigned',
    'success',
    'Site Claimed Successfully',
    'You have successfully claimed site "' || COALESCE(v_site.site_name, 'Unknown') || '". Fee: ' || v_fee || ' SDG',
    '/site-visits?status=assigned',
    p_site_id::text,
    'mmpFile'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Site claimed successfully!',
    'site_name', v_site.site_name,
    'enumerator_fee', v_fee,
    'total_payout', COALESCE(p_total_cost, COALESCE(v_site.transport_fee, 0) + v_fee)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SYSTEM_ERROR',
      'message', 'An error occurred: ' || SQLERRM
    );
END;
$$;

-- ── 2. RESTRICTIVE RLS to block direct table-API updates on village_campaign rows ─
-- mmp_site_entries_update_combined is PERMISSIVE and effectively allows every
-- authenticated user.  A RESTRICTIVE policy is ANDed on top, so village_campaign
-- rows can only be updated by their assigned team lead, a coordinator/admin/fom/ict,
-- or a super_admin — all other authenticated users are rejected at the DB level,
-- closing the direct REST/PostgREST bypass.

DROP POLICY IF EXISTS mmp_site_entries_village_campaign_restrict ON public.mmp_site_entries;

CREATE POLICY mmp_site_entries_village_campaign_restrict
  ON public.mmp_site_entries
  FOR UPDATE
  AS RESTRICTIVE
  USING (
    -- Allow unrestricted updates to non-village-campaign rows
    COALESCE(additional_data->>'source', '') != 'village_campaign'
    -- Allow the assigned team lead
    OR EXISTS (
      SELECT 1 FROM adhoc_teams t
      WHERE t.id = (additional_data->>'team_id')::UUID
        AND t.team_lead_id = auth.uid()
    )
    -- Allow admin / coordinator / fom / ict via user_roles
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = ANY (ARRAY['admin','ict','coordinator','fom','super_admin'])
    )
    -- Allow admin / super_admin via profiles.role (covers the web admin hub)
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('Admin', 'SuperAdmin', 'ICT')
    )
  )
  WITH CHECK (
    COALESCE(additional_data->>'source', '') != 'village_campaign'
    OR EXISTS (
      SELECT 1 FROM adhoc_teams t
      WHERE t.id = (additional_data->>'team_id')::UUID
        AND t.team_lead_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = ANY (ARRAY['admin','ict','coordinator','fom','super_admin'])
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('Admin', 'SuperAdmin', 'ICT')
    )
  );

-- ── 3. Team-lead-gated wrapper for village campaign assignments ───────────────
-- Fails closed for any missing or invalid team_id in additional_data.
-- Delegates to the internal claim logic (copied inline to avoid recursion since
-- claim_site_visit now rejects village_campaign rows at the top).

CREATE OR REPLACE FUNCTION public.claim_campaign_site_visit(
  p_site_id              UUID,
  p_user_id              UUID,
  p_enumerator_fee       NUMERIC  DEFAULT NULL,
  p_total_cost           NUMERIC  DEFAULT NULL,
  p_classification_level TEXT     DEFAULT NULL,
  p_role_scope           TEXT     DEFAULT NULL,
  p_fee_source           TEXT     DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site           RECORD;
  v_additional_data JSONB;
  v_team_id        UUID;
  v_is_lead        BOOLEAN := false;
  v_user_name      TEXT;
  v_classification RECORD;
  v_fee_structure  RECORD;
  v_fee            NUMERIC;
  v_cl             TEXT;
  v_rs             TEXT;
BEGIN
  -- Caller must act as themselves.
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'UNAUTHORIZED',
      'message', 'You can only claim sites for yourself.'
    );
  END IF;

  -- Read the site row and lock it for update.
  SELECT id, status, accepted_by, site_name, transport_fee, additional_data
  INTO   v_site
  FROM   mmp_site_entries
  WHERE  id = p_site_id
  FOR UPDATE SKIP LOCKED;

  IF v_site IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'CLAIM_IN_PROGRESS',
      'message', 'This site is currently being claimed by another user.'
    );
  END IF;

  v_additional_data := COALESCE(v_site.additional_data, '{}'::jsonb);

  -- This RPC is only valid for village_campaign entries.
  IF (v_additional_data->>'source') IS DISTINCT FROM 'village_campaign' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'INVALID_TYPE',
      'message', 'This function is only for village campaign assignments.'
    );
  END IF;

  -- team_id must be present and valid — fail closed if missing or not a UUID.
  BEGIN
    v_team_id := (v_additional_data->>'team_id')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_team_id := NULL;
  END;

  IF v_team_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'NO_TEAM_ASSIGNED',
      'message', 'This village assignment has no team assigned and cannot be claimed.'
    );
  END IF;

  -- Verify the caller is the team lead for this team.
  SELECT EXISTS (
    SELECT 1
    FROM   adhoc_teams
    WHERE  id           = v_team_id
      AND  team_lead_id = p_user_id
  ) INTO v_is_lead;

  IF NOT v_is_lead THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'NOT_TEAM_LEAD',
      'message', 'You are not the team lead for this village assignment.'
    );
  END IF;

  -- Standard status checks.
  IF LOWER(v_site.status) != 'dispatched' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'INVALID_STATUS',
      'message', 'This site is no longer available for claiming. Status: ' || v_site.status
    );
  END IF;

  IF v_site.accepted_by IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'ALREADY_CLAIMED',
      'message', 'This site has already been claimed.'
    );
  END IF;

  -- Resolve fee.
  SELECT COALESCE(full_name, username, 'Unknown') INTO v_user_name
  FROM profiles WHERE id = p_user_id;

  IF p_enumerator_fee IS NULL THEN
    SELECT classification_level, role_scope
    INTO   v_classification
    FROM   user_classifications
    WHERE  user_id    = p_user_id
      AND  is_active  = true
      AND  (role_scope = 'dataCollector' OR role_scope = 'enumerator')
    ORDER BY effective_from DESC LIMIT 1;

    IF v_classification IS NOT NULL THEN
      SELECT site_visit_base_fee_cents, complexity_multiplier
      INTO   v_fee_structure
      FROM   classification_fee_structures
      WHERE  classification_level = v_classification.classification_level
        AND  role_scope           = v_classification.role_scope
        AND  is_active            = true
        AND  valid_from          <= NOW()
        AND  (valid_until IS NULL OR valid_until > NOW())
      ORDER BY valid_from DESC LIMIT 1;

      v_fee := CASE WHEN v_fee_structure IS NOT NULL
                 THEN ROUND(v_fee_structure.site_visit_base_fee_cents * v_fee_structure.complexity_multiplier, 2)
                 ELSE 50 END;
    ELSE
      v_fee := 50;
    END IF;
  ELSE
    v_fee := p_enumerator_fee;
  END IF;

  v_cl := p_classification_level;
  v_rs := p_role_scope;
  IF v_cl IS NULL OR v_rs IS NULL THEN
    SELECT classification_level::text, role_scope::text INTO v_cl, v_rs
    FROM   user_classifications
    WHERE  user_id   = p_user_id
      AND  is_active = true
      AND  effective_from <= NOW()
      AND  (effective_until IS NULL OR effective_until > NOW())
    ORDER BY effective_from DESC LIMIT 1;
  END IF;

  -- Perform the claim update.
  -- Use 'Accepted' directly (vs 'Assigned' in the generic RPC) so the
  -- mobile follow-up direct table update is not needed for village_campaign
  -- entries, reducing the surface area for direct-API mutations.
  UPDATE mmp_site_entries
  SET
    status          = 'Accepted',
    accepted_by     = p_user_id::text,
    accepted_at     = NOW(),
    enumerator_fee  = v_fee,
    cost            = COALESCE(p_total_cost, COALESCE(v_site.transport_fee, 0) + v_fee),
    additional_data = v_additional_data || jsonb_build_object(
      'claimed_by',           v_user_name,
      'claimed_at',           NOW()::TEXT,
      'claim_type',           'campaign_team_lead',
      'claim_fee_calculation', jsonb_build_object(
        'enumerator_fee',   v_fee,
        'transport_budget', COALESCE(v_site.transport_fee, 0),
        'total_payout',     COALESCE(p_total_cost, COALESCE(v_site.transport_fee, 0) + v_fee),
        'classification_level', v_cl,
        'role_scope',       v_rs,
        'fee_source',       COALESCE(p_fee_source, 'classification'),
        'calculated_at',    NOW()::TEXT,
        'calculated_for_user', p_user_id::TEXT
      )
    ),
    updated_at = NOW()
  WHERE id = p_site_id;

  INSERT INTO notifications (
    user_id, recipient_id, event_type, entity_type, entity_id,
    title_en, message_en, action_url, type, title, message, link,
    related_entity_id, related_entity_type
  )
  VALUES (
    p_user_id, p_user_id, 'assignments', 'siteVisit', p_site_id::text,
    'Village Assignment Claimed',
    'You have claimed the village assignment "' || COALESCE(v_site.site_name, 'Unknown') || '". Fee: ' || v_fee || ' SDG',
    '/site-visits?status=assigned',
    'success',
    'Village Assignment Claimed',
    'You have claimed the village assignment "' || COALESCE(v_site.site_name, 'Unknown') || '". Fee: ' || v_fee || ' SDG',
    '/site-visits?status=assigned',
    p_site_id::text,
    'mmpFile'
  );

  RETURN jsonb_build_object(
    'success',      true,
    'message',      'Village assignment claimed successfully!',
    'site_name',    v_site.site_name,
    'enumerator_fee', v_fee,
    'total_payout', COALESCE(p_total_cost, COALESCE(v_site.transport_fee, 0) + v_fee)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'SYSTEM_ERROR',
      'message', 'An error occurred: ' || SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_campaign_site_visit(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT, TEXT)
  TO authenticated;

COMMENT ON FUNCTION public.claim_campaign_site_visit IS
  'Team-lead-gated claim for village campaign dispatch entries. '
  'Validates auth.uid() = p_user_id, source = village_campaign, '
  'team_id present and valid, and adhoc_teams.team_lead_id = p_user_id. '
  'Fails closed if any check fails. '
  'claim_site_visit is patched in the same migration to reject village_campaign rows, '
  'so this is the only callable path for those entries.';

-- Fix remaining Postgres errors:
-- 1) mmp_files.last_reminder_sent missing (cycle reminders)
-- 2) profiles.hubs_assigned missing (old mobile clients)
-- 3) text = uuid comparisons (accepted_by / similar text cols vs uuid params)

-- ── 1) Cycle reminder column ─────────────────────────────────────────────────
ALTER TABLE public.mmp_files
  ADD COLUMN IF NOT EXISTS last_reminder_sent timestamptz;

-- ── 2) Compat column for old clients still selecting hubs_assigned ───────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hubs_assigned text[];

UPDATE public.profiles
SET hubs_assigned = ARRAY_REMOVE(ARRAY[hub_id, secondary_hub_id], NULL)
WHERE hubs_assigned IS NULL
   OR cardinality(hubs_assigned) = 0;

CREATE OR REPLACE FUNCTION public.sync_profiles_hubs_assigned()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.hubs_assigned := ARRAY_REMOVE(ARRAY[NEW.hub_id, NEW.secondary_hub_id], NULL);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profiles_hubs_assigned ON public.profiles;
CREATE TRIGGER trg_sync_profiles_hubs_assigned
  BEFORE INSERT OR UPDATE OF hub_id, secondary_hub_id
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profiles_hubs_assigned();

-- ── 3) Safe equality between text and uuid (stops 42883 on hot paths) ────────
CREATE OR REPLACE FUNCTION public.text_eq_uuid(text, uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$ SELECT $1 IS NOT DISTINCT FROM $2::text $$;

CREATE OR REPLACE FUNCTION public.uuid_eq_text(uuid, text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$ SELECT $1::text IS NOT DISTINCT FROM $2 $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_operator
    WHERE oprnamespace = 'public'::regnamespace
      AND oprleft = 'text'::regtype AND oprright = 'uuid'::regtype AND oprname = '='
  ) THEN
    CREATE OPERATOR public.= (
      LEFTARG = text,
      RIGHTARG = uuid,
      FUNCTION = public.text_eq_uuid
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_operator
    WHERE oprnamespace = 'public'::regnamespace
      AND oprleft = 'uuid'::regtype AND oprright = 'text'::regtype AND oprname = '='
  ) THEN
    CREATE OPERATOR public.= (
      LEFTARG = uuid,
      RIGHTARG = text,
      FUNCTION = public.uuid_eq_text
    );
  END IF;
END $$;

-- Prefer text-side compares in claim + coordinator helpers
CREATE OR REPLACE FUNCTION public.claim_site_visit(
  p_site_id uuid,
  p_user_id uuid,
  p_enumerator_fee numeric DEFAULT NULL,
  p_total_cost numeric DEFAULT NULL,
  p_classification_level text DEFAULT NULL,
  p_role_scope text DEFAULT NULL,
  p_fee_source text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site RECORD;
  v_user_name TEXT;
  v_classification RECORD;
  v_fee_structure RECORD;
  v_fee NUMERIC;
  v_cl TEXT;
  v_rs TEXT;
BEGIN
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

CREATE OR REPLACE FUNCTION public.get_coordinator_site_entries(p_user_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid, mmp_file_id uuid, mmp_name text, site_code text, hub_office text,
  state text, locality text, site_name text, cp_name text, visit_type text,
  visit_date text, main_activity text, activity_at_site text, monitoring_by text,
  survey_tool text, use_market_diversion boolean, use_warehouse_monitoring boolean,
  comments text, additional_data jsonb, status text,
  verified_at timestamptz, verified_by text, verification_notes text,
  cost numeric, enumerator_fee numeric, transport_fee numeric,
  accepted_by text, accepted_at timestamptz, forwarded_to_user_id uuid, created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id, e.mmp_file_id, f.name AS mmp_name,
    e.site_code, e.hub_office, e.state, e.locality, e.site_name, e.cp_name,
    e.visit_type, e.visit_date, e.main_activity, e.activity_at_site,
    e.monitoring_by, e.survey_tool, e.use_market_diversion, e.use_warehouse_monitoring,
    e.comments, e.additional_data, e.status,
    e.verified_at, e.verified_by, e.verification_notes,
    e.cost, e.enumerator_fee, e.transport_fee,
    e.accepted_by, e.accepted_at, e.forwarded_to_user_id, e.created_at
  FROM mmp_site_entries e
  JOIN mmp_files f ON f.id = e.mmp_file_id
  WHERE (
    p_user_id IS NULL
    OR e.forwarded_to_user_id = p_user_id
    OR (e.additional_data->>'assigned_to') = p_user_id::text
    OR e.accepted_by = p_user_id::text
  );
$$;

-- Safer delete policy: compare as text (invalid accepted_by no longer blows up ::uuid cast)
DROP POLICY IF EXISTS mmp_site_entries_delete_combined ON public.mmp_site_entries;
CREATE POLICY mmp_site_entries_delete_combined
  ON public.mmp_site_entries
  FOR DELETE
  TO authenticated
  USING (
    accepted_by = ((SELECT auth.uid())::text)
    OR accepted_by IS NULL
    OR is_admin_or_super()
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = ANY (ARRAY['admin'::text, 'ict'::text, 'coordinator'::text, 'fom'::text])
    )
  );

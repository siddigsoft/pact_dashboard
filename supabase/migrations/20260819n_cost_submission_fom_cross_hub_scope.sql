-- Normalize FOM role aliases for Cost Submission cross-hub visibility.
--
-- The client authorization layer recognizes canonical and legacy FOM labels,
-- but the earlier SQL policy/RPC compared profiles.role to a short exact list.
-- A profile such as "field_operation_manager" could therefore appear as an FOM
-- in the UI while the SECURITY DEFINER RPC returned only hub-scoped/own rows.

BEGIN;

DROP POLICY IF EXISTS
  "Supervisors and FOM can view operational cost submissions"
  ON public.operational_cost_submissions;

CREATE POLICY "Supervisors and FOM can view operational cost submissions"
  ON public.operational_cost_submissions
  FOR SELECT
  USING (
    submitted_by = auth.uid()
    OR
    -- FOM and Country Director: see all submissions regardless of hub.
    EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.id = auth.uid()
        AND lower(regexp_replace(coalesce(profile.role, ''), '[^a-z]', '', 'g'))
          IN ('fom', 'fieldoperationmanager', 'countrydirector')
    )
    OR
    -- Supervisors (not FOM): see their assigned hub(s) only.
    EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.id = auth.uid()
        AND lower(regexp_replace(coalesce(profile.role, ''), '[^a-z]', '', 'g'))
          IN ('hubsupervisor', 'supervisor')
        AND (
          profile.hub_id = operational_cost_submissions.hub_id
          OR (profile.location->>'secondary_hub_id') = operational_cost_submissions.hub_id
        )
    )
  );

CREATE OR REPLACE FUNCTION public.get_all_operational_cost_submissions()
RETURNS SETOF public.operational_cost_submissions
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_hub_id text;
  v_secondary_hub_id text;
  v_role_key text;
BEGIN
  SELECT
    hub_id,
    lower(regexp_replace(coalesce(role, ''), '[^a-z]', '', 'g')),
    location->>'secondary_hub_id'
  INTO v_hub_id, v_role_key, v_secondary_hub_id
  FROM public.profiles
  WHERE id = auth.uid();

  -- Admins, Super Admins, FOM, and Country Director: see everything.
  IF public.is_admin_or_super_admin()
     OR v_role_key IN ('fom', 'fieldoperationmanager', 'countrydirector')
  THEN
    RETURN QUERY
      SELECT *
      FROM public.operational_cost_submissions
      ORDER BY created_at DESC;

  -- Supervisors (not FOM): see submissions from their hub(s).
  ELSIF v_role_key IN ('hubsupervisor', 'supervisor') THEN
    RETURN QUERY
      SELECT *
      FROM public.operational_cost_submissions
      WHERE hub_id = v_hub_id
         OR (v_secondary_hub_id IS NOT NULL AND hub_id = v_secondary_hub_id)
      ORDER BY created_at DESC;

  -- Everyone else: see only their own submissions.
  ELSE
    RETURN QUERY
      SELECT *
      FROM public.operational_cost_submissions
      WHERE submitted_by = auth.uid()
      ORDER BY created_at DESC;
  END IF;
END;
$$;

GRANT EXECUTE
  ON FUNCTION public.get_all_operational_cost_submissions()
  TO authenticated;

DROP POLICY IF EXISTS
  "FOM can bypass approve operational cost submissions"
  ON public.operational_cost_submissions;

CREATE POLICY "FOM can bypass approve operational cost submissions"
  ON public.operational_cost_submissions
  FOR UPDATE
  USING (
    status NOT IN ('paid', 'reconciled')
    AND EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.id = auth.uid()
        AND lower(regexp_replace(coalesce(profile.role, ''), '[^a-z]', '', 'g'))
          IN ('fom', 'fieldoperationmanager')
    )
  )
  WITH CHECK (
    wallet_transaction_id IS NULL
    AND paid_at IS NULL
  );

COMMIT;
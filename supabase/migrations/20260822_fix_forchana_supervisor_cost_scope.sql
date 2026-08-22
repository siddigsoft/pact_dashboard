-- Normalize legacy Forchana hub labels for Cost Submission visibility.
--
-- Supervisors may be stored with a profile hub such as "West Darfur", while
-- operational_cost_submissions correctly stores "forchana-hub". A raw equality
-- check hides Central/West Darfur coordinator submissions before the client can
-- apply its hub scope. Normalize both sides in the authoritative RPC and RLS.

BEGIN;

CREATE OR REPLACE FUNCTION public.canonical_operational_cost_hub_id(p_hub_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_hub_id IS NULL OR btrim(p_hub_id) = '' THEN NULL
    WHEN lower(regexp_replace(replace(replace(btrim(p_hub_id), '_', ' '), '-', ' '), '\s+', ' ', 'g'))
      ~ '(forchana|farchana|west darfur|central darfur|el geneina|geneina)'
      THEN 'forchana-hub'
    ELSE lower(btrim(p_hub_id))
  END;
$$;

GRANT EXECUTE ON FUNCTION public.canonical_operational_cost_hub_id(text) TO authenticated;

DROP POLICY IF EXISTS "Supervisors and FOM can view operational cost submissions"
  ON public.operational_cost_submissions;
DROP POLICY IF EXISTS "Supervisors can view hub operational cost submissions"
  ON public.operational_cost_submissions;

CREATE POLICY "Supervisors and FOM can view operational cost submissions"
  ON public.operational_cost_submissions
  FOR SELECT
  USING (
    submitted_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles profile
      JOIN public.profiles submitter
        ON submitter.id = operational_cost_submissions.submitted_by
      WHERE profile.id = auth.uid()
        AND regexp_replace(lower(coalesce(profile.role, '')), '[^a-z]', '', 'g')
          IN ('fom', 'fieldoperationmanager', 'countrydirector')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles profile
      JOIN public.profiles submitter
        ON submitter.id = operational_cost_submissions.submitted_by
      WHERE profile.id = auth.uid()
        AND regexp_replace(lower(coalesce(profile.role, '')), '[^a-z]', '', 'g')
          IN ('hubsupervisor', 'supervisor')
        AND (
          public.canonical_operational_cost_hub_id(profile.hub_id)
            = public.canonical_operational_cost_hub_id(
              coalesce(
                operational_cost_submissions.hub_id,
                submitter.hub_id,
                submitter.state_id,
                submitter.location->>'state_id'
              )
            )
          OR public.canonical_operational_cost_hub_id(
            coalesce(profile.secondary_hub_id, profile.location->>'secondary_hub_id')
          ) = public.canonical_operational_cost_hub_id(
            coalesce(
              operational_cost_submissions.hub_id,
              submitter.hub_id,
              submitter.state_id,
              submitter.location->>'state_id'
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "Supervisors can update tier1 for hub submissions"
  ON public.operational_cost_submissions;

CREATE POLICY "Supervisors can update tier1 for hub submissions"
  ON public.operational_cost_submissions
  FOR UPDATE
  USING (
    tier1_status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.profiles profile
      JOIN public.profiles submitter
        ON submitter.id = operational_cost_submissions.submitted_by
      WHERE profile.id = auth.uid()
        AND regexp_replace(lower(coalesce(profile.role, '')), '[^a-z]', '', 'g')
          IN ('hubsupervisor', 'supervisor')
        AND (
          public.canonical_operational_cost_hub_id(profile.hub_id)
            = public.canonical_operational_cost_hub_id(
              coalesce(
                operational_cost_submissions.hub_id,
                submitter.hub_id,
                submitter.state_id,
                submitter.location->>'state_id'
              )
            )
          OR public.canonical_operational_cost_hub_id(
            coalesce(profile.secondary_hub_id, profile.location->>'secondary_hub_id')
          ) = public.canonical_operational_cost_hub_id(
            coalesce(
              operational_cost_submissions.hub_id,
              submitter.hub_id,
              submitter.state_id,
              submitter.location->>'state_id'
            )
          )
        )
    )
  )
  WITH CHECK (
    tier2_status = 'pending'
    AND wallet_transaction_id IS NULL
    AND paid_at IS NULL
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
    coalesce(secondary_hub_id, location->>'secondary_hub_id'),
    regexp_replace(lower(coalesce(role, '')), '[^a-z]', '', 'g')
  INTO v_hub_id, v_secondary_hub_id, v_role_key
  FROM public.profiles
  WHERE id = auth.uid();

  IF public.is_admin_or_super_admin()
     OR v_role_key IN ('fom', 'fieldoperationmanager', 'countrydirector')
  THEN
    RETURN QUERY
      SELECT *
      FROM public.operational_cost_submissions
      ORDER BY created_at DESC;
  ELSIF v_role_key IN ('hubsupervisor', 'supervisor') THEN
    RETURN QUERY
      SELECT submission.*
      FROM public.operational_cost_submissions submission
      JOIN public.profiles submitter
        ON submitter.id = submission.submitted_by
      WHERE submission.submitted_by = auth.uid()
         OR public.canonical_operational_cost_hub_id(
              coalesce(
                submission.hub_id,
                submitter.hub_id,
                submitter.state_id,
                submitter.location->>'state_id'
              )
            )
              = public.canonical_operational_cost_hub_id(v_hub_id)
         OR (
           v_secondary_hub_id IS NOT NULL
           AND public.canonical_operational_cost_hub_id(
                 coalesce(
                   submission.hub_id,
                   submitter.hub_id,
                   submitter.state_id,
                   submitter.location->>'state_id'
                 )
               )
                 = public.canonical_operational_cost_hub_id(v_secondary_hub_id)
         )
      ORDER BY submission.created_at DESC;
  ELSE
    RETURN QUERY
      SELECT *
      FROM public.operational_cost_submissions
      WHERE submitted_by = auth.uid()
      ORDER BY created_at DESC;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_operational_cost_submissions() TO authenticated;

COMMIT;
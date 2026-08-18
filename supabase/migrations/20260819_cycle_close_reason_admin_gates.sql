-- Let Admin / FOM / Super Admin persist uncovered reasons, matching the wizard UI.
-- Re-saving an unchanged confirmed reason must not reset confirmation to draft.

CREATE OR REPLACE FUNCTION public.set_not_covered_reason(
  p_site_id uuid,
  p_reason text,
  p_note text DEFAULT '',
  p_flagged boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_same_reason boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  SELECT public._cycle_close_role(role) INTO v_role
  FROM public.profiles
  WHERE id = v_user_id
  LIMIT 1;

  IF v_role NOT IN (
    'coordinator',
    'admin',
    'fom',
    'fieldoperationmanager',
    'fieldoperationsmanager',
    'fieldopmanager',
    'superadmin',
    'superadministrator'
  ) THEN
    RAISE EXCEPTION 'Only Coordinators, FOM, Admin, or Super Admin can set uncovered reasons';
  END IF;

  SELECT
    not_covered_confirm_status = 'confirmed'
    AND not_covered_reason IS NOT DISTINCT FROM btrim(p_reason)
    AND coalesce(not_covered_note, '') IS NOT DISTINCT FROM coalesce(p_note, '')
    AND coalesce(needs_followup, false) IS NOT DISTINCT FROM coalesce(p_flagged, false)
  INTO v_same_reason
  FROM public.mmp_site_entries
  WHERE id = p_site_id;

  IF v_same_reason IS NULL THEN
    RAISE EXCEPTION 'Site entry not found';
  END IF;

  UPDATE public.mmp_site_entries
  SET
    status = 'not_covered',
    not_covered_reason = btrim(p_reason),
    not_covered_note = coalesce(p_note, ''),
    needs_followup = coalesce(p_flagged, false),
    not_covered_confirm_status = CASE WHEN v_same_reason THEN not_covered_confirm_status ELSE 'draft' END,
    not_covered_confirmed_by = CASE WHEN v_same_reason THEN not_covered_confirmed_by ELSE NULL END,
    not_covered_confirmed_at = CASE WHEN v_same_reason THEN not_covered_confirmed_at ELSE NULL END,
    not_covered_updated_by = v_user_id,
    not_covered_updated_at = now()
  WHERE id = p_site_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_not_covered_reason(
  p_site_id uuid,
  p_confirmation_note text DEFAULT '',
  p_confirm boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT public._cycle_close_role(role) INTO v_role
  FROM public.profiles
  WHERE id = v_user_id
  LIMIT 1;

  IF v_role NOT IN (
    'supervisor',
    'hubsupervisor',
    'admin',
    'fom',
    'fieldoperationmanager',
    'fieldoperationsmanager',
    'fieldopmanager',
    'superadmin',
    'superadministrator'
  ) THEN
    RAISE EXCEPTION 'Only Supervisors, FOM, Admin, or Super Admin can confirm uncovered reasons';
  END IF;

  UPDATE public.mmp_site_entries
  SET
    not_covered_confirm_status = CASE WHEN coalesce(p_confirm, true) THEN 'confirmed' ELSE 'draft' END,
    not_covered_confirmed_by = CASE WHEN coalesce(p_confirm, true) THEN v_user_id ELSE NULL END,
    not_covered_confirmed_at = CASE WHEN coalesce(p_confirm, true) THEN now() ELSE NULL END,
    not_covered_confirmation_note = coalesce(p_confirmation_note, ''),
    not_covered_updated_by = v_user_id,
    not_covered_updated_at = now()
  WHERE id = p_site_id
    AND not_covered_reason IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot confirm uncovered reason before reason is set';
  END IF;
END;
$$;

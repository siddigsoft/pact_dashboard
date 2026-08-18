-- Role-gated uncovered-reason workflow for Cycle Close Step 4.
-- Coordinator writes/updates draft reasons.
-- Supervisor confirms or returns to draft.

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS not_covered_confirm_status text NOT NULL DEFAULT 'draft'
    CHECK (not_covered_confirm_status IN ('draft', 'confirmed')),
  ADD COLUMN IF NOT EXISTS not_covered_confirmed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS not_covered_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS not_covered_confirmation_note text,
  ADD COLUMN IF NOT EXISTS not_covered_updated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS not_covered_updated_at timestamptz;

CREATE OR REPLACE FUNCTION public._cycle_close_role(raw_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(lower(coalesce(raw_role, '')), '[^a-z]', '', 'g')
$$;

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

  IF v_role IS DISTINCT FROM 'coordinator' THEN
    RAISE EXCEPTION 'Only Coordinators can set uncovered reasons';
  END IF;

  UPDATE public.mmp_site_entries
  SET
    status = 'not_covered',
    not_covered_reason = btrim(p_reason),
    not_covered_note = coalesce(p_note, ''),
    needs_followup = coalesce(p_flagged, false),
    not_covered_confirm_status = 'draft',
    not_covered_confirmed_by = NULL,
    not_covered_confirmed_at = NULL,
    not_covered_updated_by = v_user_id,
    not_covered_updated_at = now()
  WHERE id = p_site_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Site entry not found';
  END IF;
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

  IF v_role NOT IN ('supervisor', 'hubsupervisor') THEN
    RAISE EXCEPTION 'Only Supervisors can confirm uncovered reasons';
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

REVOKE ALL ON FUNCTION public.set_not_covered_reason(uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_not_covered_reason(uuid, text, text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.confirm_not_covered_reason(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_not_covered_reason(uuid, text, boolean) TO authenticated;

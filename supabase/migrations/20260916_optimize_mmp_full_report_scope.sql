-- Avoid repeating the canonical Super Admin lookup for every site in an
-- already-authorized Full MMP report. Authorization is enforced by
-- get_mmp_report_payload before this row predicate is evaluated.
CREATE OR REPLACE FUNCTION public.mmp_entry_is_in_report_scope(
  p_report_kind text,
  p_state text,
  p_hub_office text,
  p_scope jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state_key text;
  v_hub_key text;
BEGIN
  -- Full-report permission is checked once at the report RPC boundary. Avoid
  -- an additional database-backed Super Admin lookup for every returned row.
  IF p_report_kind = 'full_report' THEN
    RETURN true;
  END IF;

  IF public.current_user_is_super_admin() THEN
    RETURN true;
  END IF;

  IF p_report_kind NOT IN ('state_report', 'hub_report')
     OR p_state IS NULL
     OR public.mmp_scope_key(p_state) = '' THEN
    RETURN false;
  END IF;

  v_hub_key := public.mmp_resolve_entry_hub_key(p_state, p_hub_office);
  IF v_hub_key IS NULL THEN
    RETURN false;
  END IF;

  IF p_report_kind = 'hub_report' THEN
    RETURN EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(p_scope->'hub_ids') = 'array'
          THEN p_scope->'hub_ids' ELSE '[]'::jsonb END
      ) AS h(value)
      WHERE v_hub_key = public.mmp_canonical_hub_key(h.value)
    );
  END IF;

  v_state_key := public.mmp_scope_key(p_state);
  RETURN EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(p_scope->'state_ids') = 'array'
        THEN p_scope->'state_ids' ELSE '[]'::jsonb END
    ) AS s(value)
    WHERE v_state_key = public.mmp_scope_key(s.value)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mmp_entry_is_in_report_scope(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mmp_entry_is_in_report_scope(text, text, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.mmp_entry_is_in_report_scope(text, text, text, jsonb) IS
  'Checks MMP report row scope; authorized full reports return immediately to avoid repeated per-row Super Admin lookups.';
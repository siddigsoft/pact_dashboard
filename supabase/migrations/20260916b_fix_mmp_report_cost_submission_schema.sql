-- operational_cost_submissions has MMP-level links (mmp_file_id/mmp_id), but
-- it does not have mmp_site_entry_id. Scoped reports must resolve these rows
-- from the submission/submitter location instead of a nonexistent site link.
DO $migration$
DECLARE
  v_definition text;
  v_start integer;
  v_tail_start integer;
  v_replacement text := $query$
  SELECT coalesce(jsonb_agg(to_jsonb(cs) ORDER BY cs.created_at DESC), '[]'::jsonb)
  INTO v_cost_submissions
  FROM public.operational_cost_submissions cs
  LEFT JOIN public.profiles submitter ON submitter.id = cs.submitted_by
  WHERE (cs.mmp_file_id = p_mmp_id OR cs.mmp_id = p_mmp_id)
    AND (
      v_report_kind = 'full_report'
      OR public.mmp_entry_is_in_report_scope(
        v_report_kind,
        coalesce(submitter.state_id, submitter.location->>'state_id',
          submitter.location->>'state'),
        coalesce(cs.hub_id, submitter.hub_id,
          submitter.location->>'secondary_hub_id'),
        v_scope
      )
    );

$query$;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_mmp_report_payload(uuid,text)'::regprocedure
  )
  INTO v_definition;

  IF position('cs.mmp_site_entry_id' IN v_definition) = 0 THEN
    RETURN;
  END IF;

  v_start := position(
    '  SELECT coalesce(jsonb_agg(to_jsonb(cs)' IN v_definition
  );
  IF v_start = 0 THEN
    RAISE EXCEPTION
      'Unable to locate the MMP report cost-submission query for safe replacement';
  END IF;

  v_tail_start := position(
    '  IF v_is_scoped THEN' IN substring(v_definition FROM v_start)
  );
  IF v_tail_start = 0 THEN
    RAISE EXCEPTION
      'Unable to locate the end of the MMP report cost-submission query';
  END IF;
  v_tail_start := v_start + v_tail_start - 1;

  v_definition :=
    substring(v_definition FROM 1 FOR v_start - 1)
    || v_replacement
    || substring(v_definition FROM v_tail_start);

  IF position('cs.mmp_site_entry_id' IN v_definition) > 0 THEN
    RAISE EXCEPTION
      'Unsafe MMP report definition still references cs.mmp_site_entry_id';
  END IF;

  EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.get_mmp_report_payload(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mmp_report_payload(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.get_mmp_report_payload(uuid, text) IS
  'Returns an authorized MMP report payload; operational costs use MMP and canonical submitter location links.';
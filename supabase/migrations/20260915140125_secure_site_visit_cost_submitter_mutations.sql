-- Move site-visit cost submitter mutations behind authenticated RPCs. The
-- browser must never choose submitted_by or modify approval/payment fields.

CREATE OR REPLACE FUNCTION public.mutate_site_visit_cost_submission(
  p_action text,
  p_submission_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS SETOF public.site_visit_cost_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  caller uuid := auth.uid();
  submission public.site_visit_cost_submissions%ROWTYPE;
  transportation_cost bigint;
  accommodation_cost bigint;
  meal_cost bigint;
  other_cost bigint;
  submission_currency text;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Cost submission payload must be an object' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'create' THEN
    IF p_submission_id IS NOT NULL THEN
      RAISE EXCEPTION 'A new submission must not include an id' USING ERRCODE = '22023';
    END IF;
    IF nullif(p_payload->>'site_visit_id', '') IS NULL THEN
      RAISE EXCEPTION 'A site visit is required' USING ERRCODE = '22004';
    END IF;
    IF p_payload ? 'supporting_documents'
       AND jsonb_typeof(p_payload->'supporting_documents') <> 'array' THEN
      RAISE EXCEPTION 'Supporting documents must be an array' USING ERRCODE = '22023';
    END IF;
    transportation_cost := coalesce((p_payload->>'transportation_cost_cents')::bigint, 0);
    accommodation_cost := coalesce((p_payload->>'accommodation_cost_cents')::bigint, 0);
    meal_cost := coalesce((p_payload->>'meal_allowance_cents')::bigint, 0);
    other_cost := coalesce((p_payload->>'other_costs_cents')::bigint, 0);
    submission_currency := upper(coalesce(nullif(p_payload->>'currency', ''), 'SDG'));
    IF transportation_cost < 0 OR accommodation_cost < 0 OR meal_cost < 0 OR other_cost < 0 THEN
      RAISE EXCEPTION 'Cost amounts cannot be negative' USING ERRCODE = '22023';
    END IF;
    IF submission_currency NOT IN ('SDG', 'USD', 'EUR', 'GBP', 'SAR', 'AED') THEN
      RAISE EXCEPTION 'Unsupported currency: %', submission_currency USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
      INSERT INTO public.site_visit_cost_submissions (
        site_visit_id, mmp_file_id, project_id, submitted_by,
        transportation_cost_cents, accommodation_cost_cents,
        meal_allowance_cents, other_costs_cents, currency,
        transportation_details, accommodation_details, meal_details, other_details,
        submission_notes, supporting_documents, status
      ) VALUES (
        (p_payload->>'site_visit_id')::uuid,
        nullif(p_payload->>'mmp_file_id', '')::uuid,
        nullif(p_payload->>'project_id', '')::uuid,
        caller,
        transportation_cost, accommodation_cost, meal_cost, other_cost, submission_currency,
        p_payload->>'transportation_details', p_payload->>'accommodation_details',
        p_payload->>'meal_details', p_payload->>'other_details',
        p_payload->>'submission_notes', coalesce(p_payload->'supporting_documents', '[]'::jsonb), 'pending'
      ) RETURNING *;
    RETURN;
  END IF;

  IF p_submission_id IS NULL THEN
    RAISE EXCEPTION 'A submission id is required for %', p_action USING ERRCODE = '22023';
  END IF;
  SELECT * INTO submission FROM public.site_visit_cost_submissions
  WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cost submission not found' USING ERRCODE = 'P0002';
  END IF;
  IF submission.submitted_by IS DISTINCT FROM caller THEN
    RAISE EXCEPTION 'You can only modify your own cost submissions' USING ERRCODE = '42501';
  END IF;
  IF submission.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending cost submissions can be modified' USING ERRCODE = 'P0001';
  END IF;

  IF p_action = 'update' THEN
    transportation_cost := CASE WHEN p_payload ? 'transportation_cost_cents' THEN (p_payload->>'transportation_cost_cents')::bigint ELSE submission.transportation_cost_cents END;
    accommodation_cost := CASE WHEN p_payload ? 'accommodation_cost_cents' THEN (p_payload->>'accommodation_cost_cents')::bigint ELSE submission.accommodation_cost_cents END;
    meal_cost := CASE WHEN p_payload ? 'meal_allowance_cents' THEN (p_payload->>'meal_allowance_cents')::bigint ELSE submission.meal_allowance_cents END;
    other_cost := CASE WHEN p_payload ? 'other_costs_cents' THEN (p_payload->>'other_costs_cents')::bigint ELSE submission.other_costs_cents END;
    IF transportation_cost < 0 OR accommodation_cost < 0 OR meal_cost < 0 OR other_cost < 0 THEN
      RAISE EXCEPTION 'Cost amounts cannot be negative' USING ERRCODE = '22023';
    END IF;
    IF p_payload ? 'supporting_documents'
       AND jsonb_typeof(p_payload->'supporting_documents') <> 'array' THEN
      RAISE EXCEPTION 'Supporting documents must be an array' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
      UPDATE public.site_visit_cost_submissions AS cost
      SET transportation_cost_cents = transportation_cost,
          accommodation_cost_cents = accommodation_cost,
          meal_allowance_cents = meal_cost,
          other_costs_cents = other_cost,
          transportation_details = CASE WHEN p_payload ? 'transportation_details' THEN p_payload->>'transportation_details' ELSE cost.transportation_details END,
          accommodation_details = CASE WHEN p_payload ? 'accommodation_details' THEN p_payload->>'accommodation_details' ELSE cost.accommodation_details END,
          meal_details = CASE WHEN p_payload ? 'meal_details' THEN p_payload->>'meal_details' ELSE cost.meal_details END,
          other_details = CASE WHEN p_payload ? 'other_details' THEN p_payload->>'other_details' ELSE cost.other_details END,
          submission_notes = CASE WHEN p_payload ? 'submission_notes' THEN p_payload->>'submission_notes' ELSE cost.submission_notes END,
          supporting_documents = CASE WHEN p_payload ? 'supporting_documents' THEN p_payload->'supporting_documents' ELSE cost.supporting_documents END
      WHERE cost.id = p_submission_id
      RETURNING cost.*;
    RETURN;
  END IF;

  IF p_action = 'cancel' THEN
    RETURN QUERY UPDATE public.site_visit_cost_submissions AS cost
      SET status = 'cancelled' WHERE cost.id = p_submission_id RETURNING cost.*;
    RETURN;
  END IF;
  RAISE EXCEPTION 'Unsupported cost-submission action: %', p_action USING ERRCODE = '22023';
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_site_visit_cost_submission(p_submission_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.site_visit_cost_submissions
  WHERE id = p_submission_id AND submitted_by = caller AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only your pending cost submission can be deleted' USING ERRCODE = '42501'; END IF;
END;
$function$;

-- Existing permissive policies are retained for reads. Restrictive policies
-- deny browser-originated writes; the RPCs enforce identity, state and fields.
DROP POLICY IF EXISTS "Direct site-visit cost inserts disabled" ON public.site_visit_cost_submissions;
CREATE POLICY "Direct site-visit cost inserts disabled" ON public.site_visit_cost_submissions
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "Direct site-visit cost updates disabled" ON public.site_visit_cost_submissions;
CREATE POLICY "Direct site-visit cost updates disabled" ON public.site_visit_cost_submissions
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Direct site-visit cost deletes disabled" ON public.site_visit_cost_submissions;
CREATE POLICY "Direct site-visit cost deletes disabled" ON public.site_visit_cost_submissions
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

REVOKE ALL ON FUNCTION public.mutate_site_visit_cost_submission(text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_site_visit_cost_submission(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mutate_site_visit_cost_submission(text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_site_visit_cost_submission(uuid) TO authenticated;

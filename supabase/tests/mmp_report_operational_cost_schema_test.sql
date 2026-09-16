-- Regression coverage for the production schema mismatch fixed by
-- 20260916b_fix_mmp_report_cost_submission_schema.sql.
BEGIN;

DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_mmp_report_payload(uuid,text)'::regprocedure
  )
  INTO v_definition;

  IF position('cs.mmp_site_entry_id' IN v_definition) > 0 THEN
    RAISE EXCEPTION
      'MMP report RPC references nonexistent operational_cost_submissions.mmp_site_entry_id';
  END IF;

  IF position('submitter.location' IN v_definition) = 0
     OR position('cs.mmp_file_id = p_mmp_id' IN v_definition) = 0 THEN
    RAISE EXCEPTION
      'MMP report RPC is missing canonical operational-cost scope resolution';
  END IF;
END;
$$;

ROLLBACK;
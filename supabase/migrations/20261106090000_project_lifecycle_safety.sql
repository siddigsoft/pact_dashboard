-- Project lifecycle safety. 2026-11-06. Safe to re-run.
-- Requires the existing project, permission, recycle-bin and close/reopen migrations.
-- No existing project is closed, archived or deleted by this migration.

CREATE OR REPLACE FUNCTION public.project_module_access(p_id uuid, p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND public.current_user_has_resource_permission('projects','read') AND EXISTS (
  SELECT 1 FROM public.projects p JOIN public.profiles u ON u.id=auth.uid()
  WHERE p.id=p_id AND u.role IS NOT NULL AND (
   u.role NOT IN ('employee','fom','countryDirector','hr')
   OR p.team->>'projectManagerId'=auth.uid()::text
   OR p.team->>'projectManager'=auth.uid()::text
   OR p.team->'teamComposition' @> jsonb_build_array(jsonb_build_object('userId',auth.uid()::text))
   OR public.is_active_project_team_member(p.id)
   OR public.user_has_explicit_resource_grant(auth.uid(),'projects',ARRAY['read']::text[])
  ) AND (NOT p_write OR public.current_user_has_resource_permission('projects','update')
   OR p.team->>'projectManagerId'=auth.uid()::text OR p.team->>'projectManager'=auth.uid()::text)
 );
$$;
REVOKE ALL ON FUNCTION public.project_module_access(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.project_module_access(uuid,boolean) TO authenticated;

CREATE TABLE IF NOT EXISTS public.project_financial_clearances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 source_digest text NOT NULL, note text NOT NULL CHECK(length(trim(note))>=20),
 approved_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT, approved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_financial_clearances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_clearance_read ON public.project_financial_clearances;
CREATE POLICY project_clearance_read ON public.project_financial_clearances FOR SELECT TO authenticated
 USING(public.project_module_access(project_id,true));
GRANT SELECT ON public.project_financial_clearances TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.project_financial_clearances FROM authenticated,anon;

-- Complete counts are needed for deletion, even when child-table RLS hides rows.
-- This private helper is callable only by the checked RPCs and triggers below.
CREATE OR REPLACE FUNCTION public.project_dependency_counts_internal(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE x record; n bigint; result jsonb:='{}'; q text;
BEGIN
 FOR x IN
  SELECT DISTINCT c.table_name, c.column_name,c.data_type FROM information_schema.columns c
  JOIN information_schema.tables t USING(table_schema,table_name)
  WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND c.column_name='project_id'
  UNION
  SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
   JOIN pg_namespace ns ON ns.oid=c.relnamespace
   JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.conkey[1]
  WHERE k.contype='f' AND k.confrelid='public.projects'::regclass
   AND array_length(k.conkey,1)=1 AND ns.nspname='public'
 LOOP
  IF x.data_type='uuid' THEN
   EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',x.table_name,x.column_name) INTO n USING p_id;
  ELSE
   EXECUTE format('SELECT count(*) FROM public.%I WHERE %I::text=$1::text',x.table_name,x.column_name) INTO n USING p_id;
  END IF;
  IF n>0 THEN result:=result||jsonb_build_object(x.table_name,greatest(n,coalesce((result->>x.table_name)::bigint,0))); END IF;
 END LOOP;
 SELECT to_jsonb(p) INTO q FROM public.projects p WHERE id=p_id;
 -- Header-held links have no foreign keys, but must not be discarded either.
 IF q IS NOT NULL THEN
  IF jsonb_typeof(q::jsonb->'related_mmps')='array' AND jsonb_array_length(q::jsonb->'related_mmps')>0 THEN
   result:=result||jsonb_build_object('linked_mmps',jsonb_array_length(q::jsonb->'related_mmps')); END IF;
  IF jsonb_typeof(q::jsonb->'related_site_visits')='array' AND jsonb_array_length(q::jsonb->'related_site_visits')>0 THEN
   result:=result||jsonb_build_object('linked_site_visits',jsonb_array_length(q::jsonb->'related_site_visits')); END IF;
  IF q::jsonb->'budget'->'close_snapshot' IS NOT NULL THEN result:=result||'{"close_history":1}'; END IF;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.project_dependency_counts_internal(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.project_financial_digest_internal(p_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE x record; part text; combined text:=''; header jsonb;
BEGIN
 SELECT coalesce(budget,'{}')-ARRAY['close_snapshot','close_records','retention_archive','retention_archives','reopen_records'] INTO header FROM public.projects WHERE id=p_id;
 IF coalesce(header,'{}')<>'{}'::jsonb THEN combined:='project_budget'||header::text; END IF;
 FOR x IN SELECT c.table_name FROM information_schema.columns c
 JOIN information_schema.tables t USING(table_schema,table_name)
 WHERE c.table_schema='public' AND c.column_name='project_id' AND t.table_type='BASE TABLE'
 AND c.table_name ~ '(cost|payment|advance|fund|budget|journal|wallet|invoice|expense)'
 AND c.table_name<>'project_financial_clearances' ORDER BY c.table_name
 LOOP
  EXECUTE format('SELECT string_agg(to_jsonb(r)::text,'''' ORDER BY to_jsonb(r)::text) FROM public.%I r WHERE project_id::text=$1::text',x.table_name)
   INTO part USING p_id;
  IF part IS NOT NULL THEN combined:=combined||x.table_name||part; END IF;
 END LOOP;
 RETURN CASE WHEN combined='' THEN NULL ELSE md5(combined) END;
END $$;
REVOKE ALL ON FUNCTION public.project_financial_digest_internal(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.project_lifecycle_preflight(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE counts jsonb; items jsonb:='[]'; total bigint; incomplete bigint; digest text; clear boolean;
BEGIN
 IF NOT public.project_module_access(p_id) OR NOT (
  public.project_module_access(p_id,true) OR public.current_user_has_resource_permission('projects','delete')
  OR public.current_user_has_resource_permission('cost_submissions','approve')
 ) THEN RAISE EXCEPTION 'Project management or Finance access required' USING ERRCODE='42501'; END IF;
 counts:=public.project_dependency_counts_internal(p_id);
 SELECT count(*),count(*) FILTER(WHERE coalesce(status::text,'') NOT IN('completed','cancelled'))
 INTO total,incomplete FROM public.project_activities WHERE project_id=p_id;
 items:=items||jsonb_build_array(jsonb_build_object('id','activities','label','Activities completed or cancelled','total',total,'count',total-incomplete,'passed',incomplete=0));
 SELECT count(*),count(*) FILTER(WHERE coalesce(s.status::text,'') NOT IN('completed','cancelled'))
 INTO total,incomplete FROM public.sub_activities s JOIN public.project_activities a ON a.id=s.activity_id WHERE a.project_id=p_id;
 items:=items||jsonb_build_array(jsonb_build_object('id','deliverables','label','Deliverables completed or cancelled','total',total,'count',total-incomplete,'passed',incomplete=0));
 SELECT count(*),count(*) FILTER(WHERE coalesce(status::text,'') NOT IN('done','cancelled'))
 INTO total,incomplete FROM public.project_field_tasks WHERE project_id=p_id;
 items:=items||jsonb_build_array(jsonb_build_object('id','tasks','label','Project tasks completed or cancelled','total',total,'count',total-incomplete,'passed',incomplete=0));
 IF to_regclass('public.project_task_reviews') IS NOT NULL THEN
  EXECUTE 'SELECT count(*),count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM public.project_task_reviews r WHERE r.task_id=t.id AND r.task_digest=md5(to_jsonb(t)::text) AND decision=''accepted'')) FROM public.project_field_tasks t WHERE project_id=$1 AND review_required AND status::text<>''cancelled'''
   INTO total,incomplete USING p_id;
  items:=items||jsonb_build_array(jsonb_build_object('id','task_reviews','label','Required task reviews accepted','total',total,'count',total-incomplete,'passed',incomplete=0));
 END IF;
 SELECT count(*),count(*) FILTER(WHERE coalesce(to_jsonb(c)->>'status','') NOT IN('rejected','cancelled','canceled') AND (
  coalesce(c.tier1_status::text,'pending') NOT IN('approved','rejected') OR
  (lower(regexp_replace(coalesce(to_jsonb(c)->>'submitter_role',''),'[^a-zA-Z]','','g')) NOT IN('countrydirector') AND coalesce(c.tier2_status::text,'pending') NOT IN('approved','rejected')) OR
  (lower(regexp_replace(coalesce(to_jsonb(c)->>'submitter_role',''),'[^a-zA-Z]','','g')) IN('supervisor','coordinator') AND coalesce(to_jsonb(c)->>'tier3_status','pending') NOT IN('approved','rejected')) OR
  (lower(regexp_replace(coalesce(to_jsonb(c)->>'submitter_role',''),'[^a-zA-Z]','','g'))='coordinator' AND coalesce(to_jsonb(c)->>'tier4_status','pending') NOT IN('approved','rejected'))
 )) INTO total,incomplete FROM public.operational_cost_submissions c WHERE project_id=p_id;
 items:=items||jsonb_build_array(jsonb_build_object('id','approvals','label','Applicable cost approval tiers resolved','total',total,'count',total-incomplete,'passed',incomplete=0));
 digest:=public.project_financial_digest_internal(p_id);
 clear:=digest IS NULL OR EXISTS(SELECT 1 FROM public.project_financial_clearances WHERE project_id=p_id AND source_digest=digest);
 items:=items||jsonb_build_array(jsonb_build_object('id','financial_clearance','label','Finance reconciliation signed off against current records','passed',clear,'total',CASE WHEN digest IS NULL THEN 0 ELSE 1 END,'count',CASE WHEN clear THEN 1 ELSE 0 END));
 RETURN jsonb_build_object('items',items,'dependencies',counts,
  'can_delete_empty',counts='{}'::jsonb,'can_close',NOT EXISTS(SELECT 1 FROM jsonb_array_elements(items) i WHERE NOT (i->>'passed')::boolean));
END $$;
REVOKE ALL ON FUNCTION public.project_lifecycle_preflight(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.project_lifecycle_preflight(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.attest_project_financial_clearance(p_id uuid,p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE digest text; result uuid;
BEGIN
 IF NOT public.project_module_access(p_id) OR NOT public.current_user_has_resource_permission('cost_submissions','approve') THEN
  RAISE EXCEPTION 'Finance approval permission required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.projects WHERE id=p_id FOR UPDATE;
 digest:=public.project_financial_digest_internal(p_id);
 IF digest IS NULL THEN RAISE EXCEPTION 'No financial records require clearance'; END IF;
 INSERT INTO public.project_financial_clearances(project_id,source_digest,note,approved_by)
 VALUES(p_id,digest,p_note,auth.uid()) RETURNING id INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.attest_project_financial_clearance(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.attest_project_financial_clearance(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_project_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE counts jsonb; readiness jsonb;
BEGIN
 IF TG_OP='DELETE' THEN
  counts:=public.project_dependency_counts_internal(OLD.id);
  IF counts<>'{}'::jsonb THEN RAISE EXCEPTION 'Project has linked records. Archive it instead of deleting. Dependencies: %',counts; END IF;
  INSERT INTO public.recycle_bin(table_name,record_id,record_data,deleted_by,deleted_by_name,notes,context)
   VALUES('projects',OLD.id::text,to_jsonb(OLD),auth.uid(),(SELECT full_name FROM public.profiles WHERE id=auth.uid()),
    'Empty project deletion; no linked records existed. Restore through Recycle Bin.','{"empty_project_only":true}');
  RETURN OLD;
 END IF;
 IF NEW.archived IS TRUE AND OLD.archived IS NOT TRUE
  AND current_setting('pact.project_retention_archive',true) IS DISTINCT FROM OLD.id::text THEN
  readiness:=public.project_lifecycle_preflight(OLD.id);
  IF NOT (readiness->>'can_close')::boolean THEN RAISE EXCEPTION 'Project is not ready to close. Resolve tasks, deliverables and finance checks, or use a retention archive.'; END IF;
  IF current_setting('pact.project_verified_close',true) IS DISTINCT FROM OLD.id::text THEN RAISE EXCEPTION 'Use verified project closure rather than directly changing the archive flag'; END IF;
 END IF;
 IF NEW.budget->'close_records' IS DISTINCT FROM OLD.budget->'close_records'
  AND current_setting('pact.project_verified_close',true) IS DISTINCT FROM OLD.id::text THEN
  RAISE EXCEPTION 'Project close history cannot be rewritten'; END IF;
 IF NEW.budget->'retention_archives' IS DISTINCT FROM OLD.budget->'retention_archives'
  AND current_setting('pact.project_retention_archive',true) IS DISTINCT FROM OLD.id::text THEN
  RAISE EXCEPTION 'Project archive history cannot be rewritten'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS project_lifecycle_safety ON public.projects;
CREATE TRIGGER project_lifecycle_safety BEFORE UPDATE OR DELETE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.guard_project_lifecycle();

-- Child writes serialize with closing/deletion, including links without a FK.
CREATE OR REPLACE FUNCTION public.lock_linked_project()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old_pid text; new_pid text;
BEGIN
 IF TG_OP<>'INSERT' THEN old_pid:=to_jsonb(OLD)->>'project_id'; END IF;
 IF TG_OP<>'DELETE' THEN new_pid:=to_jsonb(NEW)->>'project_id'; END IF;
 PERFORM 1 FROM public.projects WHERE id::text IN(old_pid,new_pid) ORDER BY id FOR KEY SHARE;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE x record; BEGIN
 FOR x IN SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables t USING(table_schema,table_name)
 WHERE c.table_schema='public' AND c.column_name='project_id' AND t.table_type='BASE TABLE'
 LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS project_link_serialization ON public.%I',x.table_name);
  EXECUTE format('CREATE TRIGGER project_link_serialization BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.lock_linked_project()',x.table_name);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.delete_empty_project_safely(p_id uuid,p_confirmation text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.projects;
BEGIN
 IF NOT public.project_module_access(p_id) OR NOT public.current_user_has_resource_permission('projects','delete') THEN
  RAISE EXCEPTION 'Project deletion denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT p FROM public.projects WHERE id=p_id FOR UPDATE;
 IF p_confirmation IS DISTINCT FROM p.name THEN RAISE EXCEPTION 'Project name confirmation does not match'; END IF;
 DELETE FROM public.projects WHERE id=p_id; -- trigger checks every link and saves the complete empty-project snapshot atomically
END $$;
REVOKE ALL ON FUNCTION public.delete_empty_project_safely(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_empty_project_safely(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_project_retaining_records(p_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.project_module_access(p_id,true) THEN RAISE EXCEPTION 'Project management permission required' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(p_reason,'')))<10 THEN RAISE EXCEPTION 'Explain why this project is being archived (at least 10 characters)'; END IF;
 PERFORM 1 FROM public.projects WHERE id=p_id FOR UPDATE;
 PERFORM set_config('pact.project_retention_archive',p_id::text,true);
 UPDATE public.projects SET archived=true,budget=coalesce(budget,'{}')||jsonb_build_object(
  'retention_archive',jsonb_build_object('reason',p_reason,'by',auth.uid(),'at',now(),'completed',false),
  'retention_archives',coalesce(budget->'retention_archives','[]')||jsonb_build_array(jsonb_build_object('reason',p_reason,'by',auth.uid(),'at',now(),'completed',false))),updated_at=now() WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.archive_project_retaining_records(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.archive_project_retaining_records(uuid,text) TO authenticated;

-- Preserve the public RPC signature; replace the tracked legacy two-tier gate.
-- Rejected/default-inactive tiers are not evidence of an unreconciled balance.
CREATE OR REPLACE FUNCTION public.close_project(p_id uuid,p_justification text DEFAULT NULL,p_super_admin_override boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.projects; readiness jsonb; snapshot jsonb;
BEGIN
 IF NOT public.project_module_access(p_id,true) THEN RAISE EXCEPTION 'Project management permission required' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT p FROM public.projects WHERE id=p_id FOR UPDATE;
 IF p.archived THEN RAISE EXCEPTION 'Project is already archived. Reopen it before a new verified close.'; END IF;
 readiness:=public.project_lifecycle_preflight(p_id);
 IF NOT (readiness->>'can_close')::boolean THEN
  RAISE EXCEPTION 'Project is not ready to close. Resolve the checklist or use a retention archive; overrides do not bypass Finance or required reviews.';
 END IF;
 snapshot:=jsonb_build_object('closed_at',now(),'closed_by',auth.uid(),'project_id',p_id,'completed',true,
  'readiness',readiness->'items','financial_source_digest',public.project_financial_digest_internal(p_id),'justification',p_justification);
 PERFORM set_config('pact.project_verified_close',p_id::text,true);
 UPDATE public.projects SET archived=true,updated_at=now(),budget=coalesce(budget,'{}')||jsonb_build_object(
  'close_snapshot',snapshot,'close_records',coalesce(budget->'close_records','[]')||jsonb_build_array(snapshot)) WHERE id=p_id;
 RETURN snapshot;
END $$;
REVOKE ALL ON FUNCTION public.close_project(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.close_project(uuid,text,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';

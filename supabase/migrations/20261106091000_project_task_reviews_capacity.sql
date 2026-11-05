-- Task acceptance, immutable work history and capacity data. 2026-11-06.
-- Safe to re-run. Requires 20261106090000_project_lifecycle_safety.sql.
ALTER TABLE public.project_field_tasks ADD COLUMN IF NOT EXISTS review_required boolean NOT NULL DEFAULT false;
ALTER TABLE public.project_field_tasks ADD COLUMN IF NOT EXISTS reviewer_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.project_field_tasks ADD COLUMN IF NOT EXISTS acceptance_criteria text;

CREATE TABLE IF NOT EXISTS public.project_task_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 task_id uuid NOT NULL REFERENCES public.project_field_tasks(id) ON DELETE RESTRICT,
 task_digest text NOT NULL,decision text NOT NULL CHECK(decision IN('accepted','changes_requested')),
 note text NOT NULL CHECK(length(trim(note))>=10),contributions jsonb NOT NULL DEFAULT '{}',
 reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_task_review_lookup ON public.project_task_reviews(task_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.project_task_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 task_id uuid NOT NULL,operation text NOT NULL,previous_data jsonb,current_data jsonb,
 actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_task_history_period ON public.project_task_history(project_id,recorded_at);
CREATE TABLE IF NOT EXISTS public.project_member_working_hours (
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 daily_hours numeric NOT NULL DEFAULT 8 CHECK(daily_hours>=0 AND daily_hours<=24),
 PRIMARY KEY(project_id,user_id)
);
ALTER TABLE public.project_task_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_task_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_member_working_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_reviews_read ON public.project_task_reviews;
CREATE POLICY task_reviews_read ON public.project_task_reviews FOR SELECT TO authenticated USING(public.project_module_access(project_id));
DROP POLICY IF EXISTS task_history_read ON public.project_task_history;
CREATE POLICY task_history_read ON public.project_task_history FOR SELECT TO authenticated USING(public.project_module_access(project_id));
DROP POLICY IF EXISTS member_capacity_read ON public.project_member_working_hours;
CREATE POLICY member_capacity_read ON public.project_member_working_hours FOR SELECT TO authenticated USING(public.project_module_access(project_id,true));
GRANT SELECT ON public.project_task_reviews,public.project_task_history,public.project_member_working_hours TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.project_task_reviews,public.project_task_history,public.project_member_working_hours FROM authenticated,anon;

CREATE OR REPLACE FUNCTION public.project_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Project audit and review records are append-only'; END $$;
DROP TRIGGER IF EXISTS project_reviews_immutable ON public.project_task_reviews;
CREATE TRIGGER project_reviews_immutable BEFORE UPDATE OR DELETE ON public.project_task_reviews FOR EACH ROW EXECUTE FUNCTION public.project_append_only();
DROP TRIGGER IF EXISTS project_history_immutable ON public.project_task_history;
CREATE TRIGGER project_history_immutable BEFORE UPDATE OR DELETE ON public.project_task_history FOR EACH ROW EXECUTE FUNCTION public.project_append_only();
DROP TRIGGER IF EXISTS financial_clearance_immutable ON public.project_financial_clearances;
CREATE TRIGGER financial_clearance_immutable BEFORE UPDATE OR DELETE ON public.project_financial_clearances FOR EACH ROW EXECUTE FUNCTION public.project_append_only();

CREATE OR REPLACE FUNCTION public.guard_project_field_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.projects; old_id uuid; new_id uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN old_id:=OLD.project_id; END IF;
 IF TG_OP<>'DELETE' THEN new_id:=NEW.project_id; END IF;
 FOR p IN SELECT * FROM public.projects WHERE id IN(old_id,new_id) ORDER BY id FOR KEY SHARE LOOP
  IF p.archived THEN RAISE EXCEPTION 'Reopen the archived project before changing tasks'; END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NOT public.project_module_access(NEW.project_id) THEN RAISE EXCEPTION 'Project access denied' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN RAISE EXCEPTION 'Tasks cannot be moved between projects; preserve the original history'; END IF;
 IF NEW.review_required THEN
  IF (TG_OP='INSERT' OR NEW.review_required IS DISTINCT FROM OLD.review_required OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
      OR NEW.acceptance_criteria IS DISTINCT FROM OLD.acceptance_criteria) AND NOT public.project_module_access(NEW.project_id,true) THEN
   RAISE EXCEPTION 'Only project management can configure required reviews' USING ERRCODE='42501'; END IF;
  IF NEW.reviewer_id IS NULL OR length(trim(coalesce(NEW.acceptance_criteria,'')))<10 THEN
   RAISE EXCEPTION 'Reviewed tasks need a named reviewer and clear acceptance criteria'; END IF;
  IF NEW.reviewer_id::text=NEW.assigned_to::text OR NEW.reviewer_id::text=ANY(coalesce(NEW.co_assignee_ids,'{}')::text[]) THEN
   RAISE EXCEPTION 'Choose a reviewer who is not an assignee'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.projects q WHERE q.id=NEW.project_id AND (
    q.team->'teamComposition' @> jsonb_build_array(jsonb_build_object('userId',NEW.reviewer_id::text))
    OR q.team->>'projectManagerId'=NEW.reviewer_id::text OR q.team->>'projectManager'=NEW.reviewer_id::text
  )) THEN RAISE EXCEPTION 'The reviewer must be a registered project team member'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD.review_required AND NOT NEW.review_required AND NOT public.project_module_access(NEW.project_id,true) THEN
  RAISE EXCEPTION 'Only project management can remove a review requirement' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS project_field_task_safety ON public.project_field_tasks;
CREATE TRIGGER project_field_task_safety BEFORE INSERT OR UPDATE OR DELETE ON public.project_field_tasks FOR EACH ROW EXECUTE FUNCTION public.guard_project_field_task();
CREATE OR REPLACE FUNCTION public.record_project_task_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO public.project_task_history(project_id,task_id,operation,previous_data,current_data,actor_id)
 VALUES(CASE WHEN TG_OP='DELETE' THEN OLD.project_id ELSE NEW.project_id END,
  CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END,TG_OP,
  CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END,auth.uid());
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS project_field_task_history ON public.project_field_tasks;
CREATE TRIGGER project_field_task_history AFTER INSERT OR UPDATE OR DELETE ON public.project_field_tasks FOR EACH ROW EXECUTE FUNCTION public.record_project_task_history();

CREATE OR REPLACE FUNCTION public.project_task_review_state(p_task uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.project_field_tasks; accepted boolean; history jsonb;
BEGIN
 SELECT * INTO STRICT t FROM public.project_field_tasks WHERE id=p_task;
 IF NOT public.project_module_access(t.project_id) THEN RAISE EXCEPTION 'Project access denied' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.project_task_reviews r WHERE r.task_id=t.id
  AND r.task_digest=md5(to_jsonb(t)::text) AND r.decision='accepted') INTO accepted;
 SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC),'[]') INTO history FROM (
  SELECT r.id,r.decision,r.note,r.contributions,r.reviewer_id,r.created_at,u.full_name AS reviewer_name
  FROM public.project_task_reviews r LEFT JOIN public.profiles u ON u.id=r.reviewer_id
  WHERE task_id=t.id ORDER BY r.created_at DESC LIMIT 20
 ) s;
 RETURN jsonb_build_object('accepted',accepted,'reviews',history,'can_review',
  NOT accepted AND t.status::text='done' AND auth.uid()=t.reviewer_id AND auth.uid()::text IS DISTINCT FROM t.assigned_to::text
  AND NOT (coalesce(t.co_assignee_ids,'{}')::text[] @> ARRAY[auth.uid()::text]));
END $$;
CREATE OR REPLACE FUNCTION public.review_project_task(p_task uuid,p_decision text,p_note text,p_contributions jsonb DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.project_field_tasks; result uuid; person text;
BEGIN
 SELECT * INTO STRICT t FROM public.project_field_tasks WHERE id=p_task;
 IF NOT public.project_module_access(t.project_id) THEN RAISE EXCEPTION 'Project access denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.projects WHERE id=t.project_id AND NOT archived FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reopen the project before reviewing'; END IF;
 SELECT * INTO STRICT t FROM public.project_field_tasks WHERE id=p_task FOR UPDATE;
 IF auth.uid() IS DISTINCT FROM t.reviewer_id OR t.status::text<>'done' OR NOT t.review_required THEN
  RAISE EXCEPTION 'Only the designated reviewer can review submitted work' USING ERRCODE='42501'; END IF;
 IF auth.uid()::text=t.assigned_to::text OR coalesce(t.co_assignee_ids,'{}')::text[] @> ARRAY[auth.uid()::text] THEN
  RAISE EXCEPTION 'Self-review is not allowed'; END IF;
 IF p_decision NOT IN('accepted','changes_requested') OR length(trim(coalesce(p_note,'')))<10 THEN RAISE EXCEPTION 'A decision and meaningful review note are required'; END IF;
 IF EXISTS(SELECT 1 FROM public.project_task_reviews WHERE task_id=t.id AND task_digest=md5(to_jsonb(t)::text)) THEN
  RAISE EXCEPTION 'This version was already reviewed. Update the task before resubmitting.'; END IF;
 FOR person IN SELECT DISTINCT x FROM unnest(ARRAY[t.assigned_to::text]||coalesce(t.co_assignee_ids,'{}')::text[]) x WHERE x IS NOT NULL LOOP
  IF length(trim(coalesce(p_contributions->>person,'')))<5 THEN RAISE EXCEPTION 'Record each assignee''s accepted output or requested changes'; END IF;
 END LOOP;
 INSERT INTO public.project_task_reviews(project_id,task_id,task_digest,decision,note,contributions,reviewer_id)
 VALUES(t.project_id,t.id,md5(to_jsonb(t)::text),p_decision,p_note,p_contributions,auth.uid()) RETURNING id INTO result;
 IF p_decision='changes_requested' THEN UPDATE public.project_field_tasks SET status='inprogress',percent_complete=least(percent_complete,99),updated_at=now() WHERE id=t.id; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.project_task_review_state(uuid),public.review_project_task(uuid,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.project_task_review_state(uuid),public.review_project_task(uuid,text,text,jsonb) TO authenticated;

-- Additional close check cannot be bypassed through the old close RPC or a raw UPDATE.
CREATE OR REPLACE FUNCTION public.guard_project_task_acceptance_close()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.archived AND NOT coalesce(OLD.archived,false) AND current_setting('pact.project_retention_archive',true) IS DISTINCT FROM OLD.id::text
 AND EXISTS(SELECT 1 FROM public.project_field_tasks t WHERE t.project_id=OLD.id AND t.review_required AND t.status::text<>'cancelled'
  AND NOT EXISTS(SELECT 1 FROM public.project_task_reviews r WHERE r.task_id=t.id AND r.task_digest=md5(to_jsonb(t)::text) AND r.decision='accepted'))
 THEN RAISE EXCEPTION 'Required task reviews must be accepted before closing'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS project_task_acceptance_close ON public.projects;
CREATE TRIGGER project_task_acceptance_close BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.guard_project_task_acceptance_close();

CREATE OR REPLACE FUNCTION public.set_project_member_hours(p_id uuid,p_user uuid,p_hours numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.project_module_access(p_id,true) THEN RAISE EXCEPTION 'Project management permission required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.projects WHERE id=p_id AND NOT archived FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reopen the project before editing working hours'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.projects p WHERE p.id=p_id AND p.team->'teamComposition' @> jsonb_build_array(jsonb_build_object('userId',p_user::text))) THEN
  RAISE EXCEPTION 'Select an existing project team member'; END IF;
 INSERT INTO public.project_member_working_hours VALUES(p_id,p_user,p_hours) ON CONFLICT(project_id,user_id) DO UPDATE SET daily_hours=EXCLUDED.daily_hours;
END $$;
CREATE OR REPLACE FUNCTION public.project_capacity_data(p_id uuid,p_start date,p_end date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.projects; members jsonb; tasks jsonb; leaves jsonb:='[]'; leave_available boolean; row_count integer;
BEGIN
 IF NOT public.project_module_access(p_id,true) THEN RAISE EXCEPTION 'Project management permission required' USING ERRCODE='42501'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_end<p_start OR p_end-p_start>92 THEN RAISE EXCEPTION 'Choose a period of 1–93 days'; END IF;
 SELECT * INTO STRICT p FROM public.projects WHERE id=p_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name,'dailyHours',coalesce(h.daily_hours,8))),'[]') INTO members
 FROM public.profiles u LEFT JOIN public.project_member_working_hours h ON h.user_id=u.id AND h.project_id=p_id
 WHERE p.team->'teamComposition' @> jsonb_build_array(jsonb_build_object('userId',u.id::text));
 SELECT count(*) INTO row_count FROM public.project_field_tasks t WHERE t.status::text IN('todo','inprogress') AND EXISTS(
  SELECT 1 FROM jsonb_array_elements(members) m WHERE m->>'id'=t.assigned_to::text OR coalesce(t.co_assignee_ids,'{}')::text[] @> ARRAY[m->>'id']);
 IF row_count>5000 THEN RAISE EXCEPTION 'Too many active assignments; narrow the project team before planning capacity'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'startDate',t.start_date,'dueDate',t.due_date,'assignedTo',t.assigned_to,
  'coAssigneeIds',t.co_assignee_ids,'hours',t.assignee_hours,'estimatedHours',t.estimated_hours,
  'workingDays',coalesce(to_jsonb(q)->'working_days','[1,2,3,4,5]'),'holidays',coalesce(to_jsonb(q)->'calendar_exceptions','[]'))),'[]')
 INTO tasks FROM public.project_field_tasks t JOIN public.projects q ON q.id=t.project_id
 WHERE t.status::text IN('todo','inprogress') AND EXISTS(SELECT 1 FROM jsonb_array_elements(members) m
  WHERE m->>'id'=t.assigned_to::text OR coalesce(t.co_assignee_ids,'{}')::text[] @> ARRAY[m->>'id']);
 leave_available:=to_regclass('public.leave_requests') IS NOT NULL;
 IF leave_available THEN
  EXECUTE $q$ SELECT coalesce(jsonb_agg(jsonb_build_object('userId',r->>'user_id','startDate',r->>'start_date','endDate',r->>'end_date')),'[]')
   FROM (SELECT to_jsonb(l) r FROM public.leave_requests l) s
   WHERE r->>'status'='approved' AND r->>'start_date'<=$2::text AND r->>'end_date'>=$1::text
   AND EXISTS(SELECT 1 FROM jsonb_array_elements($3) m WHERE m->>'id'=r->>'user_id') $q$
  INTO leaves USING p_start,p_end,members;
 END IF;
 RETURN jsonb_build_object('members',members,'tasks',tasks,'leave',leaves,'leaveAvailable',leave_available,
  'workingDays',coalesce(to_jsonb(p)->'working_days','[1,2,3,4,5]'),'holidays',coalesce(to_jsonb(p)->'calendar_exceptions','[]'),
  'basis','Planned active project-task hours across projects. Personal work without estimates and external members are not assumed to be zero.');
END $$;
REVOKE ALL ON FUNCTION public.set_project_member_hours(uuid,uuid,numeric),public.project_capacity_data(uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_project_member_hours(uuid,uuid,numeric),public.project_capacity_data(uuid,date,date) TO authenticated;
NOTIFY pgrst,'reload schema';

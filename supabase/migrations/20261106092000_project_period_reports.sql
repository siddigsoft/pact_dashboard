-- Period reports extend the EXISTING notification_schedules queue. 2026-11-06.
-- Safe to re-run. Apply after the lifecycle and task-review migrations.
-- Deploy project-report-delivery and schedule its service-role invocation separately.
ALTER TABLE public.notification_schedules ADD COLUMN IF NOT EXISTS report_project_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT;
ALTER TABLE public.notification_schedules ADD COLUMN IF NOT EXISTS report_frequency text CHECK(report_frequency IN('weekly','monthly'));
ALTER TABLE public.notification_schedules ADD COLUMN IF NOT EXISTS report_timezone text DEFAULT 'UTC';
ALTER TABLE public.notification_schedules ADD COLUMN IF NOT EXISTS report_anchor_day integer;
ALTER TABLE public.notification_schedules ADD COLUMN IF NOT EXISTS report_schedule_key text;
-- A namespaced status prevents an existing generic "pending" notification poller
-- from consuming a report job without generating its snapshot or delivery record.
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname,pg_get_expr(conbin,conrelid) expression FROM pg_constraint
  WHERE conrelid='public.notification_schedules'::regclass AND contype='c' AND pg_get_expr(conbin,conrelid) ~ '\mstatus\M'
 LOOP
  IF c.expression NOT LIKE '%project_report_pending%' THEN
   EXECUTE format('ALTER TABLE public.notification_schedules DROP CONSTRAINT %I',c.conname);
   EXECUTE format('ALTER TABLE public.notification_schedules ADD CONSTRAINT %I CHECK ((%s) OR status=''project_report_pending'')',c.conname,c.expression);
  END IF;
 END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS project_report_schedule_idempotency ON public.notification_schedules(report_schedule_key) WHERE report_schedule_key IS NOT NULL AND status='project_report_pending';
CREATE TABLE IF NOT EXISTS public.project_report_worker_health (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),last_seen timestamptz
);
INSERT INTO public.project_report_worker_health(id) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE public.project_report_worker_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_worker_health_read ON public.project_report_worker_health;
CREATE POLICY project_worker_health_read ON public.project_report_worker_health FOR SELECT TO authenticated USING(public.current_user_has_resource_permission('projects','read'));
GRANT SELECT ON public.project_report_worker_health TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.project_report_worker_health FROM authenticated,anon;
CREATE OR REPLACE FUNCTION public.project_report_calendar_time(p_due timestamp,p_frequency text,p_anchor integer,p_direction integer DEFAULT 1)
RETURNS timestamp LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE base timestamp;
BEGIN
 IF p_frequency='weekly' THEN RETURN p_due+p_direction*interval '7 days'; END IF;
 base:=date_trunc('month',p_due)+p_direction*interval '1 month';
 RETURN base+(least(p_anchor,extract(day FROM base+interval '1 month - 1 day')::integer)-1)*interval '1 day'+(p_due::time-time '00:00');
END $$;
CREATE INDEX IF NOT EXISTS notification_project_report_due ON public.notification_schedules(scheduled_at) WHERE report_project_id IS NOT NULL AND status='project_report_pending';

CREATE TABLE IF NOT EXISTS public.project_progress_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 period_start timestamptz NOT NULL,period_end timestamptz NOT NULL CHECK(period_end>period_start),
 captured_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS project_progress_report_period ON public.project_progress_reports(project_id,period_end DESC);
CREATE TABLE IF NOT EXISTS public.project_report_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),schedule_id uuid NOT NULL REFERENCES public.notification_schedules(id) ON DELETE RESTRICT,
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,report_id uuid NOT NULL REFERENCES public.project_progress_reports(id) ON DELETE RESTRICT,
 due_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','sent','failed','uncertain')),
 attempts integer NOT NULL DEFAULT 0,claimed_at timestamptz,next_attempt_at timestamptz NOT NULL DEFAULT now(),
 result jsonb,UNIQUE(schedule_id,due_at)
);
ALTER TABLE public.project_progress_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_report_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_progress_report_read ON public.project_progress_reports;
CREATE POLICY project_progress_report_read ON public.project_progress_reports FOR SELECT TO authenticated USING(public.project_module_access(project_id));
DROP POLICY IF EXISTS project_delivery_read ON public.project_report_deliveries;
CREATE POLICY project_delivery_read ON public.project_report_deliveries FOR SELECT TO authenticated USING(public.project_module_access(project_id,true));
GRANT SELECT ON public.project_progress_reports,public.project_report_deliveries TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.project_progress_reports,public.project_report_deliveries FROM authenticated,anon;
DROP TRIGGER IF EXISTS project_report_immutable ON public.project_progress_reports;
CREATE TRIGGER project_report_immutable BEFORE UPDATE OR DELETE ON public.project_progress_reports FOR EACH ROW EXECUTE FUNCTION public.project_append_only();

CREATE OR REPLACE FUNCTION public.build_project_progress_report_internal(p_id uuid,p_actor uuid,p_start timestamptz,p_end timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid; tasks jsonb; reviews jsonb; events jsonb; first_event timestamptz;
BEGIN
 IF p_start IS NULL OR p_end IS NULL OR p_start>=p_end OR p_end>now()+interval '1 minute' OR p_end-p_start>interval '93 days' THEN
  RAISE EXCEPTION 'Choose a completed reporting period of no more than 93 days'; END IF;
 PERFORM 1 FROM public.projects WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'status',t.status,
  'assignedTo',t.assigned_to,'coAssigneeIds',t.co_assignee_ids,'dueDate',t.due_date,'percentComplete',t.percent_complete,
  'estimatedHours',t.estimated_hours,'actualHours',t.actual_hours,'reviewRequired',t.review_required,
  'accepted',EXISTS(SELECT 1 FROM public.project_task_reviews r WHERE r.task_id=t.id AND r.task_digest=md5(to_jsonb(t)::text) AND decision='accepted'),
  'assigneeHours',(SELECT coalesce(jsonb_object_agg(k,jsonb_build_object('allocated',v->'allocated','actual',v->'actual')),'{}') FROM jsonb_each(coalesce(nullif(t.assignee_hours,'null'::jsonb),'{}')) h(k,v))
 )),'[]') INTO tasks FROM public.project_field_tasks t WHERE t.project_id=p_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('taskId',task_id,'decision',decision,'note',note,'contributions',contributions,'reviewerId',reviewer_id,'at',created_at)),'[]')
 INTO reviews FROM public.project_task_reviews WHERE project_id=p_id AND created_at>=p_start AND created_at<p_end;
 SELECT min(recorded_at) INTO first_event FROM public.project_task_history WHERE project_id=p_id;
 SELECT jsonb_build_object('created',count(*) FILTER(WHERE operation='INSERT'),
  'completionTransitions',count(*) FILTER(WHERE current_data->>'status'='done' AND previous_data->>'status' IS DISTINCT FROM 'done'),
  'changes',count(*)) INTO events FROM public.project_task_history WHERE project_id=p_id AND recorded_at>=p_start AND recorded_at<p_end;
 INSERT INTO public.project_progress_reports(project_id,period_start,period_end,created_by,payload)
 VALUES(p_id,p_start,p_end,p_actor,jsonb_build_object(
  'basis','Task state at capture time; period activity comes from recorded task history and reviews. No historical balances or individual productivity scores are inferred.',
  'historyAvailableFrom',first_event,'periodHistoryComplete',first_event IS NOT NULL AND first_event<=p_start,
  'tasksAtCapture',tasks,'periodActivity',events,'periodReviews',reviews)) RETURNING id INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.build_project_progress_report_internal(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.create_project_progress_report(p_id uuid,p_start timestamptz,p_end timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.project_module_access(p_id) OR NOT public.current_user_has_resource_permission('projects','export') THEN
  RAISE EXCEPTION 'Project reporting permission required' USING ERRCODE='42501'; END IF;
 RETURN public.build_project_progress_report_internal(p_id,auth.uid(),p_start,p_end);
END $$;
REVOKE ALL ON FUNCTION public.create_project_progress_report(uuid,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_project_progress_report(uuid,timestamptz,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_project_report_schedule(p_id uuid,p_frequency text,p_first timestamptz,p_timezone text,p_recipients uuid[],p_email boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid; recipient uuid; p public.projects;
BEGIN
 IF NOT public.project_module_access(p_id,true) OR NOT public.current_user_has_resource_permission('projects','export') THEN
  RAISE EXCEPTION 'Project management and reporting permissions required' USING ERRCODE='42501'; END IF;
 IF p_frequency IS NULL OR p_frequency NOT IN('weekly','monthly') OR p_first<=now() OR p_first IS NULL OR coalesce(cardinality(p_recipients),0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Choose a frequency, future delivery time and recipients'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) THEN RAISE EXCEPTION 'Choose a valid IANA time zone'; END IF;
 SELECT * INTO STRICT p FROM public.projects WHERE id=p_id FOR UPDATE;
 IF p.archived THEN RAISE EXCEPTION 'Reopen the project before scheduling reports'; END IF;
 SELECT array_agg(x ORDER BY x) INTO p_recipients FROM (SELECT DISTINCT unnest(p_recipients) x) ids;
 FOREACH recipient IN ARRAY p_recipients LOOP
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=recipient) OR NOT (
   p.team->'teamComposition' @> jsonb_build_array(jsonb_build_object('userId',recipient::text))
   OR p.team->>'projectManagerId'=recipient::text OR p.team->>'projectManager'=recipient::text
  ) THEN RAISE EXCEPTION 'Report recipients must be registered project team members'; END IF;
 END LOOP;
 INSERT INTO public.notification_schedules(created_by,recipient_ids,channels,title_en,message_en,event_type,action_url,scheduled_at,report_project_id,report_frequency,report_timezone,report_anchor_day,report_schedule_key,status)
 VALUES(auth.uid(),p_recipients,jsonb_build_object('inApp',true,'fcm',false,'email',p_email),
  'Project progress report','A project progress report is available.','project_report_ready','/projects/'||p_id||'?tab=reports',
  p_first,p_id,p_frequency,p_timezone,extract(day FROM p_first AT TIME ZONE p_timezone),
  md5(jsonb_build_array(p_id,p_frequency,p_timezone,(p_first AT TIME ZONE p_timezone)::time,
   CASE WHEN p_frequency='weekly' THEN extract(dow FROM p_first AT TIME ZONE p_timezone) ELSE extract(day FROM p_first AT TIME ZONE p_timezone) END,p_recipients)::text),'project_report_pending')
 ON CONFLICT(report_schedule_key) WHERE report_schedule_key IS NOT NULL AND status='project_report_pending'
 DO UPDATE SET channels=EXCLUDED.channels RETURNING id INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.cancel_project_report_schedule(p_schedule uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE pid uuid;
BEGIN
 SELECT report_project_id INTO STRICT pid FROM public.notification_schedules WHERE id=p_schedule AND report_project_id IS NOT NULL FOR UPDATE;
 IF NOT public.project_module_access(pid,true) THEN RAISE EXCEPTION 'Project management permission required' USING ERRCODE='42501'; END IF;
 UPDATE public.notification_schedules SET status='cancelled' WHERE id=p_schedule;
END $$;
CREATE OR REPLACE FUNCTION public.retry_project_report_delivery(p_delivery uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE pid uuid;
BEGIN
 SELECT project_id INTO STRICT pid FROM public.project_report_deliveries WHERE id=p_delivery AND status IN('failed','uncertain') FOR UPDATE;
 IF NOT public.project_module_access(pid,true) THEN RAISE EXCEPTION 'Project management permission required' USING ERRCODE='42501'; END IF;
 UPDATE public.project_report_deliveries SET status='queued',attempts=0,next_attempt_at=now(),result=jsonb_build_object('manualRetryBy',auth.uid(),'at',now()) WHERE id=p_delivery;
END $$;
REVOKE ALL ON FUNCTION public.save_project_report_schedule(uuid,text,timestamptz,text,uuid[],boolean),public.cancel_project_report_schedule(uuid),public.retry_project_report_delivery(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_project_report_schedule(uuid,text,timestamptz,text,uuid[],boolean),public.cancel_project_report_schedule(uuid),public.retry_project_report_delivery(uuid) TO authenticated;

-- Service-only worker RPC: no client can impersonate the scheduler or claim work.
CREATE OR REPLACE FUNCTION public.claim_project_report_deliveries()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.notification_schedules; r uuid; local_due timestamp; next_due timestamp; start_at timestamptz;
 result jsonb:='[]'; d record; valid_ids uuid[]; project_row public.projects; original_sub text; allowed boolean; candidate uuid;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 original_sub:=coalesce(current_setting('request.jwt.claim.sub',true),'');
 UPDATE public.project_report_worker_health SET last_seen=now() WHERE id=true;
 UPDATE public.project_report_deliveries SET status='uncertain',result='{"error":"Previous worker lost its acknowledgement. Verify delivery before manually retrying."}'
  WHERE status='processing' AND claimed_at<now()-interval '10 minutes';
 FOR s IN SELECT * FROM public.notification_schedules WHERE report_project_id IS NOT NULL AND status='project_report_pending' AND scheduled_at<=now()
  ORDER BY scheduled_at FOR UPDATE SKIP LOCKED LIMIT 10 LOOP
  SELECT * INTO project_row FROM public.projects WHERE id=s.report_project_id;
  -- Trusted service-only impersonation is transaction-local and used only for
  -- the SAME canonical permission checks as the browser RPC. Never trust roles
  -- captured at schedule creation; explicit revokes must stop future delivery.
  PERFORM set_config('request.jwt.claim.sub',coalesce(s.created_by::text,''),true);
  allowed:=public.project_module_access(s.report_project_id,true) AND public.current_user_has_resource_permission('projects','export');
  PERFORM set_config('request.jwt.claim.sub',original_sub,true);
  IF NOT coalesce(allowed,false) OR project_row.archived THEN
   UPDATE public.notification_schedules SET status='failed' WHERE id=s.id; CONTINUE;
  END IF;
  local_due:=s.scheduled_at AT TIME ZONE s.report_timezone;
  start_at:=public.project_report_calendar_time(local_due,s.report_frequency,s.report_anchor_day,-1) AT TIME ZONE s.report_timezone;
  SELECT report_id INTO r FROM public.project_report_deliveries WHERE schedule_id=s.id AND due_at=s.scheduled_at;
  IF r IS NULL THEN
   r:=public.build_project_progress_report_internal(s.report_project_id,s.created_by,start_at,s.scheduled_at);
   INSERT INTO public.project_report_deliveries(schedule_id,project_id,report_id,due_at) VALUES(s.id,s.report_project_id,r,s.scheduled_at);
  END IF;
  next_due:=public.project_report_calendar_time(local_due,s.report_frequency,s.report_anchor_day);
  UPDATE public.notification_schedules SET scheduled_at=next_due AT TIME ZONE s.report_timezone WHERE id=s.id;
 END LOOP;
 FOR d IN SELECT x.*,n.recipient_ids,n.channels,n.created_by,n.status AS schedule_status,p.team,p.name
  FROM public.project_report_deliveries x JOIN public.notification_schedules n ON n.id=x.schedule_id JOIN public.projects p ON p.id=x.project_id
  WHERE x.status IN('queued','failed') AND x.attempts<3 AND x.next_attempt_at<=now() AND n.status='project_report_pending'
  ORDER BY x.due_at FOR UPDATE OF x SKIP LOCKED LIMIT 10 LOOP
  PERFORM set_config('request.jwt.claim.sub',coalesce(d.created_by::text,''),true);
  allowed:=public.project_module_access(d.project_id,true) AND public.current_user_has_resource_permission('projects','export');
  PERFORM set_config('request.jwt.claim.sub',original_sub,true);
  IF NOT coalesce(allowed,false) THEN
   UPDATE public.project_report_deliveries SET status='failed',attempts=3,result='{"error":"Schedule owner no longer has permission"}' WHERE id=d.id; CONTINUE;
  END IF;
  valid_ids:='{}';
  FOR candidate IN SELECT u.id FROM public.profiles u WHERE u.id=ANY(d.recipient_ids) AND (
   d.team->'teamComposition' @> jsonb_build_array(jsonb_build_object('userId',u.id::text))
   OR d.team->>'projectManagerId'=u.id::text OR d.team->>'projectManager'=u.id::text) LOOP
   PERFORM set_config('request.jwt.claim.sub',candidate::text,true);
   IF public.project_module_access(d.project_id) THEN valid_ids:=array_append(valid_ids,candidate); END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub',original_sub,true);
  IF coalesce(cardinality(valid_ids),0)=0 THEN
   UPDATE public.project_report_deliveries SET status='failed',attempts=3,result='{"error":"No current team recipients remain"}' WHERE id=d.id; CONTINUE;
  END IF;
  UPDATE public.project_report_deliveries SET status='processing',claimed_at=now(),attempts=attempts+1 WHERE id=d.id;
  result:=result||jsonb_build_array(jsonb_build_object('id',d.id,'projectId',d.project_id,'projectName',d.name,'reportId',d.report_id,'recipients',valid_ids,'email',coalesce((d.channels->>'email')::boolean,false)));
 END LOOP;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.finish_project_report_delivery(p_id uuid,p_status text,p_result jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.role()<>'service_role' OR p_status NOT IN('sent','failed','uncertain') THEN RAISE EXCEPTION 'Invalid delivery acknowledgement' USING ERRCODE='42501'; END IF;
 UPDATE public.project_report_deliveries SET status=p_status,result=p_result,next_attempt_at=now()+interval '5 minutes' WHERE id=p_id AND status='processing';
 IF NOT FOUND THEN RAISE EXCEPTION 'Delivery lease is no longer active'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.claim_project_report_deliveries(),public.finish_project_report_delivery(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_project_report_deliveries(),public.finish_project_report_delivery(uuid,text,jsonb) TO service_role;
-- Managers can see their project schedules without opening the monitoring hub.
DROP POLICY IF EXISTS project_report_schedule_read ON public.notification_schedules;
CREATE POLICY project_report_schedule_read ON public.notification_schedules FOR SELECT TO authenticated
 USING(report_project_id IS NOT NULL AND public.project_module_access(report_project_id,true));
NOTIFY pgrst,'reload schema';

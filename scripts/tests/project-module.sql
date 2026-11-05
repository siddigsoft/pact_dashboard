\set ON_ERROR_STOP on
SET client_min_messages=warning;
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
GRANT USAGE ON SCHEMA auth,public TO authenticated,service_role,anon;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.profiles(id uuid PRIMARY KEY,full_name text,role text);
CREATE TABLE public.test_permission_blocks(user_id uuid,resource text,action text);
CREATE FUNCTION public.current_user_has_resource_permission(r text,a text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.test_permission_blocks WHERE user_id=auth.uid() AND resource=r AND action=a)
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND (a='read' OR role IN('admin','super_admin','finance')));
$$;
CREATE FUNCTION public.user_has_explicit_resource_grant(uuid,text,text[]) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION public.is_active_project_team_member(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE TABLE public.projects(id uuid PRIMARY KEY,name text,created_by uuid,archived boolean DEFAULT false,budget jsonb DEFAULT '{}',
 team jsonb DEFAULT '{}',updated_at timestamptz DEFAULT now(),working_days integer[] DEFAULT '{1,2,3,4,5}',calendar_exceptions jsonb DEFAULT '[]',
 related_mmps jsonb DEFAULT '[]',related_site_visits jsonb DEFAULT '[]',status text DEFAULT 'draft',project_type text,
 start_date date,end_date date,current_flow_stage text);
CREATE TABLE public.mmp_files(id uuid PRIMARY KEY);
CREATE TABLE public.project_activities(id uuid PRIMARY KEY,project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,status text);
CREATE TABLE public.sub_activities(id uuid PRIMARY KEY,activity_id uuid REFERENCES public.project_activities(id) ON DELETE CASCADE,status text);
CREATE TABLE public.project_field_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
 title text,status text DEFAULT 'todo',assigned_to text,assigned_to_name text,co_assignee_ids text[] DEFAULT '{}',start_date date,due_date date,
 estimated_hours numeric,actual_hours numeric,percent_complete integer DEFAULT 0,assignee_hours jsonb DEFAULT '{}',updated_at timestamptz DEFAULT now());
CREATE TABLE public.operational_cost_submissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid REFERENCES public.projects(id),
 status text DEFAULT 'pending',submitter_role text,tier1_status text DEFAULT 'pending',tier2_status text DEFAULT 'pending',tier3_status text DEFAULT 'pending',tier4_status text DEFAULT 'pending',amount_cents bigint);
CREATE TABLE public.leave_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,start_date date,end_date date,status text);
CREATE TABLE public.recycle_bin(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),table_name text,record_id text,record_data jsonb,
 deleted_by uuid,deleted_by_name text,notes text,context jsonb);
CREATE TABLE public.monitoring_page_access(user_id uuid);
\i supabase/migrations/20260330_notification_schedules.sql
\i supabase/migrations/20260408_task16_close_gate_rpcs.sql
\i supabase/migrations/20261106090000_project_lifecycle_safety.sql
\i supabase/migrations/20261106091000_project_task_reviews_capacity.sql
\i supabase/migrations/20261106092000_project_period_reports.sql
-- Re-applying must preserve existing function names, policies and constraints.
\i supabase/migrations/20261106090000_project_lifecycle_safety.sql
\i supabase/migrations/20261106091000_project_task_reviews_capacity.sql
\i supabase/migrations/20261106092000_project_period_reports.sql
-- Simulate the existing project read policy; production already has its own
-- scoped projects_select policy, which the new migration leaves unchanged.
CREATE POLICY fixture_project_read ON public.projects FOR SELECT TO authenticated USING(true);
\i supabase/migrations/20261106100000_project_review_queue.sql
\i supabase/migrations/20261106100000_project_review_queue.sql
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
 BEGIN IF NOT coalesce(value,false) THEN RAISE EXCEPTION 'ASSERTION FAILED: %',message; END IF; END $$;
CREATE FUNCTION pg_temp.must_fail(statement text,pattern text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE caught text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN caught:=SQLERRM; END;
 IF caught IS NULL OR caught NOT ILIKE '%'||pattern||'%' THEN RAISE EXCEPTION 'Expected failure containing %, got %',pattern,caught; END IF;
END $$;
DO $$ BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated,service_role',pg_my_temp_schema()::regnamespace); END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.projects,public.project_field_tasks TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
INSERT INTO public.profiles VALUES
 ('00000000-0000-4000-8000-000000000001','Manager','super_admin'),
 ('00000000-0000-4000-8000-000000000002','Contributor','employee'),
 ('00000000-0000-4000-8000-000000000003','Reviewer','employee'),
 ('00000000-0000-4000-8000-000000000004','Outside user','employee');
INSERT INTO auth.users SELECT id FROM public.profiles;
INSERT INTO public.projects(id,name,created_by,team)
 SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Project '||n,'00000000-0000-4000-8000-000000000001',
 '{"projectManagerId":"00000000-0000-4000-8000-000000000001","teamComposition":[{"userId":"00000000-0000-4000-8000-000000000001"},{"userId":"00000000-0000-4000-8000-000000000002"},{"userId":"00000000-0000-4000-8000-000000000003"}]}'::jsonb
 FROM generate_series(1,7) n;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT set_config('request.jwt.claim.role','authenticated',false);
INSERT INTO public.project_field_tasks(id,project_id,title,status,assigned_to,co_assignee_ids,review_required,reviewer_id,acceptance_criteria,percent_complete,assignee_hours,start_date,due_date)
 VALUES('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Reviewed task','done','00000000-0000-4000-8000-000000000002',
 ARRAY['00000000-0000-4000-8000-000000000001'],true,'00000000-0000-4000-8000-000000000003','Evidence must meet the agreed acceptance criteria.',100,
 '{"00000000-0000-4000-8000-000000000002":{"allocated":12,"actual":10},"00000000-0000-4000-8000-000000000001":{"allocated":4,"actual":3}}',current_date,current_date+4);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
SELECT pg_temp.assert_true((public.get_my_project_review_queue()->>'total')::integer=1,'reviewer-only work is in the inbox');
SELECT pg_temp.assert_true(jsonb_array_length(public.get_my_project_review_queue(0,1)->'items')=1,'review queue honors page size');
SELECT pg_temp.must_fail($s$SELECT public.get_my_project_review_queue(0,101)$s$,'Invalid review page');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
SELECT pg_temp.assert_true((public.get_my_project_review_queue()->>'total')::integer=0,'unrelated users cannot see review requests');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT pg_temp.assert_true(NOT (public.project_lifecycle_preflight('10000000-0000-4000-8000-000000000001')->>'can_close')::boolean,'required acceptance blocks close');
SELECT pg_temp.must_fail($s$SELECT public.delete_empty_project_safely('10000000-0000-4000-8000-000000000001','Project 1')$s$,'linked records');
SELECT pg_temp.must_fail($s$UPDATE public.projects SET archived=true WHERE id='10000000-0000-4000-8000-000000000001'$s$,'not ready');
SELECT pg_temp.must_fail($s$SELECT public.claim_project_report_deliveries()$s$,'permission denied');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
SELECT pg_temp.must_fail($s$SELECT public.project_lifecycle_preflight('10000000-0000-4000-8000-000000000001')$s$,'access required');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SELECT pg_temp.must_fail($s$UPDATE public.project_field_tasks SET review_required=false WHERE id='20000000-0000-4000-8000-000000000001'$s$,'management');
SELECT pg_temp.must_fail($s$SELECT public.review_project_task('20000000-0000-4000-8000-000000000001','accepted','Good enough evidence.','{}')$s$,'designated reviewer');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
SELECT pg_temp.must_fail($s$SELECT public.review_project_task('20000000-0000-4000-8000-000000000001','accepted','Good enough evidence.','{}')$s$,'each assignee');
SELECT public.review_project_task('20000000-0000-4000-8000-000000000001','accepted','Both documented contributions were verified.',
 '{"00000000-0000-4000-8000-000000000002":"Completed the field work.","00000000-0000-4000-8000-000000000001":"Provided independent data preparation."}');
SELECT pg_temp.assert_true((public.project_task_review_state('20000000-0000-4000-8000-000000000001')->>'accepted')::boolean,'current task version accepted');
SELECT pg_temp.assert_true((public.get_my_project_review_queue()->>'total')::integer=0,'accepted versions leave the review queue');
SELECT pg_temp.must_fail($s$SELECT public.review_project_task('20000000-0000-4000-8000-000000000001','accepted','Both contributions checked again.',
 '{"00000000-0000-4000-8000-000000000002":"Field work.","00000000-0000-4000-8000-000000000001":"Preparation."}')$s$,'already reviewed');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
UPDATE public.project_field_tasks SET actual_hours=14,updated_at=now() WHERE id='20000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
SELECT pg_temp.assert_true((public.get_my_project_review_queue()->>'total')::integer=1,'edited versions return to the review queue');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT pg_temp.assert_true(NOT (public.project_task_review_state('20000000-0000-4000-8000-000000000001')->>'accepted')::boolean,'editing invalidates previous acceptance');
SELECT public.archive_project_retaining_records('10000000-0000-4000-8000-000000000001','Retain unfinished records while suspended.');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
SELECT pg_temp.assert_true((public.get_my_project_review_queue()->>'total')::integer=0,'archived projects do not produce actionable review requests');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT pg_temp.must_fail($s$UPDATE public.project_field_tasks SET title='Changed after archive' WHERE id='20000000-0000-4000-8000-000000000001'$s$,'Reopen');
SELECT public.reopen_project('10000000-0000-4000-8000-000000000001','Project resumed for review.');
SELECT public.delete_empty_project_safely('10000000-0000-4000-8000-000000000002','Project 2');
SELECT pg_temp.must_fail($s$UPDATE public.projects SET archived=true WHERE id='10000000-0000-4000-8000-000000000006'$s$,'verified');
SELECT public.close_project('10000000-0000-4000-8000-000000000007',NULL,false);
SELECT pg_temp.assert_true((SELECT archived AND jsonb_array_length(budget->'close_records')=1 FROM public.projects WHERE id='10000000-0000-4000-8000-000000000007'),'verified close retains history');
RESET ROLE;
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM public.recycle_bin WHERE record_id='10000000-0000-4000-8000-000000000002' AND record_data->>'name'='Project 2'),'empty-project recovery snapshot saved');
-- Finance sign-off is tied to full current source records, not a stale checkbox.
INSERT INTO public.operational_cost_submissions(project_id,status,submitter_role,tier1_status,tier2_status,amount_cents)
 VALUES('10000000-0000-4000-8000-000000000003','approved','FOM','approved','approved',10000);
SELECT pg_temp.assert_true(NOT (public.project_lifecycle_preflight('10000000-0000-4000-8000-000000000003')->>'can_close')::boolean,'finance sign-off required');
SELECT public.attest_project_financial_clearance('10000000-0000-4000-8000-000000000003','Reconciled source payments, balances and supporting evidence.');
SELECT pg_temp.assert_true((public.project_lifecycle_preflight('10000000-0000-4000-8000-000000000003')->>'can_close')::boolean,'unused tier4 default does not block FOM');
UPDATE public.operational_cost_submissions SET amount_cents=11000 WHERE project_id='10000000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_true(NOT (public.project_lifecycle_preflight('10000000-0000-4000-8000-000000000003')->>'can_close')::boolean,'financial changes invalidate clearance');
SELECT pg_temp.must_fail($s$UPDATE public.project_financial_clearances SET note='Rewrite historical reconciliation' $s$,'append-only');
-- Report creation preserves basis and never invents earlier history.
SET ROLE authenticated;
SELECT public.create_project_progress_report('10000000-0000-4000-8000-000000000001',now()-interval '7 days',now());
SELECT public.project_capacity_data('10000000-0000-4000-8000-000000000001',current_date,current_date+6);
SELECT public.set_project_member_hours('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',6);
SELECT pg_temp.must_fail($s$SELECT public.set_project_member_hours('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',25)$s$,'check constraint');
SELECT public.save_project_report_schedule('10000000-0000-4000-8000-000000000001','weekly',date_trunc('hour',now())+interval '1 day','Africa/Nairobi',ARRAY['00000000-0000-4000-8000-000000000002']::uuid[],false);
SELECT public.save_project_report_schedule('10000000-0000-4000-8000-000000000001','weekly',date_trunc('hour',now())+interval '1 day','Africa/Nairobi',ARRAY['00000000-0000-4000-8000-000000000002']::uuid[],false);
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.notification_schedules WHERE report_project_id IS NOT NULL),'schedule save is idempotent');
SELECT pg_temp.assert_true((SELECT payload->>'periodHistoryComplete'='false' FROM public.project_progress_reports LIMIT 1),'no fabricated historical completeness');
SELECT pg_temp.must_fail($s$UPDATE public.project_progress_reports SET payload='{}'$s$,'append-only');
SELECT pg_temp.assert_true(public.project_report_calendar_time('2028-01-31 09:30','monthly',31)='2028-02-29 09:30'::timestamp,'leap-year month end');
SELECT pg_temp.assert_true(public.project_report_calendar_time('2028-02-29 09:30','monthly',31)='2028-03-31 09:30'::timestamp,'monthly day anchor restored');
SELECT pg_temp.assert_true(public.project_report_calendar_time('2028-02-29 09:30','monthly',31,-1)='2028-01-31 09:30'::timestamp,'previous monthly period anchor');
UPDATE public.notification_schedules SET scheduled_at=now()-interval '1 minute' WHERE report_project_id IS NOT NULL;
SELECT set_config('request.jwt.claim.role','service_role',false);
SET ROLE service_role;
SELECT pg_temp.assert_true(jsonb_array_length(public.claim_project_report_deliveries())=1,'worker claims due report');
SELECT pg_temp.assert_true(jsonb_array_length(public.claim_project_report_deliveries())=0,'leased delivery not claimed twice');
RESET ROLE;
SELECT public.finish_project_report_delivery(id,'sent','{"success":true}') FROM public.project_report_deliveries;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.project_report_deliveries),'one delivery per due period');
UPDATE public.notification_schedules SET scheduled_at=now()-interval '1 minute' WHERE report_project_id IS NOT NULL;
INSERT INTO public.test_permission_blocks VALUES('00000000-0000-4000-8000-000000000001','projects','export');
SET ROLE service_role;
SELECT pg_temp.assert_true(jsonb_array_length(public.claim_project_report_deliveries())=0,'revoked export stops schedule');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT status='failed' FROM public.notification_schedules WHERE report_project_id IS NOT NULL),'revoked schedule is paused');
SELECT pg_temp.assert_true((SELECT last_seen IS NOT NULL FROM public.project_report_worker_health),'worker heartbeat recorded');
UPDATE public.projects SET team=team||'{"projectManager":"00000000-0000-4000-8000-000000000002"}'::jsonb WHERE id='10000000-0000-4000-8000-000000000006';
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SELECT pg_temp.assert_true(NOT public.project_module_access('10000000-0000-4000-8000-000000000006',true),'stale legacy manager cannot supersede canonical manager ID');
SET ROLE authenticated;
UPDATE public.projects SET name='Stale manager edit' WHERE id='10000000-0000-4000-8000-000000000006';
RESET ROLE;
SELECT pg_temp.assert_true((SELECT name='Project 6' FROM public.projects WHERE id='10000000-0000-4000-8000-000000000006'),'direct table RLS also blocks stale manager edits');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT pg_temp.assert_true(public.project_module_access('10000000-0000-4000-8000-000000000006',true),'canonical manager retains project management');
INSERT INTO public.test_permission_blocks VALUES('00000000-0000-4000-8000-000000000003','projects','read');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
SET ROLE authenticated;
SELECT pg_temp.assert_true((public.get_my_project_review_queue()->>'total')::integer=0,'revoked project access removes review requests');
RESET ROLE;
SELECT 'SQL authorization, lifecycle, review, finance, history, calendar and delivery checks passed.' AS result;

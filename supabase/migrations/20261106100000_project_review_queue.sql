-- Apply after the three project-module migrations. No existing task is changed.
-- Canonical manager IDs take precedence over stale legacy IDs.
CREATE OR REPLACE FUNCTION public.project_module_access(p_id uuid,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND public.current_user_has_resource_permission('projects','read') AND EXISTS(
  SELECT 1 FROM public.projects p JOIN public.profiles u ON u.id=auth.uid()
  WHERE p.id=p_id AND u.role IS NOT NULL AND (
   u.role NOT IN('employee','fom','countryDirector','hr')
   OR coalesce(nullif(p.team->>'projectManagerId',''),p.team->>'projectManager')=auth.uid()::text
   OR p.team->'teamComposition' @> jsonb_build_array(jsonb_build_object('userId',auth.uid()::text))
   OR public.is_active_project_team_member(p.id)
   OR public.user_has_explicit_resource_grant(auth.uid(),'projects',ARRAY['read']::text[])
  ) AND (NOT p_write OR public.current_user_has_resource_permission('projects','update')
   OR coalesce(nullif(p.team->>'projectManagerId',''),p.team->>'projectManager')=auth.uid()::text)
 );
$$;
REVOKE ALL ON FUNCTION public.project_module_access(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.project_module_access(uuid,boolean) TO authenticated;
-- The direct table-update path must use the same owner identity as the RPCs
-- and UI. A stale legacy ID must not retain edit rights after reassignment.
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS projects_update ON public.projects;
CREATE POLICY projects_update ON public.projects FOR UPDATE TO authenticated
 USING(public.current_user_has_resource_permission('projects','update')
  OR coalesce(nullif(team->>'projectManagerId',''),team->>'projectManager')=auth.uid()::text)
 WITH CHECK(public.current_user_has_resource_permission('projects','update')
  OR coalesce(nullif(team->>'projectManagerId',''),team->>'projectManager')=auth.uid()::text);
CREATE INDEX IF NOT EXISTS project_tasks_review_inbox ON public.project_field_tasks(reviewer_id,updated_at DESC,id)
 WHERE review_required AND status='done';
CREATE OR REPLACE FUNCTION public.get_my_project_review_queue(p_offset integer DEFAULT 0,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to see your review requests' USING ERRCODE='42501'; END IF;
 IF p_offset IS NULL OR p_offset<0 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'Invalid review page'; END IF;
 WITH eligible AS MATERIALIZED (
  SELECT t.id,t.project_id,p.name AS project_name,t.title,t.status,t.due_date,t.updated_at AS submitted_at
  FROM public.project_field_tasks t JOIN public.projects p ON p.id=t.project_id
  WHERE t.reviewer_id=auth.uid() AND t.review_required AND t.status='done'
   AND NOT coalesce(p.archived,false) AND public.project_module_access(p.id)
   AND auth.uid()::text IS DISTINCT FROM t.assigned_to::text
   AND NOT(coalesce(t.co_assignee_ids,'{}')::text[] @> ARRAY[auth.uid()::text])
   AND NOT EXISTS(SELECT 1 FROM public.project_task_reviews r WHERE r.task_id=t.id
    AND r.task_digest=md5(to_jsonb(t)::text) AND r.decision='accepted')
 ), page AS (
  SELECT * FROM eligible ORDER BY submitted_at DESC NULLS LAST,id LIMIT p_limit OFFSET p_offset
 )
 SELECT jsonb_build_object('total',(SELECT count(*) FROM eligible),
  'items',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY submitted_at DESC NULLS LAST,id) FROM page),'[]')) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_my_project_review_queue(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_project_review_queue(integer,integer) TO authenticated;
NOTIFY pgrst,'reload schema';

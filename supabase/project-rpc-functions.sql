-- Project RPC functions (bypass PostgREST schema cache for new columns)
-- Run these in Supabase SQL editor if functions are ever lost

-- 1. Read all projects (includes new columns: current_flow_stage, archived, etc.)
CREATE OR REPLACE FUNCTION public.get_all_projects()
RETURNS json LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(json_agg(p), '[]'::json) FROM (
    SELECT id, name, project_code, description, project_type, status,
      start_date, end_date, budget, location, team,
      current_flow_stage, custom_flow_stages,
      related_mmps, related_site_visits, archived,
      created_at, updated_at
    FROM projects ORDER BY created_at DESC
  ) p;
$$;
GRANT EXECUTE ON FUNCTION public.get_all_projects() TO authenticated, anon;

-- 2. Active projects for stall check
CREATE OR REPLACE FUNCTION public.get_active_projects_for_stall_check()
RETURNS json LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(json_agg(p), '[]'::json) FROM (
    SELECT id, name, project_type, status, current_flow_stage,
      custom_flow_stages, archived, created_at, updated_at
    FROM projects
    WHERE status NOT IN ('completed','cancelled')
      AND (archived IS NULL OR archived = false)
    ORDER BY created_at DESC
  ) p;
$$;
GRANT EXECUTE ON FUNCTION public.get_active_projects_for_stall_check() TO authenticated, anon;

-- 3. Projects linked to an MMP
CREATE OR REPLACE FUNCTION public.get_projects_linked_to_mmp(entity_id text)
RETURNS json LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(json_agg(p), '[]'::json) FROM (
    SELECT id, name, project_code, project_type, current_flow_stage
    FROM projects WHERE related_mmps @> ARRAY[entity_id]
    ORDER BY created_at DESC
  ) p;
$$;
GRANT EXECUTE ON FUNCTION public.get_projects_linked_to_mmp(text) TO authenticated, anon;

-- 4. Projects linked to a site visit
CREATE OR REPLACE FUNCTION public.get_projects_linked_to_site_visit(entity_id text)
RETURNS json LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(json_agg(p), '[]'::json) FROM (
    SELECT id, name, project_code, project_type, current_flow_stage
    FROM projects WHERE related_site_visits @> ARRAY[entity_id]
    ORDER BY created_at DESC
  ) p;
$$;
GRANT EXECUTE ON FUNCTION public.get_projects_linked_to_site_visit(text) TO authenticated, anon;

-- 5. Analytics
CREATE OR REPLACE FUNCTION public.get_projects_for_analytics()
RETURNS json LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(json_agg(p), '[]'::json) FROM (
    SELECT id, name, project_code, project_type, status,
      start_date, end_date, budget, location, team,
      current_flow_stage, custom_flow_stages, archived,
      created_at, updated_at
    FROM projects ORDER BY created_at DESC
  ) p;
$$;
GRANT EXECUTE ON FUNCTION public.get_projects_for_analytics() TO authenticated, anon;

-- 6. Archive / unarchive
CREATE OR REPLACE FUNCTION public.set_project_archived(p_id uuid, p_archived boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE projects SET archived = p_archived, updated_at = now() WHERE id = p_id;
$$;
GRANT EXECUTE ON FUNCTION public.set_project_archived(uuid, boolean) TO authenticated, anon;

-- 7. Update flow stage
CREATE OR REPLACE FUNCTION public.update_project_flow_stage(p_id uuid, p_stage text, p_custom_stages jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE projects
  SET current_flow_stage = p_stage,
      custom_flow_stages = COALESCE(p_custom_stages, custom_flow_stages),
      updated_at = now()
  WHERE id = p_id;
$$;
GRANT EXECUTE ON FUNCTION public.update_project_flow_stage(uuid, text, jsonb) TO authenticated, anon;

-- 8. Update custom stage order
CREATE OR REPLACE FUNCTION public.update_project_custom_stages(p_id uuid, p_custom_stages jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE projects SET custom_flow_stages = p_custom_stages, updated_at = now() WHERE id = p_id;
$$;
GRANT EXECUTE ON FUNCTION public.update_project_custom_stages(uuid, jsonb) TO authenticated, anon;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

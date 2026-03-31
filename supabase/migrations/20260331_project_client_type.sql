-- Add Internal vs Customer classification to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_type text NOT NULL DEFAULT 'internal';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_name text;

-- Update get_all_projects to include client fields
CREATE OR REPLACE FUNCTION public.get_all_projects()
RETURNS json LANGUAGE sql SECURITY DEFINER STABLE AS $f$
  SELECT COALESCE(json_agg(p), '[]'::json) FROM (
    SELECT id, name, project_code, description, project_type, status,
      start_date, end_date, budget, location, team,
      current_flow_stage, custom_flow_stages,
      related_mmps, related_site_visits, archived,
      client_type, client_name,
      created_at, updated_at
    FROM projects ORDER BY created_at DESC
  ) p;
$f$;
GRANT EXECUTE ON FUNCTION public.get_all_projects() TO authenticated, anon;

-- Update get_projects_for_analytics to include client fields
CREATE OR REPLACE FUNCTION public.get_projects_for_analytics()
RETURNS json LANGUAGE sql SECURITY DEFINER STABLE AS $f$
  SELECT COALESCE(json_agg(p), '[]'::json) FROM (
    SELECT id, name, project_code, project_type, status,
      start_date, end_date, budget, location, team,
      current_flow_stage, custom_flow_stages, archived,
      client_type, client_name,
      created_at, updated_at
    FROM projects ORDER BY created_at DESC
  ) p;
$f$;
GRANT EXECUTE ON FUNCTION public.get_projects_for_analytics() TO authenticated, anon;

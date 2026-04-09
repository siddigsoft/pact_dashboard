-- Migration: CRM to Project Pipeline Integration
-- Adds crm_opportunity_id to projects table for linking CRM opportunities to projects

ALTER TABLE projects ADD COLUMN IF NOT EXISTS crm_opportunity_id uuid REFERENCES crm_opportunities(id) ON DELETE SET NULL;

-- Update get_all_projects to include crm_opportunity_id
CREATE OR REPLACE FUNCTION public.get_all_projects()
RETURNS json LANGUAGE sql SECURITY DEFINER STABLE AS $f$
  SELECT COALESCE(json_agg(p), '[]'::json) FROM (
    SELECT id, name, project_code, description, project_type, status,
      start_date, end_date, budget, location, team,
      current_flow_stage, custom_flow_stages,
      related_mmps, related_site_visits, archived,
      client_type, client_name, partner_id, crm_opportunity_id,
      created_at, updated_at
    FROM projects ORDER BY created_at DESC
  ) p;
$f$;
GRANT EXECUTE ON FUNCTION public.get_all_projects() TO authenticated, anon;

-- Update get_projects_for_analytics to include partner_id
CREATE OR REPLACE FUNCTION public.get_projects_for_analytics()
RETURNS json LANGUAGE sql SECURITY DEFINER STABLE AS $f$
  SELECT COALESCE(json_agg(p), '[]'::json) FROM (
    SELECT id, name, project_code, project_type, status,
      start_date, end_date, budget, location, team,
      current_flow_stage, custom_flow_stages, archived,
      client_type, client_name, partner_id, crm_opportunity_id,
      created_at, updated_at
    FROM projects ORDER BY created_at DESC
  ) p;
$f$;
GRANT EXECUTE ON FUNCTION public.get_projects_for_analytics() TO authenticated, anon;

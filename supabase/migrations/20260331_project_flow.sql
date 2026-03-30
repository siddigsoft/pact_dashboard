-- Migration: Project Flow Engine
-- Adds current_flow_stage column to projects table and creates project_flow_log audit table.

-- 1. Add current_flow_stage column to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS current_flow_stage text;

-- 2. Create project_flow_log table
CREATE TABLE IF NOT EXISTS project_flow_log (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_id      text NOT NULL,
  stage_label   text NOT NULL,
  advanced_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  advanced_at   timestamptz NOT NULL DEFAULT now(),
  notes         text
);

CREATE INDEX IF NOT EXISTS project_flow_log_project_id_idx
  ON project_flow_log(project_id);

CREATE INDEX IF NOT EXISTS project_flow_log_advanced_at_idx
  ON project_flow_log(project_id, advanced_at);

-- 3. RLS policies for project_flow_log

ALTER TABLE project_flow_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read flow log for projects they can see
CREATE POLICY "project_flow_log_select"
  ON project_flow_log
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins, fom, super_admin can insert (advance stage)
CREATE POLICY "project_flow_log_insert"
  ON project_flow_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'admin', 'fom')
        AND profiles.status = 'approved'
    )
    OR EXISTS (
      -- Project managers listed in the project's team can also advance
      SELECT 1 FROM projects p
      WHERE p.id = project_id
        AND p.team->>'projectManager' = (
          SELECT full_name FROM profiles WHERE id = auth.uid() LIMIT 1
        )
    )
  );

-- No updates or deletes — flow log is immutable
CREATE POLICY "project_flow_log_no_update"
  ON project_flow_log
  FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "project_flow_log_no_delete"
  ON project_flow_log
  FOR DELETE
  TO authenticated
  USING (false);

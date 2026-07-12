-- ============================================================
-- project_change_log: table + auto-populate trigger
-- Run this once in Supabase SQL editor.
-- ============================================================

-- 1. Ensure the table exists (safe to run even if it already exists)
CREATE TABLE IF NOT EXISTS project_change_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  changed_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  field_name   text        NOT NULL,
  old_value    text,
  new_value    text,
  change_type  text        NOT NULL DEFAULT 'update',
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pcl_project_id ON project_change_log (project_id, created_at DESC);

-- Allow authenticated users to read change log entries for projects they can see
ALTER TABLE project_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_change_log_read" ON project_change_log;
CREATE POLICY "project_change_log_read"
  ON project_change_log FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "project_change_log_insert" ON project_change_log;
CREATE POLICY "project_change_log_insert"
  ON project_change_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- 2. Trigger function — fires on every UPDATE to `projects`
--    Tracks the fields users most commonly change.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_log_project_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _user uuid := auth.uid();
BEGIN
  -- Helper: log one field if it changed
  -- name
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    INSERT INTO project_change_log(project_id, changed_by, field_name, old_value, new_value, change_type)
    VALUES (NEW.id, _user, 'name', OLD.name, NEW.name, 'update');
  END IF;

  -- status
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO project_change_log(project_id, changed_by, field_name, old_value, new_value, change_type)
    VALUES (NEW.id, _user, 'status', OLD.status, NEW.status, 'status_change');
  END IF;

  -- description
  IF OLD.description IS DISTINCT FROM NEW.description THEN
    INSERT INTO project_change_log(project_id, changed_by, field_name, old_value, new_value, change_type)
    VALUES (NEW.id, _user,
      'description',
      LEFT(OLD.description, 200),
      LEFT(NEW.description, 200),
      'update');
  END IF;

  -- start_date
  IF OLD.start_date IS DISTINCT FROM NEW.start_date THEN
    INSERT INTO project_change_log(project_id, changed_by, field_name, old_value, new_value, change_type)
    VALUES (NEW.id, _user, 'start_date',
      OLD.start_date::text, NEW.start_date::text, 'update');
  END IF;

  -- end_date
  IF OLD.end_date IS DISTINCT FROM NEW.end_date THEN
    INSERT INTO project_change_log(project_id, changed_by, field_name, old_value, new_value, change_type)
    VALUES (NEW.id, _user, 'end_date',
      OLD.end_date::text, NEW.end_date::text, 'update');
  END IF;

  -- current_flow_stage (stage advance)
  IF OLD.current_flow_stage IS DISTINCT FROM NEW.current_flow_stage THEN
    INSERT INTO project_change_log(project_id, changed_by, field_name, old_value, new_value, change_type)
    VALUES (NEW.id, _user, 'stage',
      OLD.current_flow_stage, NEW.current_flow_stage, 'stage_advance');
  END IF;

  -- budget / total_budget
  IF OLD.budget IS DISTINCT FROM NEW.budget THEN
    INSERT INTO project_change_log(project_id, changed_by, field_name, old_value, new_value, change_type)
    VALUES (NEW.id, _user, 'budget',
      OLD.budget::text, NEW.budget::text, 'update');
  END IF;

  -- currency
  IF OLD.currency IS DISTINCT FROM NEW.currency THEN
    INSERT INTO project_change_log(project_id, changed_by, field_name, old_value, new_value, change_type)
    VALUES (NEW.id, _user, 'currency', OLD.currency, NEW.currency, 'update');
  END IF;

  -- project_manager (stored as uuid or text depending on schema)
  IF OLD.project_manager IS DISTINCT FROM NEW.project_manager THEN
    INSERT INTO project_change_log(project_id, changed_by, field_name, old_value, new_value, change_type)
    VALUES (NEW.id, _user, 'project_manager',
      OLD.project_manager::text, NEW.project_manager::text, 'update');
  END IF;

  -- project_type
  IF OLD.project_type IS DISTINCT FROM NEW.project_type THEN
    INSERT INTO project_change_log(project_id, changed_by, field_name, old_value, new_value, change_type)
    VALUES (NEW.id, _user, 'project_type', OLD.project_type, NEW.project_type, 'update');
  END IF;

  -- health_score
  IF OLD.health_score IS DISTINCT FROM NEW.health_score THEN
    INSERT INTO project_change_log(project_id, changed_by, field_name, old_value, new_value, change_type)
    VALUES (NEW.id, _user, 'health_score',
      OLD.health_score::text, NEW.health_score::text, 'update');
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Attach trigger (drop first so re-running the script is safe)
DROP TRIGGER IF EXISTS trg_log_project_changes ON projects;

CREATE TRIGGER trg_log_project_changes
  AFTER UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION fn_log_project_changes();

-- 4. Optional: log project creation
CREATE OR REPLACE FUNCTION fn_log_project_create()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO project_change_log(project_id, changed_by, field_name, old_value, new_value, change_type)
  VALUES (NEW.id, auth.uid(), 'project', NULL, NEW.name, 'create');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_project_create ON projects;

CREATE TRIGGER trg_log_project_create
  AFTER INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION fn_log_project_create();

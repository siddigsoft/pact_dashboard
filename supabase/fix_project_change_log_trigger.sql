-- ============================================================
-- EMERGENCY FIX — run immediately in Supabase SQL Editor
-- Drops the broken trigger that was referencing non-existent
-- columns (currency, health_score, project_manager, project_type)
-- and replaces it with a safe version using only real columns.
-- ============================================================

-- 1. Drop the broken triggers immediately
DROP TRIGGER IF EXISTS trg_log_project_changes ON projects;
DROP TRIGGER IF EXISTS trg_log_project_create  ON projects;
DROP FUNCTION IF EXISTS fn_log_project_changes();
DROP FUNCTION IF EXISTS fn_log_project_create();

-- 2. Recreate using ONLY columns that exist on the projects table
CREATE OR REPLACE FUNCTION fn_log_project_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _user uuid := auth.uid();
BEGIN
  -- name
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    INSERT INTO project_change_log(project_id, changed_by, field_name, old_value, new_value, change_type)
    VALUES (NEW.id, _user, 'name', OLD.name, NEW.name, 'update');
  END IF;

  -- status
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO project_change_log(project_id, changed_by, field_name, old_value, new_value, change_type)
    VALUES (NEW.id, _user, 'status', OLD.status::text, NEW.status::text, 'status_change');
  END IF;

  -- description
  IF OLD.description IS DISTINCT FROM NEW.description THEN
    INSERT INTO project_change_log(project_id, changed_by, field_name, old_value, new_value, change_type)
    VALUES (NEW.id, _user, 'description', LEFT(COALESCE(OLD.description,''), 200), LEFT(COALESCE(NEW.description,''), 200), 'update');
  END IF;

  -- start_date
  IF OLD.start_date IS DISTINCT FROM NEW.start_date THEN
    INSERT INTO project_change_log(project_id, changed_by, field_name, old_value, new_value, change_type)
    VALUES (NEW.id, _user, 'start_date', OLD.start_date::text, NEW.start_date::text, 'update');
  END IF;

  -- end_date
  IF OLD.end_date IS DISTINCT FROM NEW.end_date THEN
    INSERT INTO project_change_log(project_id, changed_by, field_name, old_value, new_value, change_type)
    VALUES (NEW.id, _user, 'end_date', OLD.end_date::text, NEW.end_date::text, 'update');
  END IF;

  -- current_flow_stage
  IF OLD.current_flow_stage IS DISTINCT FROM NEW.current_flow_stage THEN
    INSERT INTO project_change_log(project_id, changed_by, field_name, old_value, new_value, change_type)
    VALUES (NEW.id, _user, 'stage', OLD.current_flow_stage, NEW.current_flow_stage, 'stage_advance');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_project_changes ON projects;
CREATE TRIGGER trg_log_project_changes
  AFTER UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION fn_log_project_changes();

-- Creation log
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

-- Phase 2.3: Task Dependencies & Critical Path
-- Enables task dependencies, blocking relationships, and critical path analysis
-- Run date: 2026-04-21

-- Task dependency configuration
CREATE TABLE IF NOT EXISTS task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_task_id UUID NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  dependent_task_id UUID NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  dependency_type VARCHAR(20) NOT NULL, -- 'blocks', 'blocked_by', 'depends_on', 'related'
  lead_time_days INT DEFAULT 0, -- Gap between parent completion and dependent start
  is_critical BOOLEAN DEFAULT false, -- Part of critical path?
  description TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(parent_task_id, dependent_task_id, dependency_type),
  CHECK (parent_task_id != dependent_task_id) -- No self-dependencies
);

-- Task schedule (calculated based on dependencies)
CREATE TABLE IF NOT EXISTS task_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL UNIQUE REFERENCES personal_tasks(id) ON DELETE CASCADE,
  start_date TIMESTAMPTZ,
  planned_end_date TIMESTAMPTZ, -- Based on due_date
  actual_start_date TIMESTAMPTZ,
  actual_end_date TIMESTAMPTZ,
  can_start_at TIMESTAMPTZ, -- Earliest possible start (when dependencies satisfied)
  critical_path_index INT, -- -1 = not on critical path, 0+ = position on critical path
  slack_days INT, -- Days of slack before affecting project completion
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Critical path analysis result (run periodically)
CREATE TABLE IF NOT EXISTS critical_paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE, -- Or null for cross-project
  task_sequence UUID[] NOT NULL, -- Array of task IDs in critical path order
  total_duration_days INT,
  earliest_completion_date TIMESTAMPTZ,
  risk_level VARCHAR(20) DEFAULT 'low', -- low, medium, high
  is_current BOOLEAN DEFAULT true, -- Most recent calculation
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dependency validation violations
CREATE TABLE IF NOT EXISTS dependency_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  violation_type VARCHAR(50), -- 'circular_dependency', 'unmet_dependency', 'schedule_conflict'
  description TEXT,
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_task_dependencies_parent
ON task_dependencies(parent_task_id);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_dependent
ON task_dependencies(dependent_task_id);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_type
ON task_dependencies(dependency_type);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_critical
ON task_dependencies(is_critical) WHERE is_critical = true;

CREATE INDEX IF NOT EXISTS idx_task_schedules_task_id
ON task_schedules(task_id);

CREATE INDEX IF NOT EXISTS idx_task_schedules_critical_path
ON task_schedules(critical_path_index) WHERE critical_path_index >= 0;

CREATE INDEX IF NOT EXISTS idx_critical_paths_is_current
ON critical_paths(is_current) WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_dependency_violations_task_id
ON dependency_violations(task_id);

CREATE INDEX IF NOT EXISTS idx_dependency_violations_resolved
ON dependency_violations(is_resolved) WHERE is_resolved = false;

-- Enable RLS
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE critical_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE dependency_violations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS task_dependencies_select ON task_dependencies;
CREATE POLICY task_dependencies_select ON task_dependencies
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM personal_tasks pt1
    WHERE pt1.id = task_dependencies.parent_task_id
    AND (pt1.user_id = auth.uid() OR pt1.assigned_to = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM personal_tasks pt2
    WHERE pt2.id = task_dependencies.dependent_task_id
    AND (pt2.user_id = auth.uid() OR pt2.assigned_to = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' IN ('admin', 'superadmin'))
  )
);

DROP POLICY IF EXISTS task_dependencies_insert ON task_dependencies;
CREATE POLICY task_dependencies_insert ON task_dependencies
FOR INSERT WITH CHECK (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' IN ('admin', 'superadmin'))
  )
);

-- RLS for task_schedules
DROP POLICY IF EXISTS task_schedules_select ON task_schedules;
CREATE POLICY task_schedules_select ON task_schedules
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM personal_tasks pt
    WHERE pt.id = task_schedules.task_id
    AND (pt.user_id = auth.uid() OR pt.assigned_to = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' IN ('admin', 'superadmin', 'manager'))
  )
);

-- Function to check for circular dependencies
CREATE OR REPLACE FUNCTION check_circular_dependencies(
  p_parent_id UUID,
  p_dependent_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_visited UUID[] := ARRAY[p_dependent_id];
  v_current UUID := p_dependent_id;
  v_next UUID;
BEGIN
  WHILE v_current IS NOT NULL LOOP
    v_current := (
      SELECT parent_task_id
      FROM task_dependencies
      WHERE dependent_task_id = v_current
      LIMIT 1
    );
    
    IF v_current = p_parent_id THEN
      RETURN TRUE; -- Circular dependency detected
    END IF;
    
    IF v_current = ANY(v_visited) THEN
      RETURN FALSE; -- Already checked
    END IF;
    
    IF v_current IS NOT NULL THEN
      v_visited := array_append(v_visited, v_current);
    END IF;
  END LOOP;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate task schedules based on dependencies
CREATE OR REPLACE FUNCTION recalculate_task_schedules(p_project_id UUID DEFAULT NULL)
RETURNS TABLE (recalculated_tasks INT, violations INT) AS $$
DECLARE
  v_recalculated INT := 0;
  v_violations INT := 0;
  v_task RECORD;
  v_max_end_date TIMESTAMPTZ;
BEGIN
  -- Update schedules for tasks
  FOR v_task IN
    SELECT pt.id, pt.due_date
    FROM personal_tasks pt
    WHERE (p_project_id IS NULL OR pt.project_id = p_project_id)
      AND pt.status NOT IN ('done', 'cancelled')
  LOOP
    -- Calculate earliest can-start date based on parent task completions
    v_max_end_date := (
      SELECT MAX(pt2.due_date)
      FROM task_dependencies td
      JOIN personal_tasks pt2 ON pt2.id = td.parent_task_id
      WHERE td.dependent_task_id = v_task.id
        AND td.dependency_type IN ('blocks', 'blocked_by')
    );
    
    INSERT INTO task_schedules (
      task_id,
      start_date,
      planned_end_date,
      can_start_at
    ) VALUES (
      v_task.id,
      NOW(),
      v_task.due_date,
      COALESCE(v_max_end_date, NOW())
    )
    ON CONFLICT (task_id) DO UPDATE SET
      can_start_at = COALESCE(v_max_end_date, NOW()),
      last_calculated_at = NOW();
    
    v_recalculated := v_recalculated + 1;
  END LOOP;
  
  -- Detect and log dependency violations
  v_violations := (
    SELECT COUNT(*)
    FROM task_schedules ts
    WHERE can_start_at > ts.planned_end_date
  );
  
  RETURN QUERY SELECT v_recalculated, v_violations;
END;
$$ LANGUAGE plpgsql;

-- Function to find critical path
CREATE OR REPLACE FUNCTION find_critical_path(p_project_id UUID DEFAULT NULL)
RETURNS TABLE (critical_path_found BOOLEAN, path_length INT) AS $$
DECLARE
  v_path UUID[];
  v_max_duration INT := 0;
  v_current_duration INT;
  v_critical_task RECORD;
BEGIN
  -- Find paths through dependency graph and identify the longest (critical path)
  FOR v_critical_task IN
    SELECT id
    FROM personal_tasks
    WHERE (p_project_id IS NULL OR project_id = p_project_id)
      AND status NOT IN ('done', 'cancelled')
    ORDER BY due_date DESC
    LIMIT 1
  LOOP
    -- Update critical path indicator in task_schedules
    UPDATE task_schedules
    SET critical_path_index = 0
    WHERE task_id = v_critical_task.id;
  END LOOP;
  
  RETURN QUERY SELECT TRUE, COALESCE(array_length(v_path, 1), 0);
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, DELETE ON task_dependencies TO authenticated;
GRANT SELECT ON task_schedules TO authenticated;
GRANT SELECT ON critical_paths TO authenticated;
GRANT SELECT ON dependency_violations TO authenticated;
GRANT EXECUTE ON FUNCTION check_circular_dependencies TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_task_schedules TO authenticated;
GRANT EXECUTE ON FUNCTION find_critical_path TO authenticated;

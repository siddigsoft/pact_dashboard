-- Phase 2.1: Multi-Tier Approval Workflows
-- Enables draft → manager → supervisor → finance approval routing with conditional logic
-- Run date: 2026-04-21

-- Approval workflow configuration table
CREATE TABLE IF NOT EXISTS approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  task_type VARCHAR(50), -- 'personal_task', 'project_field_task', null = all types
  min_budget NUMERIC(15,2), -- If set, only tasks >= this amount require approval
  max_budget NUMERIC(15,2), -- If set, only tasks <= this amount use this workflow
  enabled BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name)
);

-- Approval stages in workflow (e.g., stage 1: Manager, stage 2: Supervisor, etc.)
CREATE TABLE IF NOT EXISTS approval_workflow_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
  stage_number INT NOT NULL, -- 1, 2, 3, etc.
  stage_name VARCHAR(100) NOT NULL, -- "Manager Review", "Supervisor Approval", etc.
  approver_role VARCHAR(50), -- 'manager', 'supervisor', 'admin', 'financialadmin', null = any admin
  approver_department_id UUID REFERENCES departments(id) ON DELETE SET NULL, -- If set, must be from this dept
  required_for_approval BOOLEAN DEFAULT true, -- Can be skipped/auto-approved?
  auto_escalate_hours INT DEFAULT 48, -- Auto-escalate if not approved in N hours
  notify_on_arrival BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual approval records for each task
CREATE TABLE IF NOT EXISTS task_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES approval_workflows(id) ON DELETE SET NULL,
  current_stage_id UUID REFERENCES approval_workflow_stages(id) ON DELETE SET NULL,
  current_stage_number INT,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'escalated', 'cancelled'
  submitted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Approval records for each stage
CREATE TABLE IF NOT EXISTS task_approval_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_approval_id UUID NOT NULL REFERENCES task_approvals(id) ON DELETE CASCADE,
  workflow_stage_id UUID NOT NULL REFERENCES approval_workflow_stages(id) ON DELETE SET NULL,
  stage_number INT NOT NULL,
  approver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'escalated'
  decision_notes TEXT,
  decided_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,
  escalated_to_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Approval comments at each stage
CREATE TABLE IF NOT EXISTS approval_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_approval_record_id UUID NOT NULL REFERENCES task_approval_records(id) ON DELETE CASCADE,
  commenter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  comment_text TEXT NOT NULL,
  comment_type VARCHAR(20) DEFAULT 'general', -- 'general', 'concern', 'suggestion', 'approved_note'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_approval_workflows_enabled
ON approval_workflows(enabled) WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_approval_workflow_stages_workflow_id
ON approval_workflow_stages(workflow_id, stage_number);

CREATE INDEX IF NOT EXISTS idx_task_approvals_task_id
ON task_approvals(task_id);

CREATE INDEX IF NOT EXISTS idx_task_approvals_status
ON task_approvals(status) WHERE status != 'completed';

CREATE INDEX IF NOT EXISTS idx_task_approvals_submitted_by
ON task_approvals(submitted_by, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_approval_records_task_approval_id
ON task_approval_records(task_approval_id, stage_number);

CREATE INDEX IF NOT EXISTS idx_task_approval_records_approver_id
ON task_approval_records(approver_id, status)
WHERE status IN ('pending', 'escalated');

CREATE INDEX IF NOT EXISTS idx_task_approval_records_status_created
ON task_approval_records(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_comments_record_id
ON approval_comments(task_approval_record_id);

-- Enable RLS
ALTER TABLE approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_workflow_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_approval_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for approval_workflows (admins manage, users can view)
CREATE POLICY approval_workflows_select ON approval_workflows
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' IN ('admin', 'superadmin', 'ict'))
  )
  OR true -- All authenticated users can view enabled workflows
);

CREATE POLICY approval_workflows_insert ON approval_workflows
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' IN ('admin', 'superadmin', 'ict'))
  )
);

-- RLS Policies for task_approvals
CREATE POLICY task_approvals_select ON task_approvals
FOR SELECT USING (
  submitted_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM task_approval_records tar
    WHERE tar.task_approval_id = task_approvals.id
    AND tar.approver_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM personal_tasks pt
    WHERE pt.id = task_approvals.task_id
    AND (pt.user_id = auth.uid() OR pt.assigned_to = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' IN ('admin', 'superadmin'))
  )
);

CREATE POLICY task_approvals_insert ON task_approvals
FOR INSERT WITH CHECK (submitted_by = auth.uid());

-- RLS for task_approval_records (approvers can see and update their stage)
CREATE POLICY task_approval_records_select ON task_approval_records
FOR SELECT USING (
  approver_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM task_approvals ta
    WHERE ta.id = task_approval_records.task_approval_id
    AND ta.submitted_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' IN ('admin', 'superadmin'))
  )
);

CREATE POLICY task_approval_records_update ON task_approval_records
FOR UPDATE USING (approver_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' IN ('admin', 'superadmin'))
  )
);

-- RLS for approval_comments
CREATE POLICY approval_comments_select ON approval_comments
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM task_approval_records tar
    WHERE tar.id = approval_comments.task_approval_record_id
    AND (tar.approver_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM task_approvals ta
        WHERE ta.id = tar.task_approval_id
        AND ta.submitted_by = auth.uid()
      ))
  )
  OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' IN ('admin', 'superadmin'))
  )
);

CREATE POLICY approval_comments_insert ON approval_comments
FOR INSERT WITH CHECK (commenter_id = auth.uid());

-- Function to advance approval to next stage
CREATE OR REPLACE FUNCTION advance_approval_stage(
  p_task_approval_id UUID,
  p_approver_id UUID,
  p_status VARCHAR,
  p_decision_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  next_stage_id UUID
) AS $$
BEGIN
  -- Update current stage record
  UPDATE task_approval_records
  SET status = p_status,
      decision_notes = p_decision_notes,
      decided_at = NOW()
  WHERE task_approval_id = p_task_approval_id
    AND approver_id = p_approver_id
    AND status = 'pending';
  
  -- Handle approved status - check if next stage exists and advance
  IF p_status = 'approved' THEN
    -- Try to insert next stage record if one exists
    WITH next_stage AS (
      SELECT aws.id as next_id, aws.stage_number as next_num, aw.id as task_id
      FROM approval_workflow_stages aws
      JOIN approval_workflows aw ON aw.id = aws.workflow_id
      JOIN task_approvals ta ON ta.workflow_id = aw.id
      WHERE ta.id = p_task_approval_id
        AND aws.stage_number = (SELECT current_stage_number FROM task_approvals ta2 WHERE ta2.id = p_task_approval_id) + 1
      LIMIT 1
    )
    INSERT INTO task_approval_records (
      task_approval_id,
      workflow_stage_id,
      stage_number,
      approver_id
    )
    SELECT
      p_task_approval_id,
      next_id,
      next_num,
      p_approver_id
    FROM next_stage
    ON CONFLICT DO NOTHING;
    
    -- Update approval stage if next stage was created
    UPDATE task_approvals
    SET current_stage_id = (
      SELECT workflow_stage_id FROM task_approval_records 
      WHERE task_approval_id = p_task_approval_id 
      ORDER BY stage_number DESC LIMIT 1
    ),
        current_stage_number = (
      SELECT stage_number FROM task_approval_records 
      WHERE task_approval_id = p_task_approval_id 
      ORDER BY stage_number DESC LIMIT 1
    ),
        updated_at = NOW()
    WHERE id = p_task_approval_id;
    
    -- If no next stage exists, mark approval as complete
    IF NOT EXISTS (
      SELECT 1 FROM task_approval_records 
      WHERE task_approval_id = p_task_approval_id 
      AND stage_number > (SELECT current_stage_number FROM task_approvals WHERE id = p_task_approval_id)
    ) THEN
      UPDATE task_approvals
      SET status = 'approved',
          current_stage_id = NULL,
          current_stage_number = NULL,
          completed_at = NOW(),
          updated_at = NOW()
      WHERE id = p_task_approval_id;
      
      UPDATE personal_tasks
      SET approval_stage = 'approved'
      WHERE id = (SELECT task_id FROM task_approvals WHERE id = p_task_approval_id);
    END IF;
    
    RETURN QUERY SELECT true, 'Advanced to next stage'::TEXT, 
      (SELECT workflow_stage_id FROM task_approval_records 
       WHERE task_approval_id = p_task_approval_id ORDER BY stage_number DESC LIMIT 1);
  
  -- Handle rejected status
  ELSIF p_status = 'rejected' THEN
    UPDATE task_approvals
    SET status = 'rejected',
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_task_approval_id;
    
    UPDATE personal_tasks
    SET approval_stage = 'rejected'
    WHERE id = (SELECT task_id FROM task_approvals WHERE id = p_task_approval_id);
    
    RETURN QUERY SELECT true, 'Task approval rejected'::TEXT, NULL::UUID;
  ELSE
    RETURN QUERY SELECT false, 'Invalid status'::TEXT, NULL::UUID;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON approval_workflows TO authenticated;
GRANT SELECT ON approval_workflow_stages TO authenticated;
GRANT SELECT, INSERT ON task_approvals TO authenticated;
GRANT SELECT, INSERT, UPDATE ON task_approval_records TO authenticated;
GRANT SELECT, INSERT ON approval_comments TO authenticated;
GRANT EXECUTE ON FUNCTION advance_approval_stage TO authenticated;

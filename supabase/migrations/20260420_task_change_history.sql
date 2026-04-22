-- Phase 1.2: Task Change Audit Trail
-- Tracks all changes to tasks for compliance, debugging, and accountability
-- Run date: 2026-04-20

-- Audit trail table
CREATE TABLE IF NOT EXISTS task_change_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  change_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_task_changes_task_id ON task_change_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_changes_changed_by ON task_change_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_task_changes_field_name ON task_change_history(field_name);
CREATE INDEX IF NOT EXISTS idx_task_changes_created_at ON task_change_history(created_at DESC);

-- Enable RLS for data privacy
ALTER TABLE task_change_history ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view history of their own tasks
CREATE POLICY task_changes_select_own ON task_change_history
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM personal_tasks pt
    WHERE pt.id = task_change_history.task_id
    AND (pt.user_id = auth.uid() OR pt.assigned_to = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' IN ('admin', 'superadmin', 'financialadmin', 'ict'))
  )
);

-- RLS Policy: Only system can insert (via service role or trigger)
CREATE POLICY task_changes_insert_system ON task_change_history
FOR INSERT WITH CHECK (true);

-- Add approval_stage column to personal_tasks if it doesn't exist
ALTER TABLE personal_tasks
ADD COLUMN IF NOT EXISTS approval_stage VARCHAR(50) DEFAULT 'none',
ADD COLUMN IF NOT EXISTS approval_notes TEXT,
ADD CONSTRAINT chk_approval_stage CHECK (approval_stage IN 
  ('none', 'submitted', 'manager_review', 'supervisor_approval', 'approved', 'rejected'));

-- Index for approval stage queries
CREATE INDEX IF NOT EXISTS idx_personal_tasks_approval_stage
ON personal_tasks(approval_stage, status)
WHERE approval_stage IS NOT NULL;

-- Trigger to log changes automatically
CREATE OR REPLACE FUNCTION log_task_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if significant fields changed
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO task_change_history (task_id, field_name, old_value, new_value, changed_by, change_reason)
    VALUES (NEW.id, 'status', OLD.status, NEW.status, auth.uid(), 'status_update');
  END IF;
  
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO task_change_history (task_id, field_name, old_value, new_value, changed_by, change_reason)
    VALUES (NEW.id, 'priority', OLD.priority, NEW.priority, auth.uid(), 'priority_update');
  END IF;
  
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO task_change_history (task_id, field_name, old_value, new_value, changed_by, change_reason)
    VALUES (NEW.id, 'assigned_to', OLD.assigned_to::text, NEW.assigned_to::text, auth.uid(), 'reassignment');
  END IF;
  
  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    INSERT INTO task_change_history (task_id, field_name, old_value, new_value, changed_by, change_reason)
    VALUES (NEW.id, 'due_date', OLD.due_date::text, NEW.due_date::text, auth.uid(), 'due_date_update');
  END IF;
  
  IF NEW.approval_stage IS DISTINCT FROM OLD.approval_stage THEN
    INSERT INTO task_change_history (task_id, field_name, old_value, new_value, changed_by, change_reason)
    VALUES (NEW.id, 'approval_stage', OLD.approval_stage, NEW.approval_stage, auth.uid(), 'approval_update');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS task_changes_trigger ON personal_tasks;
CREATE TRIGGER task_changes_trigger
AFTER UPDATE ON personal_tasks
FOR EACH ROW
EXECUTE FUNCTION log_task_changes();

-- Grant select on history table to authenticated users for their own tasks
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON task_change_history TO authenticated;

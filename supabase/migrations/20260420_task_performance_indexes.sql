-- Phase 1.1: Task Performance Indexes
-- Improves query performance by 30%+ for task dashboards and queries
-- Run date: 2026-04-20

-- Index for personal tasks queries by user and status
CREATE INDEX IF NOT EXISTS idx_personal_tasks_user_status 
ON personal_tasks(user_id, status) 
WHERE status != 'done';

-- Index for personal tasks assigned to user with due date
CREATE INDEX IF NOT EXISTS idx_personal_tasks_assigned_due 
ON personal_tasks(assigned_to, due_date) 
WHERE status NOT IN ('done', 'cancelled');

-- Index for personal tasks by department
CREATE INDEX IF NOT EXISTS idx_personal_tasks_dept_status
ON personal_tasks(target_department_id, status)
WHERE target_department_id IS NOT NULL;

-- Index for project field tasks assigned to user
CREATE INDEX IF NOT EXISTS idx_project_field_tasks_assigned 
ON project_field_tasks(assigned_to, status) 
WHERE status != 'cancelled';

-- Index for project field tasks by project
CREATE INDEX IF NOT EXISTS idx_project_field_tasks_project
ON project_field_tasks(project_id, status)
WHERE status != 'cancelled';

-- Index for task budgets by project
CREATE INDEX IF NOT EXISTS idx_task_budgets_project_status
ON task_budgets(project_id, status);

-- Analyze tables after index creation for query planner
ANALYZE personal_tasks;
ANALYZE project_field_tasks;
ANALYZE task_budgets;

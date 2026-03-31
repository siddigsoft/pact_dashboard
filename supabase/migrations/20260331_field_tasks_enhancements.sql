-- Adds timesheet, cost, dependency, and start-date columns to project_field_tasks
-- Supports: estimated/actual hours, estimated/actual cost, task dependencies, start date

ALTER TABLE project_field_tasks ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE project_field_tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(8,2);
ALTER TABLE project_field_tasks ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(8,2);
ALTER TABLE project_field_tasks ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(12,2);
ALTER TABLE project_field_tasks ADD COLUMN IF NOT EXISTS actual_cost NUMERIC(12,2);
ALTER TABLE project_field_tasks ADD COLUMN IF NOT EXISTS dependencies UUID[];

COMMENT ON COLUMN project_field_tasks.start_date IS 'Planned start date for the field task';
COMMENT ON COLUMN project_field_tasks.estimated_hours IS 'Timesheet estimate in hours';
COMMENT ON COLUMN project_field_tasks.actual_hours IS 'Actual hours logged';
COMMENT ON COLUMN project_field_tasks.estimated_cost IS 'Budgeted cost in USD';
COMMENT ON COLUMN project_field_tasks.actual_cost IS 'Actual cost incurred in USD';
COMMENT ON COLUMN project_field_tasks.dependencies IS 'Array of project_field_tasks.id values this task depends on';

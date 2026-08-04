-- =============================================================================
-- Migration: Fix crash + per-assignee hour allocation for project_field_tasks
-- Date: 2026-08-04
-- =============================================================================

-- 1. Add resources column (was missing from DB — was causing the crash).
--    This is safe to re-run; IF NOT EXISTS guards it.
ALTER TABLE project_field_tasks
  ADD COLUMN IF NOT EXISTS resources JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. Per-assignee hour allocation map.
--    Shape: { [profileId: string]: { allocated: number | null, actual: number | null } }
--    The main assignee AND every co-assignee can have their own allocated/actual hours.
--    When any entry is present the task total (estimated_hours, actual_hours) is
--    auto-computed on the client as the sum of all allocations.
ALTER TABLE project_field_tasks
  ADD COLUMN IF NOT EXISTS assignee_hours JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN project_field_tasks.resources IS
  'Array of ResourceLine objects: [{id, resourceType, name, quantity, unit, notes?}]. '
  'resourceType ∈ {people, vehicle, equipment, material, other}.';

COMMENT ON COLUMN project_field_tasks.assignee_hours IS
  'Per-person hour allocation map keyed by profile ID. '
  'Shape: { "<uuid>": { allocated: number|null, actual: number|null } }. '
  'Total estimated_hours / actual_hours are summed from this map when entries exist.';

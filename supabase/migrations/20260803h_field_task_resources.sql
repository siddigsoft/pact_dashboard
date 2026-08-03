-- =============================================================================
-- Migration: Resources column for project_field_tasks
-- Date: 2026-08-03
-- Purpose: Store a structured list of physical/human resources needed for a
--          field task (vehicles, equipment, materials, people, other).
--          Stored as a JSONB array so no extra join table is needed for this
--          lightweight feature; shape: ResourceLine[].
-- Schema:  [{ id, resourceType, name, quantity, unit, notes? }]
-- =============================================================================

ALTER TABLE project_field_tasks
  ADD COLUMN IF NOT EXISTS resources JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN project_field_tasks.resources IS
  'Array of ResourceLine objects describing physical/human resources needed for '
  'this field task. Shape: [{id, resourceType, name, quantity, unit, notes?}]. '
  'resourceType ∈ {people, vehicle, equipment, material, other}.';

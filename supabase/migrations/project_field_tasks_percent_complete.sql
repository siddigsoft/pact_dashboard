-- Add percent_complete to project_field_tasks
-- Tracks 0–100% completion so planners can see granular progress
-- rather than jumping straight from 0% to 100%.

ALTER TABLE project_field_tasks
  ADD COLUMN IF NOT EXISTS percent_complete INTEGER NOT NULL DEFAULT 0
    CHECK (percent_complete BETWEEN 0 AND 100);

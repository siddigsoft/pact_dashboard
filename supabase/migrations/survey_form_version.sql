-- Add form_version column to surveys table
-- This column tracks how many times a survey's structure has been "bumped"
-- by a coordinator to force re-submission from data collectors.
-- Existing surveys default to version 1.

ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS form_version INTEGER NOT NULL DEFAULT 1;

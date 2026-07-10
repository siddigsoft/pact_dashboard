-- =====================================================================
-- Add missing fields to project_risks
-- Reference dashboard: "Responsible Unit" + "Resolution Date"
-- Run once in Supabase SQL Editor
-- =====================================================================

ALTER TABLE project_risks
  ADD COLUMN IF NOT EXISTS responsible_unit TEXT,
  ADD COLUMN IF NOT EXISTS resolution_date  DATE;

COMMENT ON COLUMN project_risks.responsible_unit IS
  'Team / department responsible for resolving this risk (e.g. "Operations", "Logistics")';

COMMENT ON COLUMN project_risks.resolution_date IS
  'Explicit date the risk was resolved / closed (not derived from updated_at)';

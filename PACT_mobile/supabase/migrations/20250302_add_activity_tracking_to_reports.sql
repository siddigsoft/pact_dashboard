-- Add Activity Tracking Columns to Reports Table
-- This migration adds support for tracking multiple activities per visit report
-- and calculating visit fees based on activity type and details

-- Add new columns to reports table
ALTER TABLE reports
ADD COLUMN IF NOT EXISTS selected_activities TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS activity_details JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS total_visit_fees INTEGER DEFAULT 1;

-- Create index on reports for faster queries by selected_activities
CREATE INDEX IF NOT EXISTS idx_reports_selected_activities 
ON reports USING GIN(selected_activities);

-- Create index on reports for activity_details queries
CREATE INDEX IF NOT EXISTS idx_reports_activity_details 
ON reports USING GIN(activity_details);

-- Add columns to mmp_site_entries to store MMP flags from source data
ALTER TABLE mmp_site_entries
ADD COLUMN IF NOT EXISTS tool_to_be_used VARCHAR(50),
ADD COLUMN IF NOT EXISTS use_market_diversion BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS use_warehouse_monitoring BOOLEAN DEFAULT false;

-- Create indexes for MMP flag lookups
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_tool 
ON mmp_site_entries(tool_to_be_used);

CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_market_diversion 
ON mmp_site_entries(use_market_diversion);

CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_warehouse_monitoring 
ON mmp_site_entries(use_warehouse_monitoring);

-- Add comment explaining the activity_details structure
COMMENT ON COLUMN reports.activity_details IS 'JSON object storing activity-specific details:
{
  "PDM": {"questionnaires": 14, "site_visits": 2},
  "MDM": {"market_name": "Market Name", "site_visits": 2},
  "WHM": {"site_visits": 2},
  "GFA": {"site_visits": 1},
  "CBT": {"site_visits": 1}
}';

COMMENT ON COLUMN reports.selected_activities IS 'Array of selected activity types: PDM, MDM, WHM, GFA, CBT';
COMMENT ON COLUMN reports.total_visit_fees IS 'Calculated total visit fees based on selected activities and their multipliers';

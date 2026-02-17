-- MMP Cycle Close System Migration
-- Adds cycle lifecycle management and not-covered site tracking

-- 1. Add cycle_status to mmp_files table
ALTER TABLE mmp_files 
ADD COLUMN IF NOT EXISTS cycle_status TEXT DEFAULT 'active' CHECK (cycle_status IN ('active', 'closing', 'closed'));

ALTER TABLE mmp_files 
ADD COLUMN IF NOT EXISTS cycle_closed_at TIMESTAMPTZ;

ALTER TABLE mmp_files 
ADD COLUMN IF NOT EXISTS cycle_closed_by UUID;

ALTER TABLE mmp_files 
ADD COLUMN IF NOT EXISTS cycle_closing_started_at TIMESTAMPTZ;

ALTER TABLE mmp_files 
ADD COLUMN IF NOT EXISTS cycle_closing_started_by UUID;

ALTER TABLE mmp_files 
ADD COLUMN IF NOT EXISTS cycle_close_deadline TIMESTAMPTZ;

-- 2. Add not-covered tracking fields to site_visits table
ALTER TABLE site_visits 
ADD COLUMN IF NOT EXISTS not_covered_flag BOOLEAN DEFAULT FALSE;

ALTER TABLE site_visits 
ADD COLUMN IF NOT EXISTS not_covered_reason TEXT CHECK (not_covered_reason IN (
  'not_distributed',
  'cp_not_confirmed',
  'security_concerns',
  'access_denied',
  'staff_unavailable',
  'weather_disaster',
  'budget_constraints',
  'time_constraints',
  'duplicate_site',
  'other'
));

ALTER TABLE site_visits 
ADD COLUMN IF NOT EXISTS not_covered_reason_other TEXT;

ALTER TABLE site_visits 
ADD COLUMN IF NOT EXISTS not_covered_at TIMESTAMPTZ;

ALTER TABLE site_visits 
ADD COLUMN IF NOT EXISTS not_covered_by UUID;

-- 3. Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_site_visits_not_covered ON site_visits (mmp_id, not_covered_flag) WHERE not_covered_flag = TRUE;
CREATE INDEX IF NOT EXISTS idx_mmp_files_cycle_status ON mmp_files (cycle_status);

-- Migration: Restore sub_activities table and add project-plan columns to project_activities
-- Context: 20260717_project_configuration_engine.sql replaced project_activities with a
--          field-operations table (using 'title' instead of 'name') and CASCADE-dropped
--          sub_activities. This migration restores full project-plan activity support.

-- ============================================================
-- STEP 1: Add missing project-plan columns to project_activities
-- ============================================================

ALTER TABLE project_activities
  ADD COLUMN IF NOT EXISTS is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS priority    TEXT          NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high')),
  ADD COLUMN IF NOT EXISTS progress    NUMERIC(5,2)  NOT NULL DEFAULT 0
    CHECK (progress >= 0 AND progress <= 100),
  ADD COLUMN IF NOT EXISTS due_date    DATE,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_proj_activities_assigned ON project_activities(assigned_to);
CREATE INDEX IF NOT EXISTS idx_proj_activities_priority ON project_activities(priority);

-- ============================================================
-- STEP 2: Recreate sub_activities table (was CASCADE-dropped)
-- ============================================================

CREATE TABLE IF NOT EXISTS sub_activities (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id  UUID        NOT NULL REFERENCES project_activities(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  description  TEXT,
  status       TEXT        NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'assigned', 'in_progress', 'completed', 'cancelled')),
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  due_date     DATE,
  assigned_to  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_activities_activity ON sub_activities(activity_id);
CREATE INDEX IF NOT EXISTS idx_sub_activities_status  ON sub_activities(status);

-- ============================================================
-- STEP 3: RLS policies for sub_activities
-- ============================================================

ALTER TABLE sub_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "sub_activities_select_authenticated"
  ON sub_activities FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "sub_activities_insert_authenticated"
  ON sub_activities FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "sub_activities_update_authenticated"
  ON sub_activities FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "sub_activities_delete_authenticated"
  ON sub_activities FOR DELETE
  USING (auth.role() = 'authenticated');

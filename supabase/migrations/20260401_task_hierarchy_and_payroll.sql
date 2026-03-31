-- ============================================================
-- Task #10: Hierarchical Task & Daily Work System
-- ============================================================
-- Adds subtasks, department task assignment, daily recurring
-- task templates, and task-to-wallet payroll credit support.
-- ============================================================

-- 1. Extend personal_tasks with new fields
ALTER TABLE personal_tasks
  ADD COLUMN IF NOT EXISTS parent_task_id       UUID REFERENCES personal_tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS target_department_id UUID REFERENCES departments(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completion_reward_amount   NUMERIC     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS completion_reward_currency TEXT        DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS recurrence           TEXT        DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS template_id          UUID        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS daily_task_date      DATE        DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_personal_tasks_parent      ON personal_tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_personal_tasks_template    ON personal_tasks(template_id);
CREATE INDEX IF NOT EXISTS idx_personal_tasks_department  ON personal_tasks(target_department_id);

-- 2. Daily task definitions (recurring templates)
CREATE TABLE IF NOT EXISTS daily_task_definitions (
  id                       UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  title                    TEXT        NOT NULL,
  description              TEXT,
  priority                 TEXT        NOT NULL DEFAULT 'medium',
  role_targets             TEXT[]      DEFAULT '{}',
  department_id            UUID        REFERENCES departments(id) ON DELETE SET NULL,
  recurrence               TEXT        NOT NULL DEFAULT 'daily',
  reward_amount            NUMERIC     DEFAULT NULL,
  reward_currency          TEXT        DEFAULT 'USD',
  active                   BOOLEAN     NOT NULL DEFAULT true,
  created_by               UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_task_defs_dept ON daily_task_definitions(department_id);
CREATE INDEX IF NOT EXISTS idx_daily_task_defs_active ON daily_task_definitions(active);

ALTER TABLE daily_task_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_task_defs_select_auth"  ON daily_task_definitions;
CREATE POLICY "daily_task_defs_select_auth"
  ON daily_task_definitions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "daily_task_defs_write_admin" ON daily_task_definitions;
CREATE POLICY "daily_task_defs_write_admin"
  ON daily_task_definitions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND LOWER(profiles.role) IN ('super_admin', 'superadmin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND LOWER(profiles.role) IN ('super_admin', 'superadmin', 'admin')
    )
  );

-- 3. Payroll summary view (per-department per-period)
-- Admin reads wallet_transactions to summarise task rewards earned.
-- No separate table needed — the payroll panel queries this at runtime.
-- (No migration changes needed for wallets/wallet_transactions.)

-- 4. Add digest_opt_out flag to profiles so admins can disable
--    the daily task email digest for specific users
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS task_digest_opt_out BOOLEAN DEFAULT false;

COMMENT ON COLUMN personal_tasks.parent_task_id IS
  'Non-null for subtasks. Subtasks are excluded from the main My Tasks list.';
COMMENT ON COLUMN personal_tasks.target_department_id IS
  'Set when a task is bulk-assigned to an entire department.';
COMMENT ON COLUMN personal_tasks.completion_reward_amount IS
  'Optional payroll reward credited to the assignee wallet on task completion.';
COMMENT ON COLUMN personal_tasks.recurrence IS
  'none | daily | weekly — controls whether this is a recurring task materialised from a template.';
COMMENT ON COLUMN personal_tasks.template_id IS
  'Links a materialised daily task back to its daily_task_definitions source.';
COMMENT ON COLUMN personal_tasks.daily_task_date IS
  'The calendar date for which this recurring task was materialised (used for deduplication).';

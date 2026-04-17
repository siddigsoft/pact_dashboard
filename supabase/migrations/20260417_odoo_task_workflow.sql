-- Stage A+B+C task management upgrade (Odoo-style)
-- Idempotent: safe to re-run.

-- ============ STAGE A: Rich status workflow ============
ALTER TABLE personal_tasks ADD COLUMN IF NOT EXISTS on_hold_at timestamptz;
ALTER TABLE personal_tasks ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE personal_tasks ADD COLUMN IF NOT EXISTS rescheduled_at timestamptz;
ALTER TABLE personal_tasks ADD COLUMN IF NOT EXISTS rescheduled_from date;

CREATE TABLE IF NOT EXISTS task_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid REFERENCES profiles(id),
  changed_by_name text,
  reason text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_status_hist_task ON task_status_history(task_id, created_at DESC);
ALTER TABLE task_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "history_read" ON task_status_history;
DROP POLICY IF EXISTS "history_write" ON task_status_history;
CREATE POLICY "history_read"  ON task_status_history FOR SELECT USING (true);
CREATE POLICY "history_write" ON task_status_history FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- DB trigger: any status change writes history automatically
CREATE OR REPLACE FUNCTION log_personal_task_status_change()
RETURNS trigger AS $$
DECLARE
  uname text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT full_name INTO uname FROM profiles WHERE id = auth.uid();
    INSERT INTO task_status_history (task_id, from_status, to_status, changed_by, changed_by_name)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), uname);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_personal_task_status_history ON personal_tasks;
CREATE TRIGGER trg_personal_task_status_history
  AFTER UPDATE OF status ON personal_tasks
  FOR EACH ROW EXECUTE FUNCTION log_personal_task_status_change();

-- ============ STAGE B: Multi-assignee elements ============
CREATE TABLE IF NOT EXISTS task_assignee_elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  assignee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assignee_name text,
  label text NOT NULL,
  done boolean DEFAULT false,
  done_at timestamptz,
  position int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_elements_task     ON task_assignee_elements(task_id);
CREATE INDEX IF NOT EXISTS idx_elements_assignee ON task_assignee_elements(assignee_id);
ALTER TABLE task_assignee_elements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "elem_read"  ON task_assignee_elements;
DROP POLICY IF EXISTS "elem_write" ON task_assignee_elements;
CREATE POLICY "elem_read"  ON task_assignee_elements FOR SELECT USING (true);
CREATE POLICY "elem_write" ON task_assignee_elements FOR ALL USING (auth.uid() IS NOT NULL);

-- ============ STAGE C: Activity feed + rich-text body ============
ALTER TABLE personal_tasks ADD COLUMN IF NOT EXISTS description_html text;

CREATE TABLE IF NOT EXISTS task_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id),
  user_name text,
  kind text NOT NULL CHECK (kind IN ('message', 'log_note', 'whatsapp', 'activity', 'system')),
  body text,
  meta jsonb DEFAULT '{}'::jsonb,
  scheduled_for timestamptz,
  done boolean DEFAULT false,
  done_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_task ON task_activity_log(task_id, created_at DESC);
ALTER TABLE task_activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "act_read"  ON task_activity_log;
DROP POLICY IF EXISTS "act_write" ON task_activity_log;
CREATE POLICY "act_read"  ON task_activity_log FOR SELECT USING (true);
CREATE POLICY "act_write" ON task_activity_log FOR ALL USING (auth.uid() IS NOT NULL);

-- task_comments: add HTML column for rich messages
ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS content_html text;
ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS kind text DEFAULT 'message';

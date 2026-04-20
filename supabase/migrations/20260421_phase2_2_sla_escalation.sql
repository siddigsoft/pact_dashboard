-- Phase 2.2: Auto-SLA Escalation
-- Defines SLAs for different task types and auto-escalates overdue tasks
-- Run date: 2026-04-21

-- SLA configuration table
CREATE TABLE IF NOT EXISTS task_slas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  task_type VARCHAR(50), -- 'personal_task', 'project_field_task', null = all types
  priority VARCHAR(20), -- If set, only applies to this priority level (high, medium, low)
  response_time_hours INT DEFAULT 24, -- Time to respond/assign
  resolution_time_hours INT DEFAULT 72, -- Time to complete
  description TEXT,
  enabled BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Escalation rules for overdue tasks
CREATE TABLE IF NOT EXISTS escalation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sla_id UUID NOT NULL REFERENCES task_slas(id) ON DELETE CASCADE,
  escalation_level INT NOT NULL, -- 1, 2, 3, etc.
  escalation_hours INT NOT NULL, -- Hours from SLA breach to escalate (0 = immediately)
  escalate_to_role VARCHAR(50), -- 'manager', 'supervisor', 'director', 'admin'
  notify_via TEXT[] DEFAULT '{"email"}', -- ['email', 'whatsapp', 'push']
  escalation_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track actual escalations that occur
CREATE TABLE IF NOT EXISTS task_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  sla_id UUID NOT NULL REFERENCES task_slas(id) ON DELETE SET NULL,
  escalation_rule_id UUID REFERENCES escalation_rules(id) ON DELETE SET NULL,
  escalation_level INT,
  escalated_from_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Current assignee
  escalated_to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL, -- Manager/Supervisor
  escalation_reason VARCHAR(200),
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'resolved', 'cancelled'
  sla_breach_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SLA compliance history (track breaches)
CREATE TABLE IF NOT EXISTS sla_breaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  sla_id UUID NOT NULL REFERENCES task_slas(id) ON DELETE SET NULL,
  sla_type VARCHAR(20), -- 'response', 'resolution'
  due_at TIMESTAMPTZ NOT NULL,
  breached_at TIMESTAMPTZ NOT NULL,
  hours_overdue NUMERIC(10, 2),
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'recovered' (if completed before next SLA), 'cancelled'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Escalation history/audit
CREATE TABLE IF NOT EXISTS escalation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_escalation_id UUID NOT NULL REFERENCES task_escalations(id) ON DELETE CASCADE,
  action VARCHAR(50), -- 'escalated', 'reassigned', 'resolved', 'acknowledged'
  action_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_task_slas_enabled
ON task_slas(enabled) WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_task_slas_task_type
ON task_slas(task_type) WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_escalation_rules_sla_id
ON escalation_rules(sla_id, escalation_level);

CREATE INDEX IF NOT EXISTS idx_task_escalations_task_id
ON task_escalations(task_id);

CREATE INDEX IF NOT EXISTS idx_task_escalations_status
ON task_escalations(status, escalated_at DESC)
WHERE status IN ('active');

CREATE INDEX IF NOT EXISTS idx_task_escalations_escalated_to
ON task_escalations(escalated_to_user_id, status)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_sla_breaches_task_id
ON sla_breaches(task_id);

CREATE INDEX IF NOT EXISTS idx_sla_breaches_status
ON sla_breaches(status, breached_at DESC);

CREATE INDEX IF NOT EXISTS idx_escalation_history_task_escalation_id
ON escalation_history(task_escalation_id);

-- Enable RLS
ALTER TABLE task_slas ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_breaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for task_slas (admins only)
CREATE POLICY task_slas_select ON task_slas
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' IN ('admin', 'superadmin', 'ict'))
  )
  OR true -- All authenticated can see enabled SLAs
);

CREATE POLICY task_slas_write ON task_slas
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' IN ('admin', 'superadmin', 'ict'))
  )
);

-- RLS for task_escalations
CREATE POLICY task_escalations_select ON task_escalations
FOR SELECT USING (
  escalated_from_user_id = auth.uid()
  OR escalated_to_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM personal_tasks pt
    WHERE pt.id = task_escalations.task_id
    AND (pt.user_id = auth.uid() OR pt.assigned_to = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' IN ('admin', 'superadmin'))
  )
);

CREATE POLICY task_escalations_insert ON task_escalations
FOR INSERT WITH CHECK (true); -- System can insert

-- RLS for sla_breaches
CREATE POLICY sla_breaches_select ON sla_breaches
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM personal_tasks pt
    WHERE pt.id = sla_breaches.task_id
    AND (pt.user_id = auth.uid() OR pt.assigned_to = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' IN ('admin', 'superadmin', 'manager'))
  )
);

-- Function to check and create SLA breaches
CREATE OR REPLACE FUNCTION check_sla_breaches()
RETURNS TABLE (breached_tasks INT, escalated_tasks INT) AS $$
  WITH breach_insert AS (
    INSERT INTO sla_breaches (task_id, sla_id, sla_type, due_at, breached_at, hours_overdue)
    SELECT 
      pt.id,
      ts.id,
      'response',
      pt.created_at + (ts.response_time_hours * INTERVAL '1 hour'),
      NOW(),
      EXTRACT(EPOCH FROM (NOW() - pt.created_at - (ts.response_time_hours * INTERVAL '1 hour'))) / 3600
    FROM personal_tasks pt
    CROSS JOIN task_slas ts
    WHERE pt.status NOT IN ('done', 'cancelled')
      AND pt.assigned_to IS NULL
      AND pt.created_at < NOW() - INTERVAL '1 second'
      AND (ts.task_type IS NULL OR ts.task_type = 'personal_task')
      AND (ts.priority IS NULL OR ts.priority = pt.priority)
      AND ts.enabled = true
      AND (NOW() - pt.created_at) > (ts.response_time_hours * INTERVAL '1 hour')
    ON CONFLICT DO NOTHING
    RETURNING task_id
  )
  SELECT 
    (SELECT COUNT(DISTINCT task_id) FROM sla_breaches WHERE status = 'active' AND breached_at >= NOW() - INTERVAL '1 hour')::INT,
    (SELECT COUNT(*) FROM escalation_rules er
     JOIN task_slas ts ON ts.id = er.sla_id
     JOIN sla_breaches sb ON sb.sla_id = ts.id
     WHERE sb.status = 'active' AND (NOW() - sb.breached_at) > (er.escalation_hours * INTERVAL '1 hour'))::INT;
$$ LANGUAGE sql;

-- Function to escalate a task
CREATE OR REPLACE FUNCTION escalate_task(
  p_task_id UUID,
  p_escalation_rule_id UUID,
  p_escalated_to_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
  WITH insert_escalation AS (
    INSERT INTO task_escalations (
      task_id,
      sla_id,
      escalation_rule_id,
      escalation_level,
      escalated_from_user_id,
      escalated_to_user_id,
      escalation_reason,
      sla_breach_at
    )
    SELECT
      p_task_id,
      er.sla_id,
      p_escalation_rule_id,
      er.escalation_level,
      pt.assigned_to,
      p_escalated_to_user_id,
      p_reason,
      NOW()
    FROM escalation_rules er, personal_tasks pt
    WHERE er.id = p_escalation_rule_id
      AND pt.id = p_task_id
    RETURNING id
  ),
  update_task AS (
    UPDATE personal_tasks
    SET updated_at = NOW()
    WHERE id = p_task_id
    RETURNING id
  )
  SELECT (SELECT id FROM insert_escalation LIMIT 1)::UUID;
$$ LANGUAGE sql;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON task_slas TO authenticated;
GRANT SELECT ON escalation_rules TO authenticated;
GRANT SELECT, INSERT ON task_escalations TO authenticated;
GRANT SELECT ON sla_breaches TO authenticated;
GRANT SELECT, INSERT ON escalation_history TO authenticated;
GRANT EXECUTE ON FUNCTION check_sla_breaches TO authenticated;
GRANT EXECUTE ON FUNCTION escalate_task TO authenticated;

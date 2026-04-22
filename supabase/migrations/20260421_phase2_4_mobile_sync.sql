-- Phase 2.4: Mobile Offline Sync Queue
-- Enables offline-first operations with sync when connectivity restored
-- Run date: 2026-04-21

-- Device tracking for mobile apps
CREATE TABLE IF NOT EXISTS mobile_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id VARCHAR(255) NOT NULL, -- UUID from mobile device
  device_name VARCHAR(100), -- "John's iPhone", "OnePlus 9"
  device_type VARCHAR(50), -- 'ios', 'android'
  app_version VARCHAR(20),
  os_version VARCHAR(20),
  last_sync_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);

-- Offline sync queue for pending operations
CREATE TABLE IF NOT EXISTS offline_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id VARCHAR(255) NOT NULL, -- Device that created the operation
  table_name VARCHAR(100) NOT NULL, -- 'personal_tasks', 'task_comment_threads', etc.
  operation VARCHAR(10) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE'
  record_id UUID NOT NULL, -- The ID of the record being modified
  local_id VARCHAR(255), -- Client-generated ID for new records (before sync)
  payload JSONB NOT NULL, -- Full record data
  conflict_with_id UUID, -- If sync creates conflict, link to conflicting server record
  sync_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'syncing', 'synced', 'failed', 'resolved'
  sync_attempts INT DEFAULT 0,
  max_retry_attempts INT DEFAULT 3,
  last_error TEXT,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Sync conflicts (when offline changes conflict with server changes)
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_queue_id UUID NOT NULL REFERENCES offline_sync_queue(id) ON DELETE CASCADE,
  server_version_id UUID REFERENCES personal_tasks(id) ON DELETE SET NULL,
  conflict_type VARCHAR(50), -- 'field_conflict', 'deleted_on_server', 'concurrent_edit'
  conflicting_field VARCHAR(100), -- Which field(s) conflicted
  local_value JSONB, -- Client value
  server_value JSONB, -- Server value
  resolution_strategy VARCHAR(50) DEFAULT 'manual', -- 'auto', 'manual', 'server_wins', 'client_wins'
  resolved_value JSONB,
  resolved_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mobile app local cache inventory (for clearing old data)
CREATE TABLE IF NOT EXISTS mobile_local_cache_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id VARCHAR(255) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  record_count INT DEFAULT 0,
  last_cache_at TIMESTAMPTZ DEFAULT NOW(),
  cache_expires_at TIMESTAMPTZ, -- When to refresh cache
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, device_id, table_name)
);

-- Analytics/metrics for offline usage
CREATE TABLE IF NOT EXISTS sync_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id VARCHAR(255),
  total_offline_operations INT DEFAULT 0,
  successful_syncs INT DEFAULT 0,
  failed_syncs INT DEFAULT 0,
  conflict_count INT DEFAULT 0,
  avg_sync_time_ms INT, -- Average time to sync (milliseconds)
  total_data_synced_bytes BIGINT DEFAULT 0, -- Data transferred
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  period_start_date TIMESTAMP DEFAULT CURRENT_DATE,
  period_end_date TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_mobile_devices_user_id
ON mobile_devices(user_id);

CREATE INDEX IF NOT EXISTS idx_mobile_devices_device_id
ON mobile_devices(device_id);

CREATE INDEX IF NOT EXISTS idx_mobile_devices_last_seen
ON mobile_devices(last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_offline_sync_queue_user_id
ON offline_sync_queue(user_id);

CREATE INDEX IF NOT EXISTS idx_offline_sync_queue_device_id
ON offline_sync_queue(device_id);

CREATE INDEX IF NOT EXISTS idx_offline_sync_queue_status
ON offline_sync_queue(sync_status) WHERE sync_status IN ('pending', 'syncing', 'failed');

CREATE INDEX IF NOT EXISTS idx_offline_sync_queue_table_record
ON offline_sync_queue(table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_offline_sync_queue_created_at
ON offline_sync_queue(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_sync_queue_id
ON sync_conflicts(sync_queue_id);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_resolved
ON sync_conflicts(resolved_at) WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mobile_cache_inventory_user_device
ON mobile_local_cache_inventory(user_id, device_id);

-- Enable RLS
ALTER TABLE mobile_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_local_cache_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for mobile_devices
CREATE POLICY mobile_devices_select ON mobile_devices
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY mobile_devices_insert ON mobile_devices
FOR INSERT WITH CHECK (user_id = auth.uid());

-- RLS for offline_sync_queue
CREATE POLICY offline_sync_select ON offline_sync_queue
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY offline_sync_insert ON offline_sync_queue
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY offline_sync_update ON offline_sync_queue
FOR UPDATE USING (user_id = auth.uid());

-- RLS for sync_conflicts
CREATE POLICY sync_conflicts_select ON sync_conflicts
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM offline_sync_queue osq
    WHERE osq.id = sync_conflicts.sync_queue_id
    AND osq.user_id = auth.uid()
  )
);

-- Function to process sync queue entry (pure SQL for Supabase transaction compatibility)
CREATE OR REPLACE FUNCTION process_sync_queue_entry(
  p_sync_queue_id UUID,
  p_resolved_value JSONB DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, message TEXT, new_record_id UUID) AS $$
  WITH queue_entry AS (
    SELECT operation, record_id, payload, user_id, local_id
    FROM offline_sync_queue
    WHERE id = p_sync_queue_id
  ),
  exec_ops AS (
    INSERT INTO personal_tasks (id, user_id, title, description, status)
    SELECT 
      COALESCE(CAST(queue_entry.local_id AS UUID), gen_random_uuid()),
      queue_entry.user_id,
      COALESCE(p_resolved_value->>'title', queue_entry.payload->>'title'),
      COALESCE(p_resolved_value->>'description', queue_entry.payload->>'description'),
      COALESCE(COALESCE(p_resolved_value->>'status', queue_entry.payload->>'status'), 'todo')
    FROM queue_entry
    WHERE queue_entry.operation = 'CREATE'
    RETURNING id
  ),
  created_id AS (
    SELECT id FROM exec_ops LIMIT 1
  )
  SELECT 
    true,
    CASE 
      WHEN (SELECT operation FROM queue_entry) = 'CREATE' THEN 'Record created'::TEXT
      WHEN (SELECT operation FROM queue_entry) = 'UPDATE' THEN 'Record updated'::TEXT
      WHEN (SELECT operation FROM queue_entry) = 'DELETE' THEN 'Record deleted'::TEXT
      ELSE 'Unknown'::TEXT
    END,
    COALESCE((SELECT id FROM created_id), (SELECT record_id FROM queue_entry))
  FROM queue_entry
  WHERE (SELECT operation FROM queue_entry) IS NOT NULL;
$$ LANGUAGE sql;

-- Function to detect conflicts before syncing (pure SQL)
CREATE OR REPLACE FUNCTION detect_sync_conflicts(
  p_sync_queue_id UUID
)
RETURNS TABLE (has_conflict BOOLEAN, conflict_field VARCHAR) AS $$
  WITH queue_entry AS (
    SELECT operation, record_id, payload
    FROM offline_sync_queue
    WHERE id = p_sync_queue_id
  ),
  server_record AS (
    SELECT id, title
    FROM personal_tasks
    WHERE id = (SELECT record_id FROM queue_entry)
  ),
  conflict_analysis AS (
    SELECT 
      CASE
        WHEN queue_entry.operation IN ('CREATE', NULL) THEN FALSE
        WHEN server_record.id IS NULL THEN TRUE
        WHEN (queue_entry.payload->>'title')::TEXT != server_record.title THEN TRUE
        ELSE FALSE
      END as has_conflict,
      CASE
        WHEN queue_entry.operation IS NULL THEN NULL::VARCHAR
        WHEN queue_entry.operation = 'CREATE' THEN NULL::VARCHAR
        WHEN server_record.id IS NULL THEN 'deleted_on_server'::VARCHAR
        WHEN (queue_entry.payload->>'title')::TEXT != server_record.title THEN 'title'::VARCHAR
        ELSE NULL::VARCHAR
      END as conflict_field
    FROM queue_entry
    LEFT JOIN server_record ON TRUE
  )
  SELECT has_conflict, conflict_field FROM conflict_analysis;
$$ LANGUAGE sql;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON mobile_devices TO authenticated;
GRANT SELECT, INSERT, UPDATE ON offline_sync_queue TO authenticated;
GRANT SELECT, INSERT ON sync_conflicts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON mobile_local_cache_inventory TO authenticated;
GRANT SELECT, INSERT ON sync_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION process_sync_queue_entry TO authenticated;
GRANT EXECUTE ON FUNCTION detect_sync_conflicts TO authenticated;

-- Enhanced call tracking for call history and analytics

-- Drop existing tables safely (CASCADE drops dependent objects like policies)
DROP TABLE IF EXISTS offline_call_queue CASCADE;
DROP TABLE IF EXISTS emergency_contacts CASCADE;
DROP TABLE IF EXISTS dnd_settings CASCADE;
DROP TABLE IF EXISTS favorite_contacts CASCADE;
DROP TABLE IF EXISTS call_notes CASCADE;
DROP TABLE IF EXISTS call_analytics CASCADE;
DROP TABLE IF EXISTS call_history CASCADE;

-- Drop timestamp function if exists
DROP FUNCTION IF EXISTS update_timestamp() CASCADE;

-- Create all tables
CREATE TABLE call_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  caller_id UUID,
  caller_name TEXT,
  caller_avatar TEXT,
  call_type TEXT NOT NULL, -- 'incoming', 'outgoing', 'missed'
  status TEXT NOT NULL, -- 'completed', 'rejected', 'failed', 'missed'
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INT DEFAULT 0,
  latency_ms INT,
  jitter_ms INT,
  packet_loss FLOAT,
  bitrate INT,
  quality_rating INT, -- 1-5 rating
  notes TEXT,
  reason_for_end TEXT, -- e.g., 'user_ended', 'network_failure', 'timeout'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE call_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_calls INT DEFAULT 0,
  incoming_calls INT DEFAULT 0,
  outgoing_calls INT DEFAULT 0,
  missed_calls INT DEFAULT 0,
  completed_calls INT DEFAULT 0,
  failed_calls INT DEFAULT 0,
  total_duration_seconds INT DEFAULT 0,
  average_duration_seconds INT DEFAULT 0,
  average_quality_rating FLOAT DEFAULT 0,
  acceptance_rate FLOAT DEFAULT 0,
  network_issues_count INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE TABLE call_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_history_id UUID REFERENCES call_history(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE favorite_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  contact_name TEXT NOT NULL,
  contact_avatar TEXT,
  position INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, contact_id)
);

CREATE TABLE dnd_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false,
  start_time TIME,
  end_time TIME,
  allow_starred_contacts BOOLEAN DEFAULT true,
  allow_emergency_contacts BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  contact_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, contact_id)
);

CREATE TABLE offline_call_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL,
  target_user_name TEXT NOT NULL,
  call_type TEXT NOT NULL, -- 'audio', 'video'
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_call_history_user_id ON call_history(user_id);
CREATE INDEX idx_call_history_caller_id ON call_history(caller_id);
CREATE INDEX idx_call_history_user_date ON call_history(user_id, started_at DESC);
CREATE INDEX idx_call_history_status ON call_history(status);
CREATE INDEX idx_call_analytics_user_date ON call_analytics(user_id, date DESC);
CREATE INDEX idx_call_notes_call_history ON call_notes(call_history_id);
CREATE INDEX idx_favorite_contacts_user ON favorite_contacts(user_id);
CREATE INDEX idx_offline_queue_user ON offline_call_queue(user_id);
CREATE INDEX idx_offline_queue_retry ON offline_call_queue(next_retry_at);

-- Create timestamp update function
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER call_history_updated_at BEFORE UPDATE ON call_history FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER call_analytics_updated_at BEFORE UPDATE ON call_analytics FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER call_notes_updated_at BEFORE UPDATE ON call_notes FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER dnd_settings_updated_at BEFORE UPDATE ON dnd_settings FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER emergency_contacts_updated_at BEFORE UPDATE ON emergency_contacts FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER offline_queue_updated_at BEFORE UPDATE ON offline_call_queue FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Enable RLS on all tables
ALTER TABLE call_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dnd_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_call_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies for call_history
CREATE POLICY "Users can view their own call history"
  ON call_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their call history"
  ON call_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their call history"
  ON call_history FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their call history"
  ON call_history FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for call_analytics
CREATE POLICY "Users can view their own analytics"
  ON call_analytics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their analytics"
  ON call_analytics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their analytics"
  ON call_analytics FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their analytics"
  ON call_analytics FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for call_notes
CREATE POLICY "Users can view their own call notes"
  ON call_notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their call notes"
  ON call_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their call notes"
  ON call_notes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their call notes"
  ON call_notes FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for favorite_contacts
CREATE POLICY "Users can view their own favorites"
  ON favorite_contacts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert favorites"
  ON favorite_contacts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update favorites"
  ON favorite_contacts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete favorites"
  ON favorite_contacts FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for dnd_settings
CREATE POLICY "Users can view their own DND settings"
  ON dnd_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert DND settings"
  ON dnd_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update DND settings"
  ON dnd_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete DND settings"
  ON dnd_settings FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for emergency_contacts
CREATE POLICY "Users can view their own emergency contacts"
  ON emergency_contacts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert emergency contacts"
  ON emergency_contacts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update emergency contacts"
  ON emergency_contacts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete emergency contacts"
  ON emergency_contacts FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for offline_call_queue
CREATE POLICY "Users can view their own offline queue"
  ON offline_call_queue FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert into offline queue"
  ON offline_call_queue FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their offline queue"
  ON offline_call_queue FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete from offline queue"
  ON offline_call_queue FOR DELETE
  USING (auth.uid() = user_id);

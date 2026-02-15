-- Create call_logs table for persisting WebRTC call history
CREATE TABLE IF NOT EXISTS call_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  caller_id uuid NOT NULL REFERENCES profiles(id),
  callee_id uuid NOT NULL REFERENCES profiles(id),
  direction text NOT NULL CHECK (direction IN ('outgoing', 'incoming')),
  status text NOT NULL CHECK (status IN ('completed', 'missed', 'rejected', 'no_answer')),
  duration integer DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  call_type text DEFAULT 'audio' CHECK (call_type IN ('audio', 'video')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_caller ON call_logs(caller_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_callee ON call_logs(callee_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_started_at ON call_logs(started_at DESC);

ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own call logs" ON call_logs
  FOR SELECT USING (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE POLICY "Users can insert call logs" ON call_logs
  FOR INSERT WITH CHECK (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE POLICY "Users can update their own call logs" ON call_logs
  FOR UPDATE USING (auth.uid() = caller_id OR auth.uid() = callee_id);

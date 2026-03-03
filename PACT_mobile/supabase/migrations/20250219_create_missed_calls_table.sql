-- Create missed_calls table for tracking missed/rejected calls
CREATE TABLE IF NOT EXISTS missed_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  caller_id UUID NOT NULL,
  caller_name TEXT NOT NULL,
  caller_avatar TEXT,
  missed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  cleared_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_missed_calls_user_id ON missed_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_missed_calls_caller_id ON missed_calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_missed_calls_user_cleared ON missed_calls(user_id, cleared_at);
CREATE INDEX IF NOT EXISTS idx_missed_calls_missed_at ON missed_calls(missed_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE missed_calls ENABLE ROW LEVEL SECURITY;

-- Create RLS policy: Users can only see their own missed calls
CREATE POLICY "Users can view their own missed calls"
  ON missed_calls FOR SELECT
  USING (auth.uid() = user_id);

-- Create RLS policy: Users can only modify their own missed calls
CREATE POLICY "Users can manage their own missed calls"
  ON missed_calls FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create RLS policy: Only the system/trigger can insert missed calls
CREATE POLICY "System can insert missed calls"
  ON missed_calls FOR INSERT
  WITH CHECK (TRUE);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_missed_calls_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER missed_calls_updated_at_trigger
  BEFORE UPDATE ON missed_calls
  FOR EACH ROW
  EXECUTE FUNCTION update_missed_calls_updated_at();

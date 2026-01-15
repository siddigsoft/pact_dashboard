-- Create location_logs table for GPS tracking
CREATE TABLE IF NOT EXISTS location_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id UUID REFERENCES site_visits(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy DOUBLE PRECISION,
    speed DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    altitude DOUBLE PRECISION,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_location_logs_visit_id ON location_logs(visit_id);
CREATE INDEX IF NOT EXISTS idx_location_logs_user_id ON location_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_location_logs_timestamp ON location_logs(timestamp);

-- Enable Row Level Security
ALTER TABLE location_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for location_logs
CREATE POLICY "Users can view their own location logs"
    ON location_logs FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own location logs"
    ON location_logs FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view location logs for their visits"
    ON location_logs FOR SELECT
    USING (
        visit_id IN (
            SELECT id FROM site_visits 
            WHERE assigned_to = auth.uid()
        )
    );

-- Add comments for documentation
COMMENT ON TABLE location_logs IS 'GPS location tracking data for field operations';
COMMENT ON COLUMN location_logs.visit_id IS 'Reference to the site visit being tracked';
COMMENT ON COLUMN location_logs.user_id IS 'User who generated this location log';
COMMENT ON COLUMN location_logs.accuracy IS 'GPS accuracy in meters';
COMMENT ON COLUMN location_logs.speed IS 'Speed in meters per second';
COMMENT ON COLUMN location_logs.heading IS 'Direction of travel in degrees';
COMMENT ON COLUMN location_logs.altitude IS 'Altitude in meters above sea level';

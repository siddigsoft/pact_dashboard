-- Create comprehensive monitoring checklists table
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS comprehensive_monitoring_checklists (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Enumerator & Site Details
    enumerator_name TEXT NOT NULL,
    enumerator_contact TEXT NOT NULL,
    team_leader TEXT NOT NULL,
    
    -- Site Information
    location_hub TEXT NOT NULL,
    site_name_id TEXT NOT NULL,
    visit_date TIMESTAMPTZ NOT NULL,
    visit_time TEXT NOT NULL,
    activities_monitored TEXT[] NOT NULL, -- Array of: AM, DM, PDM, MDM, PHL
    
    -- Activity Monitoring (AM)
    activity_monitoring JSONB DEFAULT '{}', -- question -> answer
    activity_priorities JSONB DEFAULT '{}', -- question -> priority (Low/Med/High)
    activity_photos TEXT[] DEFAULT '{}', -- Array of photo URLs
    
    -- Distribution Monitoring (DM)
    distribution_monitoring JSONB DEFAULT '{}',
    distribution_photos TEXT[] DEFAULT '{}',
    
    -- Post-Distribution Monitoring (PDM)
    post_distribution_monitoring JSONB DEFAULT '{}',
    post_distribution_photos TEXT[] DEFAULT '{}',
    
    -- Post-Harvest Loss (PHL)
    post_harvest_loss JSONB DEFAULT '{}',
    post_harvest_photos TEXT[] DEFAULT '{}',
    
    -- Market Diversion Monitoring (MDM)
    market_diversion_monitoring JSONB DEFAULT '{}',
    market_diversion_photos TEXT[] DEFAULT '{}',
    
    -- Additional data
    additional_notes TEXT DEFAULT '',
    is_synced BOOLEAN DEFAULT TRUE,
    last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_comprehensive_monitoring_user_id 
    ON comprehensive_monitoring_checklists(user_id);
CREATE INDEX IF NOT EXISTS idx_comprehensive_monitoring_created_at 
    ON comprehensive_monitoring_checklists(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comprehensive_monitoring_visit_date 
    ON comprehensive_monitoring_checklists(visit_date DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE comprehensive_monitoring_checklists ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can insert their own checklists
CREATE POLICY "Users can insert own checklists"
    ON comprehensive_monitoring_checklists
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Users can view their own checklists
CREATE POLICY "Users can view own checklists"
    ON comprehensive_monitoring_checklists
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Users can update their own checklists
CREATE POLICY "Users can update own checklists"
    ON comprehensive_monitoring_checklists
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own checklists
CREATE POLICY "Users can delete own checklists"
    ON comprehensive_monitoring_checklists
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Admins can view all checklists
CREATE POLICY "Admins can view all checklists"
    ON comprehensive_monitoring_checklists
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'supervisor', 'coordinator')
        )
    );

-- Create storage bucket for monitoring photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('monitoring_photos', 'monitoring_photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for monitoring_photos bucket
-- Users can upload their own photos
CREATE POLICY "Users can upload own monitoring photos"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'monitoring_photos' 
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Users can view their own photos
CREATE POLICY "Users can view own monitoring photos"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'monitoring_photos'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Admins can view all photos
CREATE POLICY "Admins can view all monitoring photos"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'monitoring_photos'
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'supervisor', 'coordinator')
        )
    );

-- Users can delete their own photos
CREATE POLICY "Users can delete own monitoring photos"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'monitoring_photos'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

COMMENT ON TABLE comprehensive_monitoring_checklists IS 'Stores comprehensive monitoring forms with AM, DM, PDM, PHL, and MDM sections';
COMMENT ON COLUMN comprehensive_monitoring_checklists.activities_monitored IS 'Array of monitored activities: AM, DM, PDM, MDM, PHL';
COMMENT ON COLUMN comprehensive_monitoring_checklists.activity_priorities IS 'Priority levels (Low/Med/High) for each observation';

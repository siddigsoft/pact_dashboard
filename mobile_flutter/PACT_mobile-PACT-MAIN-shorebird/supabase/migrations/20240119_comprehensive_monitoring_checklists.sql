-- Create comprehensive monitoring checklists table
-- This table stores all monitoring activities: AM, DM, PDM, PHL, MDM
CREATE TABLE IF NOT EXISTS comprehensive_monitoring_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Enumerator Information
    enumerator_name TEXT NOT NULL,
    enumerator_phone TEXT,
    
    -- Site Information
    gps_coordinates TEXT,
    district TEXT NOT NULL,
    sub_county TEXT NOT NULL,
    parish TEXT NOT NULL,
    village TEXT NOT NULL,
    site_code TEXT NOT NULL,
    visit_date TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Activity Selection (which activities were performed)
    activity_am BOOLEAN DEFAULT FALSE,
    activity_dm BOOLEAN DEFAULT FALSE,
    activity_pdm BOOLEAN DEFAULT FALSE,
    activity_phl BOOLEAN DEFAULT FALSE,
    activity_mdm BOOLEAN DEFAULT FALSE,
    
    -- Activity Monitoring (AM) Responses - JSONB for flexibility
    am_responses JSONB DEFAULT '{}',
    
    -- Distribution Monitoring (DM) Responses
    dm_responses JSONB DEFAULT '{}',
    
    -- Post-Distribution Monitoring (PDM) Responses
    pdm_responses JSONB DEFAULT '{}',
    
    -- Post-Harvest Loss (PHL) Responses
    phl_responses JSONB DEFAULT '{}',
    
    -- Market Diversion Monitoring (MDM) Responses
    mdm_responses JSONB DEFAULT '{}',
    
    -- Photo URLs (array of strings)
    photo_urls TEXT[] DEFAULT '{}',
    
    -- Sync metadata
    is_synced BOOLEAN DEFAULT TRUE,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_comprehensive_monitoring_user_id 
    ON comprehensive_monitoring_checklists(user_id);
    
CREATE INDEX IF NOT EXISTS idx_comprehensive_monitoring_visit_date 
    ON comprehensive_monitoring_checklists(visit_date);
    
CREATE INDEX IF NOT EXISTS idx_comprehensive_monitoring_district 
    ON comprehensive_monitoring_checklists(district);
    
CREATE INDEX IF NOT EXISTS idx_comprehensive_monitoring_submitted_at 
    ON comprehensive_monitoring_checklists(submitted_at);

CREATE INDEX IF NOT EXISTS idx_comprehensive_monitoring_site_code 
    ON comprehensive_monitoring_checklists(site_code);

-- Enable Row Level Security
ALTER TABLE comprehensive_monitoring_checklists ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own monitoring forms"
    ON comprehensive_monitoring_checklists
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own monitoring forms"
    ON comprehensive_monitoring_checklists
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own monitoring forms"
    ON comprehensive_monitoring_checklists
    FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own monitoring forms"
    ON comprehensive_monitoring_checklists
    FOR DELETE
    USING (user_id = auth.uid());

CREATE POLICY "Admins can view all monitoring forms"
    ON comprehensive_monitoring_checklists
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role IN ('admin', 'supervisor', 'coordinator')
        )
    );

CREATE POLICY "Supervisors can view all monitoring forms"
    ON comprehensive_monitoring_checklists
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'supervisor', 'coordinator')
        )
    );

-- Create storage bucket for monitoring photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('monitoring_photos', 'monitoring_photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies for monitoring_photos bucket
CREATE POLICY "Users can upload their monitoring photos"
    ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'monitoring_photos'
        AND (storage.foldername(name))[1] = 'monitoring_photos'
    );

CREATE POLICY "Users can view their monitoring photos"
    ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'monitoring_photos'
    );

CREATE POLICY "Users can update their monitoring photos"
    ON storage.objects
    FOR UPDATE
    USING (
        bucket_id = 'monitoring_photos'
    );

CREATE POLICY "Users can delete their monitoring photos"
    ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'monitoring_photos'
    );

-- Create trigger to auto-update last_modified timestamp
CREATE OR REPLACE FUNCTION update_comprehensive_monitoring_last_modified()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_modified = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comprehensive_monitoring_last_modified_trigger 
    ON comprehensive_monitoring_checklists;

CREATE TRIGGER comprehensive_monitoring_last_modified_trigger
    BEFORE UPDATE ON comprehensive_monitoring_checklists
    FOR EACH ROW
    EXECUTE FUNCTION update_comprehensive_monitoring_last_modified();

-- Add comments for documentation
COMMENT ON TABLE comprehensive_monitoring_checklists IS 'Stores comprehensive monitoring forms with multiple activity types (AM, DM, PDM, PHL, MDM)';
COMMENT ON COLUMN comprehensive_monitoring_checklists.am_responses IS 'Activity Monitoring responses in JSON format';
COMMENT ON COLUMN comprehensive_monitoring_checklists.dm_responses IS 'Distribution Monitoring responses in JSON format';
COMMENT ON COLUMN comprehensive_monitoring_checklists.pdm_responses IS 'Post-Distribution Monitoring responses in JSON format';
COMMENT ON COLUMN comprehensive_monitoring_checklists.phl_responses IS 'Post-Harvest Loss responses in JSON format';
COMMENT ON COLUMN comprehensive_monitoring_checklists.mdm_responses IS 'Market Diversion Monitoring responses in JSON format';
COMMENT ON COLUMN comprehensive_monitoring_checklists.photo_urls IS 'Array of photo URLs uploaded to monitoring_photos bucket';
COMMENT ON COLUMN comprehensive_monitoring_checklists.is_synced IS 'Indicates if form was submitted online or synced from offline';

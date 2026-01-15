-- Create reports table for field operation reports
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_visit_id UUID REFERENCES site_visits(id) ON DELETE CASCADE,
    notes TEXT NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    is_synced BOOLEAN DEFAULT TRUE,
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create report_photos table for report photo attachments
CREATE TABLE IF NOT EXISTS report_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    is_synced BOOLEAN DEFAULT TRUE,
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_reports_site_visit_id ON reports(site_visit_id);
CREATE INDEX IF NOT EXISTS idx_reports_submitted_at ON reports(submitted_at);
CREATE INDEX IF NOT EXISTS idx_report_photos_report_id ON report_photos(report_id);

-- Enable Row Level Security
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_photos ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for reports
CREATE POLICY "Users can view reports for their assigned visits"
    ON reports FOR SELECT
    USING (
        site_visit_id IN (
            SELECT id FROM site_visits 
            WHERE assigned_to = auth.uid()
        )
    );

CREATE POLICY "Users can create reports for their assigned visits"
    ON reports FOR INSERT
    WITH CHECK (
        site_visit_id IN (
            SELECT id FROM site_visits 
            WHERE assigned_to = auth.uid()
        )
    );

CREATE POLICY "Users can update their own reports"
    ON reports FOR UPDATE
    USING (
        site_visit_id IN (
            SELECT id FROM site_visits 
            WHERE assigned_to = auth.uid()
        )
    );

-- Create RLS policies for report_photos
CREATE POLICY "Users can view photos for their reports"
    ON report_photos FOR SELECT
    USING (
        report_id IN (
            SELECT id FROM reports 
            WHERE site_visit_id IN (
                SELECT id FROM site_visits 
                WHERE assigned_to = auth.uid()
            )
        )
    );

CREATE POLICY "Users can add photos to their reports"
    ON report_photos FOR INSERT
    WITH CHECK (
        report_id IN (
            SELECT id FROM reports 
            WHERE site_visit_id IN (
                SELECT id FROM site_visits 
                WHERE assigned_to = auth.uid()
            )
        )
    );

CREATE POLICY "Users can delete photos from their reports"
    ON report_photos FOR DELETE
    USING (
        report_id IN (
            SELECT id FROM reports 
            WHERE site_visit_id IN (
                SELECT id FROM site_visits 
                WHERE assigned_to = auth.uid()
            )
        )
    );

-- Add comments for documentation
COMMENT ON TABLE reports IS 'Field operation reports submitted by workers';
COMMENT ON TABLE report_photos IS 'Photo attachments for field operation reports';
COMMENT ON COLUMN reports.site_visit_id IS 'Reference to the site visit this report is for';
COMMENT ON COLUMN reports.is_synced IS 'Indicates if this report was created online or synced from offline';
